/**
 * Correlation Engine — Enterprise-Hardened
 *
 * Computes cross-artifact correlations using a time-indexed sliding window.
 * Complexity: O(n × W) where W = max temporal window, instead of O(n²).
 *
 * Features:
 *   - Sliding window event pairing (no O(n²) full cross product)
 *   - Graph explosion cap (MAX_CORRELATIONS_PER_CASE)
 *   - Batched DB persistence (chunks of 100)
 *   - Deterministic output for forensic reproducibility
 *
 * @version 1.0.0
 */

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ENGINE_VERSION = '1.0.0';

/** Temporal thresholds per event type (milliseconds) */
const TEMPORAL_THRESHOLDS: Record<string, number> = {
    AUTHENTICATION: 2 * 60 * 1000,
    FILE: 10 * 60 * 1000,
    NETWORK: 1 * 60 * 1000,
    USB: 5 * 60 * 1000,
    REGISTRY: 5 * 60 * 1000,
    PROCESS: 3 * 60 * 1000,
    SYSTEM: 10 * 60 * 1000,
};

/** Maximum temporal window (used as the default when types are unknown) */
const DEFAULT_THRESHOLD = 5 * 60 * 1000;

/** Max correlations to persist per case (graph explosion guard) */
const MAX_CORRELATIONS_PER_CASE = 50_000;

/** Batch size for DB upserts */
const UPSERT_BATCH_SIZE = 100;

/** Minimum score to persist a correlation */
const MIN_SCORE_THRESHOLD = 20;

export interface GraphNode {
    id: string;
    type: string;
    label: string;
    weight: number;
}

export interface GraphEdge {
    source: string;
    target: string;
    weight: number;
    reason: string;
}

export interface CorrelationGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    totalEdges: number;
    maxWeight: number;
}

@Injectable()
export class CorrelationService {
    private readonly logger = new Logger(CorrelationService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Run the full correlation engine for a case.
     * Uses time-indexed sliding window — O(n × W) instead of O(n²).
     */
    async computeCorrelations(caseId: string): Promise<{ computed: number }> {
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        this.logger.log(`Computing correlations for case ${caseId}`);

        const [artifacts, events] = await Promise.all([
            this.prisma.artifact.findMany({ where: { caseId }, orderBy: { extractedAt: 'asc' } }),
            this.prisma.timelineEvent.findMany({ where: { caseId }, orderBy: { timestamp: 'asc' } }),
        ]);

        const correlations: Array<{
            sourceId: string;
            sourceType: string;
            sourceLabel: string;
            targetId: string;
            targetType: string;
            targetLabel: string;
            temporalScore: number;
            actorScore: number;
            targetScore: number;
            diversityScore: number;
            weight: number;
            reason: string;
        }> = [];

        // ── 1. Event-to-event: SLIDING WINDOW ──────────────────────────
        // Events are already sorted by timestamp. For each event[i],
        // only compare with event[j] where j > i AND timestamp[j] - timestamp[i] <= maxThreshold.
        // Break inner loop as soon as we exceed the window.
        const maxThreshold = Math.max(...Object.values(TEMPORAL_THRESHOLDS), DEFAULT_THRESHOLD);

        for (let i = 0; i < events.length && correlations.length < MAX_CORRELATIONS_PER_CASE; i++) {
            const a = events[i];
            const aTime = new Date(a.timestamp).getTime();

            for (let j = i + 1; j < events.length; j++) {
                const b = events[j];
                const bTime = new Date(b.timestamp).getTime();

                // Sliding window: if b is beyond max threshold, all subsequent events are too
                if (bTime - aTime > maxThreshold) break;

                const scores = this.scoreEventPair(a, b);
                if (scores.total < MIN_SCORE_THRESHOLD) continue;

                correlations.push({
                    sourceId: a.id,
                    sourceType: 'timeline_event',
                    sourceLabel: `[${a.type}] ${(a.description || '').slice(0, 60)}`,
                    targetId: b.id,
                    targetType: 'timeline_event',
                    targetLabel: `[${b.type}] ${(b.description || '').slice(0, 60)}`,
                    temporalScore: scores.temporal,
                    actorScore: scores.actor,
                    targetScore: scores.target,
                    diversityScore: scores.diversity,
                    weight: parseFloat((scores.total / 100).toFixed(4)),
                    reason: scores.reason,
                });

                if (correlations.length >= MAX_CORRELATIONS_PER_CASE) break;
            }
        }

        // ── 2. Artifact-to-event: time-sorted binary search ──────────────
        // For each artifact, use binary search to find events within temporal window.
        for (const artifact of artifacts) {
            if (correlations.length >= MAX_CORRELATIONS_PER_CASE) break;

            const artTime = new Date(artifact.extractedAt).getTime();
            // Binary search for the start of the window
            let lo = 0, hi = events.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (new Date(events[mid].timestamp).getTime() < artTime - maxThreshold) lo = mid + 1;
                else hi = mid;
            }

            for (let j = lo; j < events.length; j++) {
                const event = events[j];
                const evTime = new Date(event.timestamp).getTime();
                if (evTime > artTime + maxThreshold) break; // past window

                const scores = this.scoreArtifactToEvent(artifact, event);
                if (scores.total < MIN_SCORE_THRESHOLD) continue;

                correlations.push({
                    sourceId: artifact.id,
                    sourceType: 'artifact',
                    sourceLabel: `[${artifact.type}] ${artifact.source}`,
                    targetId: event.id,
                    targetType: 'timeline_event',
                    targetLabel: `[${event.type}] ${(event.description || '').slice(0, 60)}`,
                    temporalScore: scores.temporal,
                    actorScore: scores.actor,
                    targetScore: scores.target,
                    diversityScore: scores.diversity,
                    weight: parseFloat((scores.total / 100).toFixed(4)),
                    reason: scores.reason,
                });

                if (correlations.length >= MAX_CORRELATIONS_PER_CASE) break;
            }
        }

        // ── Persist in batches ────────────────────────────────────────────
        let persisted = 0;
        for (let i = 0; i < correlations.length; i += UPSERT_BATCH_SIZE) {
            const batch = correlations.slice(i, i + UPSERT_BATCH_SIZE);
            await Promise.all(
                batch.map((c) =>
                    this.prisma.correlation.upsert({
                        where: { caseId_sourceId_targetId: { caseId, sourceId: c.sourceId, targetId: c.targetId } },
                        update: {
                            weight: c.weight,
                            temporalScore: c.temporalScore,
                            actorScore: c.actorScore,
                            targetScore: c.targetScore,
                            diversityScore: c.diversityScore,
                            reason: c.reason,
                            sourceLabel: c.sourceLabel,
                            targetLabel: c.targetLabel,
                        },
                        create: {
                            id: uuidv4(),
                            caseId,
                            ...c,
                        },
                    }),
                ),
            );
            persisted += batch.length;
        }

        this.logger.log(`Persisted ${persisted} correlations for case ${caseId}`);
        return { computed: persisted };
    }

    /**
     * Build the graph model for a case.
     */
    async buildGraph(caseId: string): Promise<CorrelationGraph> {
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        const rawCorrelations = await this.prisma.correlation.findMany({
            where: { caseId },
            orderBy: { weight: 'desc' },
            take: 10_000, // Cap graph size for UI rendering
        });

        if (rawCorrelations.length === 0) {
            return { nodes: [], edges: [], totalEdges: 0, maxWeight: 0 };
        }

        const nodeMap = new Map<string, GraphNode>();
        let maxWeight = 0;

        for (const c of rawCorrelations) {
            if (c.weight > maxWeight) maxWeight = c.weight;

            if (!nodeMap.has(c.sourceId)) {
                nodeMap.set(c.sourceId, { id: c.sourceId, type: c.sourceType, label: c.sourceLabel, weight: 0 });
            }
            if (!nodeMap.has(c.targetId)) {
                nodeMap.set(c.targetId, { id: c.targetId, type: c.targetType, label: c.targetLabel, weight: 0 });
            }

            nodeMap.get(c.sourceId)!.weight += c.weight;
            nodeMap.get(c.targetId)!.weight += c.weight;
        }

        const nodes = Array.from(nodeMap.values());
        if (nodes.length > 0) {
            const maxNodeWeight = Math.max(...nodes.map((n) => n.weight));
            if (maxNodeWeight > 0) {
                nodes.forEach((n) => {
                    n.weight = parseFloat((n.weight / maxNodeWeight).toFixed(4));
                });
            }
        }

        const edges: GraphEdge[] = rawCorrelations.map((c) => ({
            source: c.sourceId,
            target: c.targetId,
            weight: maxWeight > 0 ? parseFloat((c.weight / maxWeight).toFixed(4)) : 0,
            reason: c.reason,
        }));

        return { nodes, edges, totalEdges: edges.length, maxWeight };
    }

    // ──────────────────────────────────────────────────────────────
    // SCORING ALGORITHMS
    // ──────────────────────────────────────────────────────────────

    private scoreEventPair(
        a: any,
        b: any,
    ): { total: number; temporal: number; actor: number; target: number; diversity: number; reason: string } {
        const reasons: string[] = [];

        const timeDiff = Math.abs(
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        const threshold = Math.max(
            TEMPORAL_THRESHOLDS[a.type] ?? DEFAULT_THRESHOLD,
            TEMPORAL_THRESHOLDS[b.type] ?? DEFAULT_THRESHOLD,
        );
        const temporal = timeDiff <= threshold
            ? Math.round(40 * (1 - timeDiff / threshold))
            : 0;
        if (temporal > 0) reasons.push(`temporal proximity (${Math.round(timeDiff / 1000)}s apart)`);

        const actorA = (a.actor ?? '').toLowerCase();
        const actorB = (b.actor ?? '').toLowerCase();
        const actor = actorA && actorB && actorA === actorB ? 30 : 0;
        if (actor > 0) reasons.push(`shared actor "${a.actor}"`);

        const targetA = (a.targetObject ?? '').toLowerCase();
        const targetB = (b.targetObject ?? '').toLowerCase();
        const target =
            targetA && targetB && (targetA === targetB || targetA.includes(targetB) || targetB.includes(targetA))
                ? 20
                : 0;
        if (target > 0) reasons.push(`overlapping target "${a.targetObject}"`);

        const diversity = a.type !== b.type ? 10 : 0;
        if (diversity > 0) reasons.push(`cross-type correlation (${a.type} ↔ ${b.type})`);

        const total = temporal + actor + target + diversity;
        return { total, temporal, actor, target, diversity, reason: reasons.join('; ') || 'weak correlation' };
    }

    private scoreArtifactToEvent(
        artifact: any,
        event: any,
    ): { total: number; temporal: number; actor: number; target: number; diversity: number; reason: string } {
        const reasons: string[] = [];

        const timeDiff = Math.abs(
            new Date(artifact.extractedAt).getTime() - new Date(event.timestamp).getTime(),
        );
        const threshold = TEMPORAL_THRESHOLDS[event.type] ?? DEFAULT_THRESHOLD * 2;
        const temporal = timeDiff <= threshold ? Math.round(40 * (1 - timeDiff / threshold)) : 0;
        if (temporal > 0) reasons.push(`artifact extracted near event time`);

        const artifactDataStr = JSON.stringify(artifact.data ?? '').toLowerCase();
        const eventActor = (event.actor ?? '').toLowerCase();
        const actor = eventActor && artifactDataStr.includes(eventActor) ? 30 : 0;
        if (actor > 0) reasons.push(`artifact data mentions event actor "${event.actor}"`);

        const eventTarget = (event.targetObject ?? '').toLowerCase();
        const target = eventTarget && artifactDataStr.includes(eventTarget) ? 20 : 0;
        if (target > 0) reasons.push(`artifact references event target`);

        const diversity = artifact.type !== event.type ? 10 : 0;
        if (diversity > 0) reasons.push(`cross-source correlation (${artifact.type} ↔ ${event.type})`);

        const total = temporal + actor + target + diversity;
        return { total, temporal, actor, target, diversity, reason: reasons.join('; ') || 'weak correlation' };
    }
}

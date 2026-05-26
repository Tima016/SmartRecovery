import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TimelineEventType } from '@prisma/client';
import { TimelineFilterDto, CreateTimelineEventDto } from './dto/timeline.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TimelineService {
    constructor(private readonly prisma: PrismaService) { }

    async getTimeline(caseId: string, filters: TimelineFilterDto = {}) {
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        const where: any = { caseId };
        if (filters.type) where.type = filters.type;
        if (filters.source) where.source = { contains: filters.source, mode: 'insensitive' };
        if (filters.from || filters.to) {
            where.timestamp = {};
            if (filters.from) where.timestamp.gte = new Date(filters.from);
            if (filters.to) where.timestamp.lte = new Date(filters.to);
        }
        if (filters.minCorrelation !== undefined) {
            where.correlationScore = { gte: Number(filters.minCorrelation) };
        }

        const events = await this.prisma.timelineEvent.findMany({
            where,
            orderBy: { timestamp: 'asc' },
            include: {
                createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
        });

        const typeSummary = events.reduce<Record<string, number>>((acc, e) => {
            acc[e.type] = (acc[e.type] ?? 0) + 1;
            return acc;
        }, {});

        return { caseId, totalEvents: events.length, typeSummary, events };
    }

    async addEvent(caseId: string, dto: CreateTimelineEventDto, userId: string) {
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        return this.prisma.timelineEvent.create({
            data: {
                id: uuidv4(),
                caseId,
                type: dto.type,
                timestamp: new Date(dto.timestamp),
                description: dto.description,
                source: dto.source,
                actor: dto.actor,
                targetObject: dto.targetObject,
                createdById: userId,
            },
        });
    }

    async updateNote(caseId: string, eventId: string, notes: string) {
        const event = await this.prisma.timelineEvent.findFirst({ where: { id: eventId, caseId } });
        if (!event) throw new NotFoundException(`Timeline event ${eventId} not found in case ${caseId}`);
        return this.prisma.timelineEvent.update({ where: { id: eventId }, data: { notes } });
    }

    async synthesizeFromArtifacts(caseId: string, userId: string): Promise<{ created: number }> {
        const artifacts = await this.prisma.artifact.findMany({ where: { caseId } });
        let created = 0;

        for (const artifact of artifacts) {
            const entries = this.extractEntries(artifact.type as any, artifact.data);
            for (const entry of entries) {
                if (isNaN(entry.timestamp.getTime())) continue;
                await this.prisma.timelineEvent.create({
                    data: {
                        id: uuidv4(),
                        caseId,
                        type: entry.type,
                        timestamp: entry.timestamp,
                        description: entry.description,
                        source: artifact.source,
                        actor: entry.actor,
                        targetObject: entry.targetObject,
                        artifactId: artifact.id,
                        correlationScore: entry.correlationScore,
                        createdById: userId,
                    },
                });
                created++;
            }
        }
        return { created };
    }

    /**
     * Cluster timeline events into 5-minute windows and persist TimelineCluster records.
     */
    async clusterTimeline(caseId: string): Promise<{ clusters: number }> {
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        const events = await this.prisma.timelineEvent.findMany({
            where: { caseId },
            orderBy: { timestamp: 'asc' },
        });

        if (events.length === 0) return { clusters: 0 };

        await (this.prisma as any).timelineCluster.deleteMany({ where: { caseId } });

        const WINDOW_MS = 5 * 60 * 1000;
        const rawClusters: { startTime: Date; endTime: Date; events: typeof events }[] = [];
        let current: (typeof rawClusters)[0] | null = null;

        for (const event of events) {
            if (!current) {
                current = { startTime: event.timestamp, endTime: event.timestamp, events: [event] };
            } else if (event.timestamp.getTime() - current.endTime.getTime() <= WINDOW_MS) {
                current.events.push(event);
                current.endTime = event.timestamp;
            } else {
                rawClusters.push(current);
                current = { startTime: event.timestamp, endTime: event.timestamp, events: [event] };
            }
        }
        if (current) rawClusters.push(current);

        const significant = rawClusters.filter(c => c.events.length >= 3);

        for (const cluster of significant) {
            const uniqueTypes = [...new Set(cluster.events.map(e => e.type as string))];
            const avgCorr = cluster.events.reduce((s, e) => s + e.correlationScore, 0) / cluster.events.length;
            const hasHigh = cluster.events.some(e => e.correlationScore >= 70);

            let severity = 'LOW';
            if (uniqueTypes.length >= 4 || avgCorr >= 70) severity = 'CRITICAL';
            else if (uniqueTypes.length >= 3 || hasHigh) severity = 'HIGH';
            else if (uniqueTypes.length >= 2 || avgCorr >= 40) severity = 'MEDIUM';

            await (this.prisma as any).timelineCluster.create({
                data: {
                    id: uuidv4(),
                    caseId,
                    startTime: cluster.startTime,
                    endTime: cluster.endTime,
                    eventCount: cluster.events.length,
                    severity,
                    eventTypes: uniqueTypes,
                },
            });
        }

        return { clusters: significant.length };
    }

    async getClusters(caseId: string) {
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);
        return (this.prisma as any).timelineCluster.findMany({
            where: { caseId },
            orderBy: { startTime: 'asc' },
        });
    }

    private extractEntries(
        artifactType: string,
        data: any,
    ): Array<{ type: TimelineEventType; timestamp: Date; description: string; actor?: string; targetObject?: string; correlationScore: number }> {
        const entries: any[] = (data as any)?.entries ?? [];

        switch (artifactType) {
            case 'BROWSER_HISTORY':
                return entries.map(e => ({
                    type: TimelineEventType.NETWORK,
                    timestamp: new Date(e.visitTime),
                    description: `Browser visit: ${e.title}`,
                    targetObject: e.url,
                    correlationScore: e.url?.includes('exfiltrat') || e.url?.includes('mega') ? 85 : 10,
                }));
            case 'USB_LOG':
                return entries.map(e => ({
                    type: TimelineEventType.USB,
                    timestamp: new Date(e.firstConnected),
                    description: `USB device connected: ${e.deviceId}`,
                    targetObject: e.driveLetter,
                    correlationScore: 60,
                }));
            case 'REGISTRY_HIVE':
                return entries.map(e => ({
                    type: TimelineEventType.REGISTRY,
                    timestamp: new Date(e.lastModified),
                    description: `Registry change: ${e.key}`,
                    targetObject: e.key,
                    correlationScore: e.key?.includes('Run') ? 80 : 30,
                }));
            case 'EVENT_LOG':
                return entries.map(e => ({
                    type: e.eventId === 4688 ? TimelineEventType.PROCESS : TimelineEventType.AUTHENTICATION,
                    timestamp: new Date(e.timestamp),
                    description: e.description,
                    actor: e.user ?? e.process,
                    targetObject: e.commandLine ?? e.ip,
                    correlationScore: [4688, 7045].includes(e.eventId) ? 75 : 25,
                }));
            case 'PREFETCH':
                return entries.map(e => ({
                    type: TimelineEventType.PROCESS,
                    timestamp: new Date(e.lastRun),
                    description: `Process executed: ${e.filename} (${e.runCount} times)`,
                    targetObject: e.filename,
                    correlationScore: e.filename?.toLowerCase().includes('rshell') ? 90 : 20,
                }));
            case 'NETWORK_CAPTURE':
                return entries.map(e => ({
                    type: TimelineEventType.NETWORK,
                    timestamp: new Date(e.timestamp),
                    description: `${e.protocol} connection to ${e.dstIp}:${e.dstPort} — ${e.note}`,
                    targetObject: `${e.dstIp}:${e.dstPort}`,
                    correlationScore: e.suspicious ? 90 : 10,
                }));
            default:
                return [];
        }
    }
}

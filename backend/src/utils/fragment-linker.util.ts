/**
 * Fragment Linker — Enterprise-Hardened
 *
 * Probabilistic algorithm to link disk fragments into coherent file groups.
 * Complexity: O(n log n) sort + O(n × K) grouping where K = WINDOW_SIZE (constant 10).
 *
 * Scoring factors:
 *   1. Entropy similarity (max 40 pts)
 *   2. Offset proximity   (max 30 pts)
 *   3. Byte continuity    (max 20 pts)
 *   4. Header hint        (max 10 pts)
 *
 * Total: 0–100 → normalized to 0–1 as linkProbability
 *
 * @version 1.0.0
 */

import { randomUUID } from 'crypto';
import { calculateEntropy, byteContinuity } from './entropy.util';

/** Algorithm version — persisted on every recovered file for forensic reproducibility */
export const FRAGMENT_LINKER_VERSION = '1.0.0';

/** Max number of recent groups to compare against (controls complexity) */
const WINDOW_SIZE = 10;

/** Minimum pair score (out of 100) to join a group */
const LINK_THRESHOLD = 50;

/** Max fragments to process in one call (memory guard) */
const MAX_FRAGMENTS = 500_000;

export interface RawFragment {
    id: string;
    offsetStart: bigint;
    offsetEnd: bigint;
    sizeBytes: bigint;
    entropyScore: number;
    byteContinuity: number;
    headerHint?: string | null;
    data?: Buffer; // optional: raw bytes for byte-continuity checks
}

export interface LinkedGroup {
    groupId: string;
    fragments: Array<{
        fragmentId: string;
        offsetStart: bigint;
        linkProbability: number;
    }>;
    averageEntropy: number;
    totalSizeBytes: bigint;
    groupConfidence: number; // 0–1
}

const SECTOR_SIZE = 4096n; // 4 KB sectors

/**
 * Compute similarity score (0–100) between two fragments.
 */
function pairScore(a: RawFragment, b: RawFragment): number {
    let score = 0;

    // 1. Entropy similarity (40 pts max)
    const entropyDiff = Math.abs(a.entropyScore - b.entropyScore);
    score += Math.max(0, 40 - entropyDiff * 10);

    // 2. Offset proximity (30 pts max)
    const gap = b.offsetStart > a.offsetEnd
        ? b.offsetStart - a.offsetEnd
        : a.offsetStart > b.offsetEnd
            ? a.offsetStart - b.offsetEnd
            : 0n;

    const gapSectors = Number(gap / SECTOR_SIZE);
    score += Math.max(0, 30 - gapSectors * 3);

    // 3. Byte continuity check (20 pts max)
    if (a.data && b.data && a.data.length >= 4 && b.data.length >= 4) {
        const tailA = a.data.slice(-4);
        const headB = b.data.slice(0, 4);
        const crossContinuity = byteContinuity(Buffer.concat([tailA, headB]));
        score += crossContinuity * 20;
    } else {
        score += ((a.byteContinuity + b.byteContinuity) / 2) * 20;
    }

    // 4. Header hint exclusivity (10 pts)
    if (a.headerHint && !b.headerHint) score += 10;

    return Math.min(100, score);
}

/**
 * Group fragments using sorted-window clustering.
 *
 * Algorithm:
 *   - Sort fragments by offsetStart (O(n log n)).
 *   - For each fragment, compare only against the last K groups (WINDOW_SIZE).
 *   - This gives O(n × K) = O(n) for the clustering phase.
 *   - Total: O(n log n).
 */
export function linkFragments(fragments: RawFragment[]): LinkedGroup[] {
    if (fragments.length === 0) return [];

    // Memory guard
    if (fragments.length > MAX_FRAGMENTS) {
        throw new Error(
            `Fragment count ${fragments.length} exceeds MAX_FRAGMENTS (${MAX_FRAGMENTS}). ` +
            `Process in batches to avoid OOM.`,
        );
    }

    // Sort ascending by offset — O(n log n)
    const sorted = [...fragments].sort((a, b) =>
        a.offsetStart < b.offsetStart ? -1 : a.offsetStart > b.offsetStart ? 1 : 0,
    );

    const groups: Array<{ groupId: string; members: Array<{ fragment: RawFragment; probability: number }> }> = [];
    const assigned = new Set<string>();

    for (const frag of sorted) {
        if (assigned.has(frag.id)) continue;

        let bestGroupIdx = -1;
        let bestScore = LINK_THRESHOLD;

        // Only scan the last WINDOW_SIZE groups — O(K) per fragment
        const windowStart = Math.max(0, groups.length - WINDOW_SIZE);
        for (let gi = windowStart; gi < groups.length; gi++) {
            const group = groups[gi];
            const last = group.members[group.members.length - 1].fragment;
            const s = pairScore(last, frag);
            if (s > bestScore) {
                bestScore = s;
                bestGroupIdx = gi;
            }
        }

        if (bestGroupIdx >= 0) {
            groups[bestGroupIdx].members.push({
                fragment: frag,
                probability: bestScore / 100,
            });
        } else {
            groups.push({
                groupId: randomUUID(),
                members: [{ fragment: frag, probability: 0.5 }],
            });
        }
        assigned.add(frag.id);
    }

    // Convert to LinkedGroup output
    return groups.map((g) => {
        const totalSize = g.members.reduce((sum, m) => sum + m.fragment.sizeBytes, 0n);
        const avgEntropy =
            g.members.reduce((sum, m) => sum + m.fragment.entropyScore, 0) /
            g.members.length;
        const avgProbability =
            g.members.reduce((sum, m) => sum + m.probability, 0) / g.members.length;

        return {
            groupId: g.groupId,
            fragments: g.members.map((m) => ({
                fragmentId: m.fragment.id,
                offsetStart: m.fragment.offsetStart,
                linkProbability: Math.round(m.probability * 1000) / 1000,
            })),
            averageEntropy: Math.round(avgEntropy * 1000) / 1000,
            totalSizeBytes: totalSize,
            groupConfidence: Math.round(avgProbability * 1000) / 1000,
        };
    });
}

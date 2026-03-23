/**
 * Unit tests: linkFragments()
 *
 * Tests:
 *   - Empty input → empty output
 *   - Single fragment → single-member group (not output per spec: groups with < 2 are skipped in service)
 *   - Two adjacent fragments with similar entropy → linked in same group
 *   - Two fragments with very different entropy + large gap → separate groups
 *   - Probability is 0–1
 *   - Group totalSizeBytes == sum of fragment sizes
 */

import { linkFragments, RawFragment } from './fragment-linker.util';

function makeFragment(
    id: string,
    offsetStart: bigint,
    size: bigint,
    entropy: number,
    continuity = 0.7,
    headerHint?: string,
): RawFragment {
    return {
        id,
        offsetStart,
        offsetEnd: offsetStart + size,
        sizeBytes: size,
        entropyScore: entropy,
        byteContinuity: continuity,
        headerHint,
        data: Buffer.alloc(Number(size), Math.floor(entropy * 30)),
    };
}

describe('linkFragments', () => {
    it('should return empty array for empty input', () => {
        expect(linkFragments([])).toEqual([]);
    });

    it('should create exactly one group for two adjacent fragments with similar entropy', () => {
        const frags: RawFragment[] = [
            makeFragment('f1', 0n, 4096n, 5.0),
            makeFragment('f2', 4096n, 4096n, 5.1),  // adjacent, similar entropy
        ];
        const groups = linkFragments(frags);
        expect(groups).toHaveLength(1);
        expect(groups[0].fragments).toHaveLength(2);
    });

    it('should create separate groups for fragments with very different entropy and large gap', () => {
        const frags: RawFragment[] = [
            makeFragment('fA', 0n, 4096n, 1.0),           // low entropy, early offset
            makeFragment('fB', 100_000_000n, 4096n, 7.9), // high entropy, distant offset
        ];
        const groups = linkFragments(frags);
        // They should be in different groups
        expect(groups).toHaveLength(2);
    });

    it('all link probabilities should be between 0 and 1', () => {
        const frags: RawFragment[] = [
            makeFragment('p1', 0n, 4096n, 4.0),
            makeFragment('p2', 4096n, 4096n, 4.2),
            makeFragment('p3', 8192n, 4096n, 4.1),
        ];
        const groups = linkFragments(frags);
        for (const group of groups) {
            for (const member of group.fragments) {
                expect(member.linkProbability).toBeGreaterThanOrEqual(0);
                expect(member.linkProbability).toBeLessThanOrEqual(1);
            }
        }
    });

    it('group totalSizeBytes should equal sum of member fragment sizes', () => {
        const frags: RawFragment[] = [
            makeFragment('s1', 0n, 4096n, 5.0),
            makeFragment('s2', 4096n, 8192n, 5.1),
        ];
        const groups = linkFragments(frags);
        const group = groups[0];
        const expectedTotal = frags.reduce((sum, f) => sum + f.sizeBytes, 0n);
        expect(group.totalSizeBytes).toBe(expectedTotal);
    });

    it('should assign all fragments to groups (no orphans)', () => {
        const frags: RawFragment[] = [
            makeFragment('a', 0n, 4096n, 5.0),
            makeFragment('b', 4096n, 4096n, 5.0),
            makeFragment('c', 8192n, 4096n, 5.0),
        ];
        const groups = linkFragments(frags);
        const assignedIds = groups.flatMap((g) => g.fragments.map((f) => f.fragmentId));
        expect(assignedIds).toContain('a');
        expect(assignedIds).toContain('b');
        expect(assignedIds).toContain('c');
    });

    it('fragment with header hint should get higher probability when first in group', () => {
        const withHint: RawFragment[] = [
            makeFragment('h1', 0n, 4096n, 5.0, 0.8, 'JPEG'),
            makeFragment('h2', 4096n, 4096n, 5.0, 0.8),
        ];
        const withoutHint: RawFragment[] = [
            makeFragment('n1', 0n, 4096n, 5.0, 0.8),
            makeFragment('n2', 4096n, 4096n, 5.0, 0.8),
        ];

        const gWith = linkFragments(withHint);
        const gWithout = linkFragments(withoutHint);

        const probWith = gWith[0]?.fragments[1]?.linkProbability ?? 0;
        const probWithout = gWithout[0]?.fragments[1]?.linkProbability ?? 0;

        // Header hint in first fragment should push probability higher for second
        expect(probWith).toBeGreaterThanOrEqual(probWithout);
    });
});

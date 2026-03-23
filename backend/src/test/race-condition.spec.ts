/**
 * Race Condition & Concurrency Tests
 *
 * Validates thread safety and idempotency:
 *   - Parallel entropy calculations produce deterministic results
 *   - Parallel carving produces deterministic results
 *   - Fragment linker IDs are unique across parallel invocations
 *   - Confidence scorer is pure (no shared mutable state)
 *
 * Run: npm test -- --testPathPatterns=race-condition
 */

import { calculateEntropy } from '../utils/entropy.util';
import { carveFiles } from '../utils/file-carver.util';
import { linkFragments, RawFragment } from '../utils/fragment-linker.util';
import { scoreConfidence } from '../utils/confidence-scorer.util';

describe('Race Condition Tests', () => {
    describe('Entropy — parallel determinism', () => {
        it('should produce identical results across 100 parallel invocations', async () => {
            const data = Buffer.alloc(65536);
            for (let i = 0; i < data.length; i++) data[i] = i % 256;

            const results = await Promise.all(
                Array.from({ length: 100 }, () =>
                    Promise.resolve(calculateEntropy(data)),
                ),
            );

            const expected = results[0];
            for (const r of results) {
                expect(r).toBeCloseTo(expected, 10);
            }
        });
    });

    describe('Carving — parallel determinism', () => {
        it('should produce identical carved file counts across 20 parallel invocations', async () => {
            const buf = Buffer.alloc(2 * 1024 * 1024, 0x00);
            Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(buf, 4096);
            Buffer.alloc(8192, 0xa0).copy(buf, 4100);
            Buffer.from([0xff, 0xd9]).copy(buf, 12292);

            const results = await Promise.all(
                Array.from({ length: 20 }, () =>
                    Promise.resolve(carveFiles(buf, 0)),
                ),
            );

            const expectedCount = results[0].length;
            for (const r of results) {
                expect(r.length).toBe(expectedCount);
            }
        });

        it('should produce identical offset ranges across parallel runs', async () => {
            const buf = Buffer.alloc(1024 * 1024, 0x00);
            Buffer.from('%PDF-1.7\n').copy(buf, 0);
            Buffer.from('startxref\n0\n%%EOF').copy(buf, 100);

            const results = await Promise.all(
                Array.from({ length: 10 }, () =>
                    Promise.resolve(carveFiles(buf, 0)),
                ),
            );

            for (const r of results) {
                expect(r.map(f => f.offsetStart)).toEqual(results[0].map(f => f.offsetStart));
                expect(r.map(f => f.offsetEnd)).toEqual(results[0].map(f => f.offsetEnd));
            }
        });
    });

    describe('Fragment Linker — unique group IDs', () => {
        it('should produce unique group IDs across 10 parallel invocations', async () => {
            const frags: RawFragment[] = Array.from({ length: 100 }, (_, i) => ({
                id: `frag-${i}`,
                offsetStart: BigInt(i * 4096),
                offsetEnd: BigInt((i + 1) * 4096),
                sizeBytes: 4096n,
                entropyScore: 5.0 + (i % 4) * 0.3,
                byteContinuity: 0.7,
                data: Buffer.alloc(4096, i % 256),
            }));

            const results = await Promise.all(
                Array.from({ length: 10 }, () =>
                    Promise.resolve(linkFragments(frags)),
                ),
            );

            // Collect all group IDs from all runs
            const allGroupIds = new Set<string>();
            for (const run of results) {
                for (const group of run) {
                    // With crypto.randomUUID(), group IDs should be unique across runs
                    if (allGroupIds.has(group.groupId)) {
                        // This is extremely unlikely with UUID v4 (collision rate ~ 1 in 2^122)
                        // but we check anyway for safety
                        fail(`Duplicate group ID detected: ${group.groupId}`);
                    }
                    allGroupIds.add(group.groupId);
                }
            }
            expect(allGroupIds.size).toBeGreaterThan(0);
        });
    });

    describe('Confidence Scorer — purity check', () => {
        it('should produce identical scores for identical inputs across parallel calls', async () => {
            const input = {
                data: Buffer.alloc(1024, 0xa0),
                hasValidHeader: true,
                hasValidFooter: true as boolean | null,
                footerDistanceOk: true,
                byteContinuityOk: true,
                mimeType: 'image/jpeg',
                metadataFieldCount: 3,
                internalStructureValid: true,
            };

            const results = await Promise.all(
                Array.from({ length: 50 }, () =>
                    Promise.resolve(scoreConfidence(input)),
                ),
            );

            const expected = results[0].total;
            for (const r of results) {
                expect(r.total).toBe(expected);
                expect(r.headerMatchScore).toBe(results[0].headerMatchScore);
                expect(r.footerMatchScore).toBe(results[0].footerMatchScore);
            }
        });
    });

    describe('Idempotency — repeated processing', () => {
        it('carving the same buffer twice should produce identical results', () => {
            const buf = Buffer.alloc(65536, 0x00);
            Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(buf, 0);
            Buffer.alloc(4096, 0xa0).copy(buf, 4);
            Buffer.from([0xff, 0xd9]).copy(buf, 4100);

            const run1 = carveFiles(buf, 0);
            const run2 = carveFiles(buf, 0);

            expect(run1.length).toBe(run2.length);
            for (let i = 0; i < run1.length; i++) {
                expect(run1[i].offsetStart).toBe(run2[i].offsetStart);
                expect(run1[i].offsetEnd).toBe(run2[i].offsetEnd);
                expect(run1[i].entropyScore).toBe(run2[i].entropyScore);
                expect(run1[i].signatureName).toBe(run2[i].signatureName);
            }
        });

        it('entropy calculation is idempotent', () => {
            const buf = Buffer.alloc(100000);
            for (let i = 0; i < buf.length; i++) buf[i] = (i * 7 + 13) % 256;

            const r1 = calculateEntropy(buf);
            const r2 = calculateEntropy(buf);
            const r3 = calculateEntropy(buf);

            expect(r1).toBe(r2);
            expect(r2).toBe(r3);
        });
    });
});

/**
 * Stress Tests
 *
 * Validates performance at enterprise scale:
 *   - 10k fragments through linker
 *   - 50k pseudo-correlations timing
 *   - Benchmark report with timing data
 *
 * Run: npm test -- --testPathPatterns=stress
 */

import { linkFragments, RawFragment } from '../utils/fragment-linker.util';
import { calculateEntropy } from '../utils/entropy.util';
import { carveFiles } from '../utils/file-carver.util';

describe('Stress Tests', () => {
    describe('Fragment Linker — 10k fragments', () => {
        let result: ReturnType<typeof linkFragments>;
        let elapsed: number;

        beforeAll(() => {
            const frags: RawFragment[] = Array.from({ length: 10_000 }, (_, i) => ({
                id: `frag-${i}`,
                offsetStart: BigInt(i * 4096),
                offsetEnd: BigInt((i + 1) * 4096),
                sizeBytes: 4096n,
                entropyScore: 4.0 + (i % 8) * 0.5,
                byteContinuity: 0.5 + (i % 5) * 0.1,
                headerHint: i % 100 === 0 ? 'JPEG' : undefined,
                data: Buffer.alloc(4096, i % 256),
            }));

            const start = performance.now();
            result = linkFragments(frags);
            elapsed = performance.now() - start;
        }, 30_000);

        it('should complete within 10 seconds', () => {
            expect(elapsed).toBeLessThan(10_000);
        });

        it('should produce at least 1 group', () => {
            expect(result.length).toBeGreaterThan(0);
        });

        it('should assign all fragments to groups (no orphans)', () => {
            const totalAssigned = result.reduce((sum, g) => sum + g.fragments.length, 0);
            expect(totalAssigned).toBe(10_000);
        });

        it('benchmark: report performance', () => {
            const throughput = (10_000 / (elapsed / 1000)).toFixed(0);
            console.log(`\n[BENCHMARK] Fragment Linker 10k: ${elapsed.toFixed(1)}ms (${throughput} frags/s)`);
            console.log(`[BENCHMARK] Groups created: ${result.length}`);
        });
    });

    describe('Entropy Calculation — 1M bytes', () => {
        it('should process 1 MB buffer in < 50ms', () => {
            const buf = Buffer.alloc(1_000_000);
            for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);

            const start = performance.now();
            const entropy = calculateEntropy(buf);
            const elapsed = performance.now() - start;

            expect(elapsed).toBeLessThan(50);
            expect(entropy).toBeGreaterThan(7.5); // near-random data
            console.log(`\n[BENCHMARK] Entropy 1MB: ${elapsed.toFixed(2)}ms, H=${entropy.toFixed(4)}`);
        });

        it('should process 10 MB buffer in < 500ms', () => {
            const buf = Buffer.alloc(10_000_000, 0xab);

            const start = performance.now();
            const entropy = calculateEntropy(buf);
            const elapsed = performance.now() - start;

            expect(elapsed).toBeLessThan(500);
            console.log(`\n[BENCHMARK] Entropy 10MB: ${elapsed.toFixed(2)}ms, H=${entropy.toFixed(4)}`);
        });
    });

    describe('File Carving — large buffer', () => {
        it('should carve a 2 MB buffer with embedded signatures in < 1s', () => {
            const buf = Buffer.alloc(2 * 1024 * 1024, 0x00);
            // Plant JPEG
            Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(buf, 4096);
            Buffer.alloc(8192, 0xa0).copy(buf, 4100);
            Buffer.from([0xff, 0xd9]).copy(buf, 12292);
            // Plant PDF
            Buffer.from('%PDF-1.7\n').copy(buf, 65536);
            Buffer.from('startxref\n0\n%%EOF').copy(buf, 65545);

            const start = performance.now();
            const results = carveFiles(buf, 0);
            const elapsed = performance.now() - start;

            expect(elapsed).toBeLessThan(1000);
            expect(results.length).toBeGreaterThan(0);
            console.log(`\n[BENCHMARK] Carve 2MB: ${elapsed.toFixed(2)}ms, found ${results.length} files`);
        });
    });

    describe('Memory usage tracking', () => {
        it('should report current heap stats', () => {
            const mem = process.memoryUsage();
            console.log('\n[BENCHMARK] Memory Usage:');
            console.log(`  Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`);
            console.log(`  Heap Total: ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`);
            console.log(`  RSS: ${(mem.rss / 1024 / 1024).toFixed(1)} MB`);
            console.log(`  External: ${(mem.external / 1024 / 1024).toFixed(1)} MB`);
            expect(mem.heapUsed).toBeGreaterThan(0);
        });
    });
});

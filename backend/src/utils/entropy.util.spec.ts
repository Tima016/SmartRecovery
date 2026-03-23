/**
 * Unit tests: calculateEntropy(), classifyEntropy(), entropyRangeScore(), byteContinuity()
 *
 * Test cases cover:
 *   - Empty buffer → 0
 *   - Uniform buffer (all 0x00) → 0
 *   - Single byte value repeated → 0
 *   - Max entropy: uniformly distributed 256 byte-values → ~8
 *   - ASCII text → 3–5 range
 *   - Random-like data (crypto-strength)
 *   - Classification buckets
 *   - Range scoring (in-range, slightly out, far out)
 *   - Byte continuity edge cases
 */

import {
    calculateEntropy,
    classifyEntropy,
    entropyRangeScore,
    byteContinuity,
} from './entropy.util';

describe('calculateEntropy', () => {
    it('should return 0 for an empty buffer', () => {
        expect(calculateEntropy(Buffer.alloc(0))).toBe(0);
    });

    it('should return 0 for a uniform buffer (all zeros)', () => {
        expect(calculateEntropy(Buffer.alloc(1024, 0x00))).toBe(0);
    });

    it('should return 0 for a single repeated byte', () => {
        expect(calculateEntropy(Buffer.alloc(512, 0xff))).toBe(0);
    });

    it('should return ~8 for a perfectly uniform distribution over all 256 byte values', () => {
        // Build a buffer with each byte value appearing exactly n times
        const n = 4;
        const buf = Buffer.alloc(256 * n);
        for (let i = 0; i < 256; i++) {
            for (let j = 0; j < n; j++) {
                buf[i * n + j] = i;
            }
        }
        const entropy = calculateEntropy(buf);
        expect(entropy).toBeCloseTo(8.0, 1);
    });

    it('should return low entropy for structured ASCII text', () => {
        const text = Buffer.from('The quick brown fox jumps over the lazy dog'.repeat(50));
        const entropy = calculateEntropy(text);
        expect(entropy).toBeGreaterThan(3.0);
        expect(entropy).toBeLessThan(5.5);
    });

    it('should return value in range [0, 8] for any buffer', () => {
        for (let i = 0; i < 10; i++) {
            const buf = Buffer.alloc(1024);
            for (let j = 0; j < buf.length; j++) buf[j] = Math.floor(Math.random() * 256);
            const entropy = calculateEntropy(buf);
            expect(entropy).toBeGreaterThanOrEqual(0);
            expect(entropy).toBeLessThanOrEqual(8);
        }
    });

    it('should return higher entropy for more varied data', () => {
        const uniform = Buffer.alloc(1024, 0xaa);
        const varied = Buffer.alloc(1024);
        for (let i = 0; i < varied.length; i++) varied[i] = Math.floor(Math.random() * 256);

        expect(calculateEntropy(uniform)).toBeLessThan(calculateEntropy(varied));
    });
});

describe('classifyEntropy', () => {
    it('should classify 0 as UNIFORM', () => {
        expect(classifyEntropy(0)).toBe('UNIFORM');
    });

    it('should classify 0.5 as UNIFORM', () => {
        expect(classifyEntropy(0.5)).toBe('UNIFORM');
    });

    it('should classify 2.0 as STRUCTURED_TEXT', () => {
        expect(classifyEntropy(2.0)).toBe('STRUCTURED_TEXT');
    });

    it('should classify 5.0 as BINARY_DATA', () => {
        expect(classifyEntropy(5.0)).toBe('BINARY_DATA');
    });

    it('should classify 7.0 as COMPRESSED', () => {
        expect(classifyEntropy(7.0)).toBe('COMPRESSED');
    });

    it('should classify 7.8 as ENCRYPTED_OR_RANDOM', () => {
        expect(classifyEntropy(7.8)).toBe('ENCRYPTED_OR_RANDOM');
    });
});

describe('entropyRangeScore', () => {
    it('should return 20 when entropy is exactly in range', () => {
        expect(entropyRangeScore(6.5, 6.0, 8.0)).toBe(20);
    });

    it('should return 20 at range boundaries', () => {
        expect(entropyRangeScore(6.0, 6.0, 8.0)).toBe(20);
        expect(entropyRangeScore(8.0, 6.0, 8.0)).toBe(20);
    });

    it('should deduct points when slightly out of range', () => {
        const score = entropyRangeScore(3.0, 6.0, 8.0); // 3.0 bits below min of 6.0
        expect(score).toBeLessThan(20);
        expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 when far out of range', () => {
        expect(entropyRangeScore(0, 6.0, 8.0)).toBe(0);
    });
});

describe('byteContinuity', () => {
    it('should return 1 for a buffer of length < 2', () => {
        expect(byteContinuity(Buffer.from([0x41]))).toBe(1);
        expect(byteContinuity(Buffer.alloc(0))).toBe(1);
    });

    it('should return high continuity for monotonically increasing sequence', () => {
        const buf = Buffer.alloc(256);
        for (let i = 0; i < 256; i++) buf[i] = i;
        expect(byteContinuity(buf)).toBeGreaterThan(0.9);
    });

    it('should return low continuity for highly random data', () => {
        // Alternating 0 and 255 — max possible delta = 255 > 64 → all transitions out of range
        const buf = Buffer.alloc(256);
        for (let i = 0; i < 256; i++) buf[i] = i % 2 === 0 ? 0 : 255;
        expect(byteContinuity(buf)).toBe(0);
    });
});

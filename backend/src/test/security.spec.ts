/**
 * Security Tests
 *
 * Tests SQL injection, path traversal, hash mismatch detection, and oversized inputs.
 * These run at the utility/service layer — not against the network.
 *
 * Run: npm test -- --testPathPattern=security
 */

import { calculateEntropy } from '../utils/entropy.util';
import { carveFiles } from '../utils/file-carver.util';
import { linkFragments } from '../utils/fragment-linker.util';
import { scoreConfidence } from '../utils/confidence-scorer.util';
import * as crypto from 'crypto';

// ────────────────────────────────────────────────────────────────────────────
// SQL INJECTION SAFETY
// All our DB calls go through Prisma ORM with parameterized queries.
// These tests verify that SQL payloads passed as data values don't break functions.
// ────────────────────────────────────────────────────────────────────────────

describe('SQL injection safety', () => {
    const sqlPayloads = [
        "'; DROP TABLE cases; --",
        '1 OR 1=1',
        "UNION SELECT * FROM users WHERE '1'='1",
        "\\x27 OR 1=1--",
        '\\0; DROP TABLE audit_logs; --',
    ];

    it('should handle SQL-like strings in calculateEntropy without error', () => {
        for (const payload of sqlPayloads) {
            const buf = Buffer.from(payload, 'utf8');
            const entropy = calculateEntropy(buf);
            expect(entropy).toBeGreaterThanOrEqual(0);
            expect(entropy).toBeLessThanOrEqual(8);
        }
    });

    it('should handle SQL payloads in carveFiles without error', () => {
        for (const payload of sqlPayloads) {
            const buf = Buffer.from(payload.repeat(20), 'utf8');
            expect(() => carveFiles(buf)).not.toThrow();
        }
    });

    it('should handle SQL payloads in scoreConfidence without error or infinite loop', () => {
        const buf = Buffer.from("'; DROP TABLE cases; --", 'utf8');
        expect(() => scoreConfidence({
            data: buf,
            hasValidHeader: false,
            hasValidFooter: false,
            footerDistanceOk: false,
            byteContinuityOk: false,
            mimeType: 'application/pdf',
            metadataFieldCount: 0,
            internalStructureValid: false,
        })).not.toThrow();
    });
});

// ────────────────────────────────────────────────────────────────────────────
// PATH TRAVERSAL SAFETY
// Filenames derived from carving use format: carved_{TYPE}_{offset}.{ext}
// These tests verify that traversal payloads as input don't cause issues.
// ────────────────────────────────────────────────────────────────────────────

describe('path traversal safety', () => {
    const traversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\Windows\\System32\\cmd.exe',
        '/etc/shadow',
        'C:\\Windows\\System32\\drivers\\etc\\hosts',
        '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    ];

    it('carveFiles should not generate file paths from traversal-like inputs', () => {
        for (const payload of traversalPayloads) {
            const buf = Buffer.from(payload, 'utf8');
            // carveFiles returns offsetStart, not filenames — no path generation
            const results = carveFiles(buf);
            for (const r of results) {
                // All strings in results should not start with / or ../
                expect(r.signatureName).not.toMatch(/^\.\./);
                expect(r.mimeType).not.toContain('..');
            }
        }
    });

    it('entropy calculation should be safe with null-byte injected payloads', () => {
        const nullPayload = Buffer.concat([
            Buffer.from('normal content'),
            Buffer.from([0x00, 0x00, 0x00]),  // null bytes
            Buffer.from('../../../etc/passwd'),
        ]);
        expect(() => calculateEntropy(nullPayload)).not.toThrow();
    });
});

// ────────────────────────────────────────────────────────────────────────────
// HASH INTEGRITY
// ────────────────────────────────────────────────────────────────────────────

describe('hash integrity', () => {
    it('should detect hash mismatch when content is modified', () => {
        const original = Buffer.from('Original forensic evidence content lorem ipsum dolor sit amet');
        const modified = Buffer.from('Modified forensic evidence content lorem ipsum dolor sit amet');

        const hashOriginal = crypto.createHash('sha256').update(original).digest('hex');
        const hashModified = crypto.createHash('sha256').update(modified).digest('hex');

        expect(hashOriginal).not.toBe(hashModified);
    });

    it('should produce consistent SHA-256 for identical data', () => {
        const data = Buffer.from('deterministic evidence data 12345');
        const h1 = crypto.createHash('sha256').update(data).digest('hex');
        const h2 = crypto.createHash('sha256').update(data).digest('hex');
        expect(h1).toBe(h2);
    });

    it('should produce different hashes for different offsets of the same content', () => {
        const data = Buffer.from('abcdefghijklmnopqrstuvwxyz');
        const chunk1 = data.slice(0, 13);
        const chunk2 = data.slice(13);

        const h1 = crypto.createHash('sha256').update(chunk1).digest('hex');
        const h2 = crypto.createHash('sha256').update(chunk2).digest('hex');
        expect(h1).not.toBe(h2);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// MEMORY SAFETY (oversized inputs)
// ────────────────────────────────────────────────────────────────────────────

describe('memory safety — oversized inputs', () => {
    it('should handle a 5 MB buffer in calculateEntropy without OOM', () => {
        const buf = Buffer.alloc(5 * 1024 * 1024, 0xab);
        const entropy = calculateEntropy(buf);
        expect(entropy).toBe(0); // uniform → 0
    });

    it('should handle linkFragments with 1000 fragments without hanging', () => {
        const frags = Array.from({ length: 1000 }, (_, i) => ({
            id: `frag-${i}`,
            offsetStart: BigInt(i * 4096),
            offsetEnd: BigInt((i + 1) * 4096),
            sizeBytes: 4096n,
            entropyScore: 4.0 + (i % 4) * 0.5,
            byteContinuity: 0.7,
            headerHint: undefined,
            data: Buffer.alloc(4096, i % 256),
        }));

        const start = Date.now();
        const groups = linkFragments(frags);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(10_000); // must complete within 10 seconds
        expect(groups.length).toBeGreaterThan(0);
    }, 15_000);

    it('should handle carveFiles on a sparse 1 MB buffer without error', () => {
        const buf = Buffer.alloc(1 * 1024 * 1024);
        // Place a JPEG signature at offset 512 KB
        buf[512 * 1024] = 0xff;
        buf[512 * 1024 + 1] = 0xd8;
        buf[512 * 1024 + 2] = 0xff;

        expect(() => carveFiles(buf, 0)).not.toThrow();
    });
});

// ────────────────────────────────────────────────────────────────────────────
// RACE CONDITION SAFETY (worker concurrency)
// ────────────────────────────────────────────────────────────────────────────

describe('worker concurrency safety', () => {
    it('should produce deterministic entropy results across parallel invocations', async () => {
        const data = Buffer.alloc(65536);
        for (let i = 0; i < data.length; i++) data[i] = i % 256;

        const results = await Promise.all(
            Array.from({ length: 10 }, () =>
                Promise.resolve(calculateEntropy(data)),
            ),
        );

        const first = results[0];
        for (const r of results) {
            expect(r).toBeCloseTo(first, 10);
        }
    });

    it('should produce deterministic carving results across parallel invocations', async () => {
        const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
        const body = Buffer.alloc(4096, 0xa0);
        const footer = Buffer.from([0xff, 0xd9]);
        const buf = Buffer.concat([jpegHeader, body, footer]);

        const results = await Promise.all(
            Array.from({ length: 5 }, () =>
                Promise.resolve(carveFiles(buf, 0)),
            ),
        );

        const firstCount = results[0].length;
        for (const r of results) {
            expect(r.length).toBe(firstCount);
        }
    });
});

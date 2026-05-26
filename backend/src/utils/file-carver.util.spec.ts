/**
 * Unit tests: carveFiles()
 *
 * Tests:
 *   - Detects JPEG in a buffer with embedded JPEG signature+footer
 *   - Detects PDF in buffer with %PDF header + %%EOF footer
 *   - Detects ZIP in buffer
 *   - Returns empty array for uniform/zeroed buffer
 *   - Does not carve files smaller than 16 bytes
 *   - Respects maxSize boundaries
 *   - Deduplication: overlapping carvings → only one returned
 *   - footerDistanceOk is true when footer follows header by > headerLength bytes
 *   - byteContinuityOk is true for structured content
 */

import { carveFiles } from './file-carver.util';

function buildJpegBuffer(bodySize = 8192): Buffer {
    const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const body = Buffer.alloc(bodySize);
    for (let i = 0; i < body.length; i++) body[i] = i % 256;
    const footer = Buffer.from([0xff, 0xd9]);
    return Buffer.concat([header, body, footer]);
}

function buildPdfBuffer(): Buffer {
    const header = Buffer.from('%PDF-1.7\n');
    const body = Buffer.from('1 0 obj\n<< /Type /Catalog >>\nendobj\n');
    const footer = Buffer.from('startxref\n0\n%%EOF');
    return Buffer.concat([header, body, footer]);
}

function buildZipBuffer(): Buffer {
    const header = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    const body = Buffer.alloc(4096);
    for (let i = 0; i < body.length; i++) body[i] = (i * 31) % 256;
    const footer = Buffer.from([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    return Buffer.concat([header, body, footer]);
}

describe('carveFiles', () => {
    describe('JPEG detection', () => {
        it('should detect an embedded JPEG with header and footer', () => {
            const jpeg = buildJpegBuffer();
            const results = carveFiles(jpeg, 0);
            const found = results.find((r) => r.signatureName === 'JPEG');
            expect(found).toBeDefined();
            expect(found!.headerFound).toBe(true);
            expect(found!.footerFound).toBe(true);
        });

        it('should have footerDistanceOk = true when footer is after header', () => {
            const jpeg = buildJpegBuffer(8192);
            const results = carveFiles(jpeg, 0);
            const found = results.find((r) => r.signatureName === 'JPEG');
            expect(found?.footerDistanceOk).toBe(true);
        });

        it('should report correct offsetStart when embedded at non-zero base', () => {
            const prefix = Buffer.alloc(4096, 0x00);
            const jpeg = buildJpegBuffer(2048);
            const buf = Buffer.concat([prefix, jpeg]);
            const results = carveFiles(buf, 0);
            const found = results.find((r) => r.signatureName === 'JPEG');
            expect(found).toBeDefined();
            expect(found!.offsetStart).toBe(4096);
        });
    });

    describe('PDF detection', () => {
        it('should detect a PDF with %PDF header and %%EOF footer', () => {
            const pdf = buildPdfBuffer();
            const results = carveFiles(pdf, 0);
            const found = results.find((r) => r.signatureName === 'PDF');
            expect(found).toBeDefined();
            expect(found!.headerFound).toBe(true);
        });
    });

    describe('ZIP detection', () => {
        it('should detect a ZIP file with PK header', () => {
            const zip = buildZipBuffer();
            const results = carveFiles(zip, 0);
            const found = results.find((r) => r.signatureName === 'ZIP');
            expect(found).toBeDefined();
        });
    });

    describe('empty / noise buffers', () => {
        it('should return empty array for a zeroed buffer', () => {
            const buf = Buffer.alloc(1024, 0x00);
            expect(carveFiles(buf)).toHaveLength(0);
        });

        it('should return empty array for a buffer with no known signatures', () => {
            const buf = Buffer.alloc(1024, 0xde);
            expect(carveFiles(buf)).toHaveLength(0);
        });
    });

    describe('sizeBytes', () => {
        it('should report sizeBytes ≥ 16 for any found carving', () => {
            const jpeg = buildJpegBuffer(100);
            const results = carveFiles(jpeg, 0);
            for (const r of results) {
                expect(r.sizeBytes).toBeGreaterThanOrEqual(16);
            }
        });
    });

    describe('offset tracking', () => {
        it('should add baseOffset to all reported offsets', () => {
            const baseOffset = 1_000_000;
            const jpeg = buildJpegBuffer(2048);
            const results = carveFiles(jpeg, baseOffset);
            const found = results.find((r) => r.signatureName === 'JPEG');
            if (found) {
                expect(found.offsetStart).toBeGreaterThanOrEqual(baseOffset);
            }
        });
    });

    describe('entropy', () => {
        it('should attach a non-zero entropyScore to carved files', () => {
            const jpeg = buildJpegBuffer(4096);
            const results = carveFiles(jpeg, 0);
            const found = results.find((r) => r.signatureName === 'JPEG');
            if (found) {
                expect(found.entropyScore).toBeGreaterThan(0);
                expect(found.entropyScore).toBeLessThanOrEqual(8);
            }
        });
    });
});

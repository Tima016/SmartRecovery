/**
 * Unit tests: scoreConfidence() and validateInternalStructure()
 *
 * Tests:
 *   - Perfect input (header + footer + valid entropy + metadata) → high score
 *   - No header, no footer → very low score (heavily penalized)
 *   - Footer distance fail → penalty applied
 *   - Byte continuity fail → penalty applied
 *   - Internal structure fail → penalty applied
 *   - JPEG internal structure: valid pair → true, mismatched header → false
 *   - PDF structure: contains 'PDF-' and 'startxref' → true
 *   - Unknown MIME → no specific validation → true
 *   - Score is always in [0, 100]
 */

import { scoreConfidence, validateInternalStructure } from './confidence-scorer.util';

function makeJpegBuffer(): Buffer {
    // Valid JPEG: starts with FFD8FF, ends with FFD9
    const buf = Buffer.alloc(1024, 0xa0);
    buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff;
    buf[buf.length - 2] = 0xff; buf[buf.length - 1] = 0xd9;
    return buf;
}

function makePdfBuffer(): Buffer {
    const content = '%PDF-1.7\nsome content here\nstartxref\n0\n%%EOF';
    return Buffer.from(content, 'utf8');
}

describe('scoreConfidence', () => {
    it('should return a high score for perfect input with all positives', () => {
        const score = scoreConfidence({
            data: makeJpegBuffer(),
            hasValidHeader: true,
            hasValidFooter: true,
            footerDistanceOk: true,
            byteContinuityOk: true,
            mimeType: 'image/jpeg',
            metadataFieldCount: 5,
            internalStructureValid: true,
        });
        expect(score.total).toBeGreaterThan(60);
    });

    it('should return 0 for no header and no footer', () => {
        const score = scoreConfidence({
            data: Buffer.alloc(100, 0x00),
            hasValidHeader: false,
            hasValidFooter: false,
            footerDistanceOk: false,
            byteContinuityOk: false,
            mimeType: 'image/jpeg',
            metadataFieldCount: 0,
            internalStructureValid: false,
        });
        expect(score.total).toBe(0);
    });

    it('should apply penalty for footer distance failure', () => {
        const withGoodDistance = scoreConfidence({
            data: makeJpegBuffer(),
            hasValidHeader: true,
            hasValidFooter: true,
            footerDistanceOk: true,
            byteContinuityOk: true,
            mimeType: 'image/jpeg',
            metadataFieldCount: 2,
            internalStructureValid: true,
        });
        const withBadDistance = scoreConfidence({
            data: makeJpegBuffer(),
            hasValidHeader: true,
            hasValidFooter: true,
            footerDistanceOk: false,   // ← penalty
            byteContinuityOk: true,
            mimeType: 'image/jpeg',
            metadataFieldCount: 2,
            internalStructureValid: true,
        });
        expect(withGoodDistance.total).toBeGreaterThan(withBadDistance.total);
    });

    it('should apply penalty for byte continuity failure', () => {
        const good = scoreConfidence({
            data: makeJpegBuffer(),
            hasValidHeader: true,
            hasValidFooter: true,
            footerDistanceOk: true,
            byteContinuityOk: true,
            mimeType: 'image/jpeg',
            metadataFieldCount: 2,
            internalStructureValid: true,
        });
        const bad = scoreConfidence({
            data: makeJpegBuffer(),
            hasValidHeader: true,
            hasValidFooter: true,
            footerDistanceOk: true,
            byteContinuityOk: false,   // ← penalty
            mimeType: 'image/jpeg',
            metadataFieldCount: 2,
            internalStructureValid: true,
        });
        expect(good.total).toBeGreaterThan(bad.total);
    });

    it('should apply penalty for invalid internal structure', () => {
        const good = scoreConfidence({
            data: makeJpegBuffer(),
            hasValidHeader: true,
            hasValidFooter: null,
            footerDistanceOk: true,
            byteContinuityOk: true,
            mimeType: 'video/mp4',
            metadataFieldCount: 3,
            internalStructureValid: true,
        });
        const bad = scoreConfidence({
            data: makeJpegBuffer(),
            hasValidHeader: true,
            hasValidFooter: null,
            footerDistanceOk: true,
            byteContinuityOk: true,
            mimeType: 'video/mp4',
            metadataFieldCount: 3,
            internalStructureValid: false,  // ← penalty
        });
        expect(good.total).toBeGreaterThan(bad.total);
    });

    it('score should always be in range [0, 100]', () => {
        const cases = [
            { hasValidHeader: true, hasValidFooter: true, fdo: true, bco: true, meta: 5, isv: true },
            { hasValidHeader: false, hasValidFooter: false, fdo: false, bco: false, meta: 0, isv: false },
            { hasValidHeader: true, hasValidFooter: null, fdo: true, bco: true, meta: 3, isv: true },
        ];
        for (const c of cases) {
            const score = scoreConfidence({
                data: Buffer.alloc(100),
                hasValidHeader: c.hasValidHeader,
                hasValidFooter: c.hasValidFooter,
                footerDistanceOk: c.fdo,
                byteContinuityOk: c.bco,
                mimeType: 'application/pdf',
                metadataFieldCount: c.meta,
                internalStructureValid: c.isv,
            });
            expect(score.total).toBeGreaterThanOrEqual(0);
            expect(score.total).toBeLessThanOrEqual(100);
        }
    });
});

describe('validateInternalStructure', () => {
    it('should validate valid JPEG buffer', () => {
        expect(validateInternalStructure(makeJpegBuffer(), 'image/jpeg')).toBe(true);
    });

    it('should reject invalid JPEG (bad footer)', () => {
        const buf = makeJpegBuffer();
        buf[buf.length - 1] = 0x00;  // break footer
        expect(validateInternalStructure(buf, 'image/jpeg')).toBe(false);
    });

    it('should validate valid PDF buffer', () => {
        expect(validateInternalStructure(makePdfBuffer(), 'application/pdf')).toBe(true);
    });

    it('should reject PDF without startxref', () => {
        const buf = Buffer.from('%PDF-1.7\ncontent without footer\n', 'utf8');
        expect(validateInternalStructure(buf, 'application/pdf')).toBe(false);
    });

    it('should return true for unknown MIME type (no validation available)', () => {
        const buf = Buffer.alloc(100, 0xaa);
        expect(validateInternalStructure(buf, 'application/unknown')).toBe(true);
    });

    it('should validate valid PNG buffer', () => {
        const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const ihdr = Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]); // length + IHDR
        const rest = Buffer.alloc(100);
        const png = Buffer.concat([pngHeader, ihdr, rest]);
        expect(validateInternalStructure(png, 'image/png')).toBe(true);
    });
});

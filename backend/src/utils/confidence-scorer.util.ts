/**
 * Confidence Scorer
 *
 * Computes a 0–100 confidence score for a recovered file based on:
 *   - Header match quality        (0–30 pts)
 *   - Footer match quality        (0–20 pts)
 *   - Entropy range validity      (0–20 pts)
 *   - Metadata consistency        (0–30 pts)
 *
 * Penalties applied for:
 *   - Footer distance out of plausible range (-10)
 *   - Byte continuity failure                (-10)
 *   - Internal structure validation failure  (-15)
 */

import { calculateEntropy, entropyRangeScore } from './entropy.util';

export interface ScoringInput {
    /** Raw carved/recovered bytes */
    data: Buffer;
    /** Whether the file header signature was found */
    hasValidHeader: boolean;
    /** Whether the file footer signature was found (null if format has no footer) */
    hasValidFooter: boolean | null;
    /** Whether footer distance is within plausible size limits */
    footerDistanceOk: boolean;
    /** Whether byte continuity fraction is above 0.3 */
    byteContinuityOk: boolean;
    /** Expected MIME type (used to select entropy range) */
    mimeType: string;
    /** Additional metadata fields found (filename, size, modified date, etc.) */
    metadataFieldCount: number;
    /** Whether internal structure validation passed (e.g., PDF xref, ZIP central dir) */
    internalStructureValid: boolean;
}

export interface ScoreBreakdown {
    total: number;          // 0–100 final score
    headerMatchScore: number;
    footerMatchScore: number;
    entropyRangeScore: number;
    metadataScore: number;
    penalties: number;
    hasValidHeader: boolean;
    hasValidFooter: boolean;
    footerDistanceOk: boolean;
    byteContinuityOk: boolean;
}

/** Entropy ranges by MIME group */
const ENTROPY_RANGES: Record<string, [number, number]> = {
    'image/jpeg': [6.0, 8.0],
    'image/png': [6.5, 8.0],
    'image/gif': [5.5, 8.0],
    'application/pdf': [3.5, 7.5],
    'application/zip': [7.5, 8.0],
    'application/gzip': [7.5, 8.0],
    'application/x-msdownload': [4.0, 8.0],
    'video/mp4': [6.5, 8.0],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [7.0, 8.0],
    'default': [2.0, 8.0],
};

export function scoreConfidence(input: ScoringInput): ScoreBreakdown {
    // ── Header match (0–30) ───────────────────────────────────────────
    const headerMatchScore = input.hasValidHeader ? 30 : 0;

    // ── Footer match (0–20) ───────────────────────────────────────────
    // If format has no reliable footer (null), award 10 pts by default (neutral)
    let footerMatchScore: number;
    if (input.hasValidFooter === null) {
        footerMatchScore = 10; // format doesn't use footers
    } else {
        footerMatchScore = input.hasValidFooter ? 20 : 0;
    }

    // ── Entropy range (0–20) ─────────────────────────────────────────
    const [eMin, eMax] = ENTROPY_RANGES[input.mimeType] ?? ENTROPY_RANGES['default'];
    const entropy = calculateEntropy(input.data.slice(0, Math.min(65536, input.data.length)));
    const eScore = entropyRangeScore(entropy, eMin, eMax);

    // ── Metadata consistency (0–30) ──────────────────────────────────
    // Max 30: each metadata field found adds up to 6 pts, capped at 5 fields
    const metadataScore = Math.min(30, input.metadataFieldCount * 6);

    // ── Penalties ────────────────────────────────────────────────────
    let penalties = 0;
    if (!input.footerDistanceOk) penalties += 10;
    if (!input.byteContinuityOk) penalties += 10;
    if (!input.internalStructureValid) penalties += 15;
    // If no header AND no footer → heavy penalty
    if (!input.hasValidHeader && !input.hasValidFooter) penalties += 20;

    const total = Math.max(0, Math.min(100,
        headerMatchScore + footerMatchScore + eScore + metadataScore - penalties,
    ));

    return {
        total,
        headerMatchScore,
        footerMatchScore,
        entropyRangeScore: eScore,
        metadataScore,
        penalties,
        hasValidHeader: input.hasValidHeader,
        hasValidFooter: input.hasValidFooter ?? false,
        footerDistanceOk: input.footerDistanceOk,
        byteContinuityOk: input.byteContinuityOk,
    };
}

/**
 * Perform lightweight internal structure validation for known formats.
 * Returns true if the file appears internally consistent.
 */
export function validateInternalStructure(data: Buffer, mimeType: string): boolean {
    try {
        switch (mimeType) {
            case 'application/pdf': {
                // Must contain 'PDF-' near start and 'xref' or 'startxref'
                const head = data.slice(0, 1024).toString('ascii', 0, Math.min(1024, data.length));
                const tail = data.slice(-1024).toString('ascii');
                return head.includes('PDF-') && (tail.includes('startxref') || tail.includes('xref'));
            }
            case 'application/zip':
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
                // Must have PK local file header at start (50 4B 03 04)
                return data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
            }
            case 'image/png': {
                // Must have PNG signature and IHDR chunk at offset 8
                const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
                for (let i = 0; i < 8; i++) {
                    if (data[i] !== sig[i]) return false;
                }
                // IHDR chunk type at offset 12
                return (
                    data[12] === 0x49 && data[13] === 0x48 && data[14] === 0x44 && data[15] === 0x52
                );
            }
            case 'image/jpeg': {
                // FF D8 at start, FF D9 at end
                return (
                    data[0] === 0xff && data[1] === 0xd8 &&
                    data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9
                );
            }
            case 'application/x-msdownload': {
                // PE: MZ at start, PE signature at e_lfanew offset
                if (data[0] !== 0x4d || data[1] !== 0x5a) return false;
                const peOffset = data.readUInt32LE(0x3c);
                if (peOffset + 4 > data.length) return false;
                return data[peOffset] === 0x50 && data[peOffset + 1] === 0x45;
            }
            default:
                return true; // no specific validation available
        }
    } catch {
        return false;
    }
}

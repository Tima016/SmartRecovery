/**
 * Shannon Entropy Utility
 *
 * Computes per-byte Shannon entropy of a buffer.
 * H = -Σ(p_i * log2(p_i))  for each distinct byte value 0–255
 *
 * Result range: 0 (uniform / all same bytes) → 8 (maximum entropy, random data)
 */
export function calculateEntropy(buffer: Buffer): number {
    if (!buffer || buffer.length === 0) return 0;

    // Frequency table: count[byteValue] = occurrences
    const count = new Uint32Array(256);
    for (let i = 0; i < buffer.length; i++) {
        count[buffer[i]]++;
    }

    const len = buffer.length;
    let entropy = 0;

    for (let i = 0; i < 256; i++) {
        if (count[i] === 0) continue;
        const p = count[i] / len;
        entropy -= p * Math.log2(p);
    }

    // Clamp to [0, 8] to guard against floating-point noise
    return Math.max(0, Math.min(8, entropy));
}

/**
 * Classify entropy value into a forensic category.
 */
export function classifyEntropy(entropy: number): EntropyClass {
    if (entropy < 1.0) return 'UNIFORM';         // e.g. zeroed sectors, constant fill
    if (entropy < 3.5) return 'STRUCTURED_TEXT'; // e.g. ASCII logs, registry text
    if (entropy < 6.5) return 'BINARY_DATA';     // e.g. executables, database pages
    if (entropy < 7.5) return 'COMPRESSED';      // e.g. ZIP, PNG (deflate)
    return 'ENCRYPTED_OR_RANDOM';                // e.g. AES-encrypted data, random padding
}

export type EntropyClass =
    | 'UNIFORM'
    | 'STRUCTURED_TEXT'
    | 'BINARY_DATA'
    | 'COMPRESSED'
    | 'ENCRYPTED_OR_RANDOM';

/**
 * Compute entropy score out of 20 points for confidence scoring.
 *   Expected entropy range by file type is supplied by the caller.
 *   Returns 20 if entropy falls in expected range, scales down proportionally outside it.
 */
export function entropyRangeScore(
    entropy: number,
    expectedMin: number,
    expectedMax: number,
): number {
    if (entropy >= expectedMin && entropy <= expectedMax) return 20;
    const distance = Math.min(
        Math.abs(entropy - expectedMin),
        Math.abs(entropy - expectedMax),
    );
    // Deduct 4 points per 0.5 bits out-of-range, minimum 0
    return Math.max(0, 20 - Math.floor(distance / 0.5) * 4);
}

/**
 * Compute byte-continuity: fraction of adjacent byte-pair transitions
 * that fall within a "natural" delta (< 64).  High continuity → structured content.
 */
export function byteContinuity(buffer: Buffer): number {
    if (buffer.length < 2) return 1;
    let inRange = 0;
    for (let i = 1; i < buffer.length; i++) {
        if (Math.abs(buffer[i] - buffer[i - 1]) < 64) inRange++;
    }
    return inRange / (buffer.length - 1);
}

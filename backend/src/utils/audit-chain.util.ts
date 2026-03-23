import { sha256 } from './crypto.util';

/**
 * Compute a hash-chain record hash.
 * Each record's hash depends on the previous record's hash,
 * making the chain tamper-evident.
 */
export function computeRecordHash(fields: {
    prevHash: string | null | undefined;
    entityId: string;
    action: string;
    performedById: string;
    timestamp: Date;
}): string {
    const data = [
        fields.prevHash ?? 'GENESIS',
        fields.entityId,
        fields.action,
        fields.performedById,
        fields.timestamp.toISOString(),
    ].join('|');
    return sha256(data);
}

/**
 * Verify a hash chain for an array of ordered records.
 * Returns the index of the first tampered record, or -1 if chain is intact.
 */
export function verifyHashChain(
    records: Array<{
        id: string;
        prevHash: string | null;
        recordHash: string;
        action: string;
        performedById?: string;
        userId?: string;
        entityId?: string;
        performedAt?: Date;
        createdAt?: Date;
    }>,
): { valid: boolean; tamperedAtIndex: number } {
    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const prev = i === 0 ? null : records[i - 1].recordHash;

        const expected = computeRecordHash({
            prevHash: prev,
            entityId: r.entityId ?? r.id,
            action: r.action,
            performedById: r.performedById ?? r.userId ?? '',
            timestamp: r.performedAt ?? r.createdAt ?? new Date(),
        });

        if (expected !== r.recordHash) {
            return { valid: false, tamperedAtIndex: i };
        }
    }
    return { valid: true, tamperedAtIndex: -1 };
}

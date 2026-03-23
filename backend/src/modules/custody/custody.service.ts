import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedlockService } from '../../common/redlock/redlock.service';
import { AuditService } from '../audit/audit.service';
import { computeRecordHash, verifyHashChain } from '../../utils/audit-chain.util';
import { v4 as uuidv4 } from 'uuid';

interface AddCustodyRecordOptions {
    evidenceId: string;
    action: string;
    performedById: string;
    notes?: string;
    signature?: string;
    ipAddress?: string;
}

@Injectable()
export class CustodyService {
    private readonly logger = new Logger(CustodyService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redlock: RedlockService,
        private readonly audit: AuditService,
    ) { }

    /**
     * Adds a new tamper-evident custody record.
     * Uses Redlock to prevent hash-chain race conditions under concurrent writes.
     * Wrapped in a DB transaction to ensure hash-chain + record are written atomically.
     */
    async addRecord(opts: AddCustodyRecordOptions): Promise<void> {
        const lockKey = `custody:${opts.evidenceId}`;

        await this.redlock.using(lockKey, 10_000, async () => {
            await this.prisma.$transaction(async (tx) => {
                // Get the previous record *inside the transaction* to prevent TOCTOU
                const last = await tx.chainOfCustody.findFirst({
                    where: { evidenceId: opts.evidenceId },
                    orderBy: { performedAt: 'desc' },
                    select: { recordHash: true },
                });

                const now = new Date();
                const recordHash = computeRecordHash({
                    prevHash: last?.recordHash ?? null,
                    entityId: opts.evidenceId,
                    action: opts.action,
                    performedById: opts.performedById,
                    timestamp: now,
                });

                await tx.chainOfCustody.create({
                    data: {
                        id: uuidv4(),
                        evidenceId: opts.evidenceId,
                        action: opts.action,
                        notes: opts.notes,
                        performedById: opts.performedById,
                        performedAt: now,
                        prevHash: last?.recordHash ?? null,
                        recordHash,
                        signature: opts.signature,
                    },
                });
            });
        });
    }

    async getChain(evidenceId: string) {
        return this.prisma.chainOfCustody.findMany({
            where: { evidenceId },
            orderBy: { performedAt: 'asc' },
            include: {
                performedBy: {
                    select: { id: true, email: true, firstName: true, lastName: true },
                },
            },
        });
    }

    async verifyChain(
        evidenceId: string,
    ): Promise<{ valid: boolean; tamperedAtIndex: number; recordCount: number }> {
        const records = await this.prisma.chainOfCustody.findMany({
            where: { evidenceId },
            orderBy: { performedAt: 'asc' },
        });

        const result = verifyHashChain(
            records.map((r) => ({
                id: r.id,
                prevHash: r.prevHash,
                recordHash: r.recordHash,
                action: r.action,
                performedById: r.performedById,
                entityId: r.evidenceId,
                performedAt: r.performedAt,
            })),
        );

        return { ...result, recordCount: records.length };
    }
}

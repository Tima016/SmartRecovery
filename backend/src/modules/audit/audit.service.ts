import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { computeRecordHash } from '../../utils/audit-chain.util';
import { AuditAction } from '@prisma/client';

interface LogOptions {
    userId?: string;
    action: AuditAction;
    entityType?: string;
    entityId?: string;
    caseId?: string;
    evidenceId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
}

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);

    constructor(private readonly prisma: PrismaService) { }

    async log(opts: LogOptions): Promise<void> {
        try {
            // Get last log entry for hash chain
            const last = await this.prisma.auditLog.findFirst({
                orderBy: { createdAt: 'desc' },
                select: { recordHash: true },
            });

            const now = new Date();
            const recordHash = computeRecordHash({
                prevHash: last?.recordHash ?? null,
                entityId: opts.entityId ?? opts.userId ?? 'system',
                action: opts.action,
                performedById: opts.userId ?? 'system',
                timestamp: now,
            });

            await this.prisma.auditLog.create({
                data: {
                    userId: opts.userId,
                    action: opts.action,
                    entityType: opts.entityType,
                    entityId: opts.entityId,
                    caseId: opts.caseId,
                    evidenceId: opts.evidenceId,
                    details: opts.details ? opts.details : undefined,
                    ipAddress: opts.ipAddress,
                    userAgent: opts.userAgent,
                    requestId: opts.requestId,
                    prevHash: last?.recordHash ?? null,
                    recordHash,
                    createdAt: now,
                },
            });
        } catch (err) {
            this.logger.error('Failed to write audit log', err);
        }
    }

    async getLogs(page = 1, limit = 50, filters?: { userId?: string; action?: AuditAction; caseId?: string }) {
        const skip = (page - 1) * limit;
        const where: any = {};
        if (filters?.userId) where.userId = filters.userId;
        if (filters?.action) where.action = filters.action;
        if (filters?.caseId) where.caseId = filters.caseId;

        const [data, total] = await this.prisma.$transaction([
            this.prisma.auditLog.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { email: true, firstName: true, lastName: true } } },
            }),
            this.prisma.auditLog.count({ where }),
        ]);

        return { data, total, page, limit, pages: Math.ceil(total / limit) };
    }

    async verifyChainIntegrity(): Promise<{ valid: boolean; tamperedAtIndex: number }> {
        const { verifyHashChain } = await import('../../utils/audit-chain.util');
        const records = await this.prisma.auditLog.findMany({
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                prevHash: true,
                recordHash: true,
                action: true,
                userId: true,
                entityId: true,
                createdAt: true,
            },
        });
        return verifyHashChain(
            records.map((r) => ({
                ...r,
                action: r.action as string,
                performedById: r.userId ?? 'system',
                entityId: r.entityId ?? r.id,
                createdAt: r.createdAt,
            })),
        );
    }
}

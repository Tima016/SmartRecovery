import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCaseDto, UpdateCaseDto, AssignCaseDto, AddCaseMemberDto } from './dto/cases.dto';
import { AuditAction, CaseStatus, UserRole } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CasesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: AuditService,
    ) { }

    // Strict transition enforce map
    private readonly allowedTransitions: Record<CaseStatus, CaseStatus[]> = {
        CREATED: [CaseStatus.IMAGING],
        IMAGING: [CaseStatus.HASHING, CaseStatus.ERROR],
        HASHING: [CaseStatus.SCANNING, CaseStatus.ERROR],
        SCANNING: [CaseStatus.ANALYZING, CaseStatus.ERROR],
        ANALYZING: [CaseStatus.READY, CaseStatus.ERROR],
        READY: [CaseStatus.CLOSED],
        ERROR: [],
        CLOSED: [],
        ARCHIVED: []
    };

    /**
     * Advances the case status securely using Optimistic Concurrency Control (OCC)
     */
    async advanceCaseStatus(caseId: string, expectedVersion: number, targetStatus: CaseStatus) {
        return await this.prisma.$transaction(async (tx) => {
            // 1. Fetch case with current status locked implicitly by snapshot
            const currentCase = await tx.case.findUnique({
                where: { id: caseId },
                select: { status: true, version: true }
            });

            if (!currentCase) throw new NotFoundException('Case not found');

            // 2. Validate Transition
            const allowed = this.allowedTransitions[currentCase.status];
            if (!allowed.includes(targetStatus)) {
                throw new BadRequestException(`Illegal status transition from ${currentCase.status} to ${targetStatus}`);
            }

            // 3. Optimistic Concurrency Control (OCC) Verification
            if (currentCase.version !== expectedVersion) {
                throw new ConflictException('Case state modified by another process. Please synchronize and try again.');
            }

            // 4. Atomic Upgrade
            const updatedCase = await tx.case.update({
                where: { id: caseId, version: expectedVersion },
                data: {
                    status: targetStatus,
                    version: { increment: 1 }
                },
                include: this.caseIncludes()
            });

            return updatedCase;
        });
    }

    async create(dto: CreateCaseDto, userId: string, ipAddress?: string) {
        const caseNumber = `DFIP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
        const newCase = await this.prisma.case.create({
            data: {
                id: uuidv4(),
                caseNumber,
                title: dto.title,
                description: dto.description,
                priority: dto.priority,
                classification: dto.classification,
                tags: dto.tags ?? [],
                createdById: userId,
                assignedToId: dto.assignedToId,
            },
            include: this.caseIncludes(),
        });

        await this.auditService.log({
            userId,
            action: AuditAction.CASE_CREATE,
            entityType: 'Case',
            entityId: newCase.id,
            caseId: newCase.id,
            details: { caseNumber, title: dto.title },
            ipAddress,
        });

        return newCase;
    }

    async getAuditLogs(caseId: string, page = 1, limit = 100) {
        return this.auditService.getLogs(page, limit, { caseId });
    }

    async findAll(
        page = 1,
        limit = 20,
        filters?: { status?: CaseStatus; assignedToId?: string; createdById?: string },
        user?: { id: string; role: string },
    ) {
        const skip = (page - 1) * limit;
        const where: any = {};
        if (filters?.status) where.status = filters.status;
        if (filters?.assignedToId) where.assignedToId = filters.assignedToId;
        if (filters?.createdById) where.createdById = filters.createdById;

        // USER can only see their own cases, ADMIN sees all
        if (user && user.role !== 'ADMIN') {
            where.createdById = user.id;
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.case.findMany({
                where,
                skip,
                take: limit,
                orderBy: { openedAt: 'desc' },
                include: this.caseIncludes(),
            }),
            this.prisma.case.count({ where }),
        ]);

        return { data, total, page, limit, pages: Math.ceil(total / limit) };
    }

    async findOne(id: string) {
        const c = await this.prisma.case.findUnique({
            where: { id },
            include: {
                ...this.caseIncludes(),
                members: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } } },
            },
        });
        if (!c) throw new NotFoundException(`Case ${id} not found`);
        return c;
    }

    async update(id: string, dto: UpdateCaseDto, userId: string, ipAddress?: string) {
        await this.findOne(id);

        // Strip status from DTO — status changes must go through advanceCaseStatus()
        const { status, ...safeDto } = dto as any;
        if (status) {
            throw new BadRequestException(
                'Cannot update status directly. Use the dedicated status transition endpoints.',
            );
        }

        const updated = await this.prisma.case.update({
            where: { id },
            data: { ...safeDto },
            include: this.caseIncludes(),
        });

        await this.auditService.log({
            userId,
            action: AuditAction.CASE_UPDATE,
            entityType: 'Case',
            entityId: id,
            details: safeDto as any,
            ipAddress,
        });

        return updated;
    }

    async close(id: string, userId: string, ipAddress?: string) {
        const c = await this.findOne(id);

        // Validate transition via state machine
        const allowed = this.allowedTransitions[c.status];
        if (!allowed || !allowed.includes(CaseStatus.CLOSED)) {
            throw new BadRequestException(
                `Cannot close case in ${c.status} state. Only cases in READY state can be closed.`,
            );
        }

        // Use OCC for safe status transition
        const updated = await this.prisma.case.update({
            where: { id, version: c.version },
            data: { status: CaseStatus.CLOSED, closedAt: new Date(), version: { increment: 1 } },
            include: this.caseIncludes(),
        });

        await this.auditService.log({
            userId,
            action: AuditAction.CASE_CLOSE,
            entityType: 'Case',
            entityId: id,
            ipAddress,
        });

        return updated;
    }

    async assign(id: string, dto: AssignCaseDto, userId: string, ipAddress?: string) {
        await this.findOne(id);
        const investigator = await this.prisma.user.findUnique({ where: { id: dto.investigatorId } });
        if (!investigator) throw new NotFoundException('Investigator not found');
        if (investigator.role !== UserRole.USER && investigator.role !== UserRole.ADMIN) {
            throw new ForbiddenException('User must be a USER or ADMIN');
        }

        const updated = await this.prisma.case.update({
            where: { id },
            data: { assignedToId: dto.investigatorId },
            include: this.caseIncludes(),
        });

        await this.auditService.log({
            userId,
            action: AuditAction.CASE_ASSIGN,
            entityType: 'Case',
            entityId: id,
            details: { assignedToId: dto.investigatorId },
            ipAddress,
        });

        return updated;
    }

    async addMember(id: string, dto: AddCaseMemberDto, userId: string) {
        await this.findOne(id);
        return this.prisma.caseMember.upsert({
            where: { caseId_userId: { caseId: id, userId: dto.userId } },
            update: { permissions: dto.permissions ?? ['READ'] },
            create: { id: uuidv4(), caseId: id, userId: dto.userId, permissions: dto.permissions ?? ['READ'] },
        });
    }

    async getSummary(id: string) {
        const c = await this.findOne(id);
        const [evidenceCount, timelineCount, artifactCount] = await this.prisma.$transaction([
            this.prisma.evidence.count({ where: { caseId: id } }),
            this.prisma.timelineEvent.count({ where: { caseId: id } }),
            this.prisma.artifact.count({ where: { caseId: id } }),
        ]);

        return {
            case: c,
            statistics: {
                evidenceCount,
                timelineCount,
                artifactCount,
            },
        };
    }

    async getFileSystem(caseId: string, parentPath: string = '/', page = 1, limit = 100) {
        await this.findOne(caseId);

        let resolvedParentPath = parentPath;
        if (parentPath && !parentPath.startsWith('/')) {
            const parentEntry = await (this.prisma as any).fileSystemEntry.findFirst({
                where: { id: parentPath, caseId },
                select: { path: true, isDirectory: true },
            });
            if (parentEntry?.isDirectory) {
                resolvedParentPath = parentEntry.path;
            }
        }

        const skip = (page - 1) * limit;
        const [data, total] = await this.prisma.$transaction([
            (this.prisma as any).fileSystemEntry.findMany({
                where: { caseId, parentPath: resolvedParentPath },
                skip,
                take: limit,
                orderBy: [
                    { isDirectory: 'desc' },
                    { name: 'asc' },
                ],
            }),
            (this.prisma as any).fileSystemEntry.count({
                where: { caseId, parentPath: resolvedParentPath },
            }),
        ]);

        if (total === 0 && resolvedParentPath === '/') {
            const carved = await this.prisma.recoveredFile.findMany({
                where: { caseId },
                take: limit,
                orderBy: { confidence: 'desc' },
            });
            const carvedEntries = carved.map((f) => ({
                id: f.id,
                caseId,
                evidenceId: f.evidenceId,
                path: `/${f.filename}`,
                name: f.filename,
                isDirectory: false,
                isDeleted: false,
                sizeBytes: f.sizeBytes?.toString() ?? '0',
                createdAt: f.recoveredAt,
                modifiedAt: f.recoveredAt,
                accessedAt: f.recoveredAt,
                mftChangedAt: null,
                parentPath: '/',
                permissions: null,
                uid: null,
                gid: null,
                inode: null,
                fileType: f.mimeType,
                fsType: 'CARVED',
                attributes: null,
            }));
            return {
                data: carvedEntries,
                total: carvedEntries.length,
                page,
                limit,
                pages: carvedEntries.length > 0 ? 1 : 0,
            };
        }

        return { data, total, page, limit, pages: Math.ceil(total / limit) };
    }

    async getDeletedFileSystem(caseId: string, page = 1, limit = 100) {
        await this.findOne(caseId);

        const skip = (page - 1) * limit;
        const [data, total] = await this.prisma.$transaction([
            (this.prisma as any).fileSystemEntry.findMany({
                where: { caseId, isDeleted: true },
                skip,
                take: limit,
                orderBy: { parentPath: 'asc' },
            }),
            (this.prisma as any).fileSystemEntry.count({
                where: { caseId, isDeleted: true },
            }),
        ]);
        return { data, total, page, limit, pages: Math.ceil(total / limit) };
    }

    async keywordSearch(caseId: string, keyword: string) {
        const q = (keyword ?? '').trim();
        if (!q) {
            return {
                keyword: q,
                totalHits: 0,
                files: [],
                artifacts: [],
                timelineEvents: [],
            };
        }

        const artifactOr: any[] = [
            { source: { contains: q, mode: 'insensitive' } },
        ];

        const upperQ = q.toUpperCase();
        const artifactTypes = [
            'BROWSER_HISTORY',
            'REGISTRY_HIVE',
            'EVENT_LOG',
            'PREFETCH',
            'USB_LOG',
            'NETWORK_CAPTURE',
        ];
        if (artifactTypes.includes(upperQ)) {
            artifactOr.push({ type: upperQ });
        }

        const [files, artifacts, timeline] = await Promise.all([
            this.prisma.recoveredFile.findMany({
                where: {
                    caseId,
                    filename: { contains: q, mode: 'insensitive' },
                },
                take: 100,
            }),
            this.prisma.artifact.findMany({
                where: {
                    caseId,
                    OR: artifactOr,
                },
                take: 50,
            }),
            this.prisma.timelineEvent.findMany({
                where: {
                    caseId,
                    description: { contains: q, mode: 'insensitive' },
                },
                take: 50,
            }),
        ]);

        return {
            keyword: q,
            totalHits: files.length + artifacts.length + timeline.length,
            files: files.map(f => ({ ...f, sizeBytes: f.sizeBytes?.toString() })),
            artifacts,
            timelineEvents: timeline,
        };
    }

    async hashLookup(caseId: string, hash: string) {
        const hashLower = (hash ?? '').toLowerCase().trim();
        if (!hashLower) {
            return { hash, found: false, files: [] };
        }

        const files = await this.prisma.recoveredFile.findMany({
            where: {
                caseId,
                OR: [
                    { sha256: hashLower },
                    { md5: hashLower },
                    { evidenceHash: hashLower },
                ],
            },
        });

        return {
            hash,
            found: files.length > 0,
            files: files.map(f => ({ ...f, sizeBytes: f.sizeBytes?.toString() })),
        };
    }

    async getDashboardStats(userId: string, userRole?: string) {
        const caseFilter = userRole !== 'ADMIN' ? { createdById: userId } : {};

        const [totalCases, activeCases, totalEvidence, totalCarved] = await Promise.all([
            this.prisma.case.count({ where: caseFilter }),
            this.prisma.case.count({
                where: { ...caseFilter, status: { in: [CaseStatus.IMAGING, CaseStatus.HASHING, CaseStatus.SCANNING, CaseStatus.ANALYZING] } },
            }),
            this.prisma.evidence.count({
                where: userRole !== 'ADMIN' ? { case: { createdById: userId } } : {},
            }),
            this.prisma.recoveredFile.count({
                where: userRole !== 'ADMIN' ? { case: { createdById: userId } } : {},
            }),
        ]);

        const recentCases = await this.prisma.case.findMany({
            where: caseFilter,
            orderBy: { updatedAt: 'desc' },
            take: 5,
            include: {
                createdBy: { select: { firstName: true, lastName: true } },
                _count: { select: { evidence: true } },
            },
        });

        return {
            totalCases,
            activeCases,
            totalEvidence,
            totalCarved,
            recentCases: recentCases.map(c => ({
                ...c,
                createdByName: `${c.createdBy.firstName} ${c.createdBy.lastName}`,
                evidenceCount: c._count.evidence,
            })),
        };
    }

    private caseIncludes() {
        return {
            createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
            assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
            _count: { select: { evidence: true, timelineEvents: true, artifacts: true } },
        } as const;
    }
}

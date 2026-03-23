import {
    Injectable,
    NotFoundException,
    Logger,
    OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MinioService } from '../../common/minio/minio.service';
import { AuditService } from '../audit/audit.service';
import {
    RecoveryMethod,
    RecoveryStatus,
    FragmentStatus,
    AuditAction,
} from '@prisma/client';
import { carveFiles } from '../../utils/file-carver.util';
import { calculateEntropy, byteContinuity } from '../../utils/entropy.util';
import { linkFragments, RawFragment, FRAGMENT_LINKER_VERSION } from '../../utils/fragment-linker.util';
import { scoreConfidence, validateInternalStructure } from '../../utils/confidence-scorer.util';
import { decryptBuffer } from '../../utils/crypto.util';
import { createImageReader } from '../../utils/disk-image.util';
import { v4 as uuidv4 } from 'uuid';
import { TriggerRecoveryDto, RecoveredFilesQueryDto } from './dto/recovery.dto';
import * as crypto from 'crypto';

// ── Versioning (persisted on every output for forensic reproducibility) ──
export const ALGORITHM_VERSION = '1.0.0';
export const SCORING_MODEL_VERSION = '1.0.0';

/** Chunk size for processing large evidence buffers: 4 MB */
const CHUNK_SIZE = 4 * 1024 * 1024;

/** Max heap usage fraction before aborting (80%) */
const MAX_HEAP_FRACTION = 0.80;

/** Allowed sort fields for query DTO (prevents arbitrary column access) */
const ALLOWED_SORT_FIELDS = new Set(['confidence', 'recoveredAt', 'sizeBytes', 'method', 'entropyScore']);

@Injectable()
export class RecoveryService implements OnModuleDestroy {
    private readonly logger = new Logger(RecoveryService.name);
    private readonly recoveryQueue: Queue;

    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: AuditService,
        private readonly configService: ConfigService,
        private readonly minioService: MinioService,
    ) {
        this.recoveryQueue = new Queue('recovery-jobs', {
            connection: {
                host: configService.get<string>('REDIS_HOST', 'localhost'),
                port: configService.get<number>('REDIS_PORT', 6379),
                password: configService.get<string>('REDIS_PASSWORD'),
            },
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { count: 500 },
                removeOnFail: { count: 1000 },
            },
        });
    }

    /** Graceful cleanup via NestJS lifecycle (not process.on) */
    async onModuleDestroy(): Promise<void> {
        await this.recoveryQueue.close();
        this.logger.log('Recovery queue closed gracefully');
    }

    // ──────────────────────────────────────────────────────────────
    // MEMORY GUARD
    // ──────────────────────────────────────────────────────────────

    private checkMemory(): void {
        const usage = process.memoryUsage();
        const maxHeap = usage.heapTotal;
        const usedFraction = usage.heapUsed / maxHeap;
        if (usedFraction > MAX_HEAP_FRACTION) {
            throw new Error(
                `Memory guard: heap usage ${(usedFraction * 100).toFixed(1)}% exceeds ` +
                `${(MAX_HEAP_FRACTION * 100).toFixed(0)}% threshold. ` +
                `Used: ${(usage.heapUsed / 1024 / 1024).toFixed(0)} MB / ${(maxHeap / 1024 / 1024).toFixed(0)} MB`,
            );
        }
    }

    // ──────────────────────────────────────────────────────────────
    // PUBLIC: trigger recovery job
    // ──────────────────────────────────────────────────────────────

    async triggerRecovery(
        caseId: string,
        dto: TriggerRecoveryDto,
        userId: string,
        ipAddress?: string,
    ) {
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        // Idempotency: deduplicate by composite key
        const idempotencyKey = `recovery:${caseId}:${dto.evidenceId ?? 'all'}:${dto.method ?? 'ALL'}`;

        const job = await this.recoveryQueue.add(
            'run-recovery',
            { caseId, evidenceId: dto.evidenceId, method: dto.method, userId },
            {
                jobId: idempotencyKey, // BullMQ deduplicates by jobId
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            },
        );

        await this.auditService.log({
            userId,
            action: AuditAction.ARTIFACT_EXTRACT,
            entityType: 'Case',
            entityId: caseId,
            details: {
                job: 'recovery',
                queueJobId: job.id,
                method: dto.method ?? 'ALL',
                algorithmVersion: ALGORITHM_VERSION,
                scoringModelVersion: SCORING_MODEL_VERSION,
            },
            ipAddress,
        });

        void this.runRecovery(caseId, dto.evidenceId, dto.method, userId).catch((err) =>
            this.logger.error(`Recovery job failed: ${err.message}`, err.stack),
        );

        return { queued: true, jobId: job.id, caseId };
    }

    // ──────────────────────────────────────────────────────────────
    // RECOVERY ALGORITHMS
    // ──────────────────────────────────────────────────────────────

    async runRecovery(
        caseId: string,
        evidenceId: string | undefined,
        method: RecoveryMethod | undefined,
        userId: string,
    ): Promise<{ recoveredCount: number; fragmentCount: number }> {
        this.checkMemory();

        const evidenceList = evidenceId
            ? await this.prisma.evidence.findMany({ where: { id: evidenceId, caseId } })
            : await this.prisma.evidence.findMany({ where: { caseId } });

        if (evidenceList.length === 0) {
            this.logger.warn(`No evidence found for case ${caseId}`);
            return { recoveredCount: 0, fragmentCount: 0 };
        }

        let totalRecovered = 0;
        let totalFragments = 0;

        for (const ev of evidenceList) {
            this.logger.log(`Processing evidence ${ev.id} for recovery (alg=${ALGORITHM_VERSION})`);
            this.checkMemory(); // check before each evidence item

            const applyAll = !method;

            if (applyAll || method === RecoveryMethod.METADATA) {
                const count = await this.recoverByMetadata(caseId, ev.id, userId);
                totalRecovered += count;
            }
            if (applyAll || method === RecoveryMethod.CARVING) {
                const count = await this.recoverByCarving(caseId, ev.id, userId);
                totalRecovered += count;
            }
            if (applyAll || method === RecoveryMethod.FRAGMENT_LINK) {
                const count = await this.recoverByFragmentLinking(caseId, ev.id, userId);
                totalFragments += count;
            }
        }

        return { recoveredCount: totalRecovered, fragmentCount: totalFragments };
    }

    /**
     * METADATA-BASED RECOVERY
     */
    async recoverByMetadata(caseId: string, evidenceId: string, _userId: string): Promise<number> {
        const ev = await this.prisma.evidence.findUnique({ where: { id: evidenceId } });
        if (!ev) return 0;

        const existing = await this.prisma.recoveredFile.findFirst({
            where: { caseId, evidenceId, method: RecoveryMethod.METADATA },
        });
        if (existing) return 0;

        const metadataFieldCount = [ev.originalFilename, ev.mimeType, ev.sha256, ev.sha1, ev.md5]
            .filter(Boolean).length;

        const score = scoreConfidence({
            data: Buffer.alloc(0),
            hasValidHeader: false,
            hasValidFooter: null,
            footerDistanceOk: true,
            byteContinuityOk: true,
            mimeType: ev.mimeType ?? 'application/octet-stream',
            metadataFieldCount,
            internalStructureValid: true,
        });

        await this.prisma.recoveredFile.create({
            data: {
                id: uuidv4(),
                caseId,
                evidenceId,
                filename: ev.originalFilename,
                mimeType: ev.mimeType,
                sizeBytes: ev.sizeBytes,
                method: RecoveryMethod.METADATA,
                status: RecoveryStatus.COMPLETED,
                confidence: score.total,
                sha256: ev.sha256,
                md5: ev.md5,
                headerMatchScore: score.headerMatchScore,
                footerMatchScore: score.footerMatchScore,
                entropyRangeScore: score.entropyRangeScore,
                metadataScore: score.metadataScore,
                hasValidHeader: score.hasValidHeader,
                hasValidFooter: score.hasValidFooter,
                footerDistanceOk: score.footerDistanceOk,
                byteContinuityOk: score.byteContinuityOk,
                storageBucket: ev.storageBucket,
                storageKey: ev.storageKey,
                algorithmVersion: ALGORITHM_VERSION,
                scoringModelVersion: SCORING_MODEL_VERSION,
                evidenceHash: ev.sha256 ?? ev.md5 ?? null,
            },
        });

        return 1;
    }

    /**
     * RAW FILE CARVING — 4 MB chunks with 2 KB overlap.
     */
    async recoverByCarving(caseId: string, evidenceId: string, _userId: string): Promise<number> {
        const ev = await this.prisma.evidence.findUnique({ where: { id: evidenceId } });
        if (!ev) return 0;

        const evidenceBuffer = await this.getEvidenceBuffer(ev);
        const OVERLAP = 2048;
        const allCarved: ReturnType<typeof carveFiles> = [];
        let offset = 0;

        while (offset < evidenceBuffer.length) {
            this.checkMemory();
            const end = Math.min(offset + CHUNK_SIZE + OVERLAP, evidenceBuffer.length);
            const chunk = evidenceBuffer.subarray(offset, end);
            allCarved.push(...carveFiles(chunk, offset));
            offset += CHUNK_SIZE;
        }

        let count = 0;
        for (const file of allCarved) {
            const internalOk = validateInternalStructure(file.data, file.mimeType);
            const score = scoreConfidence({
                data: file.data,
                hasValidHeader: file.headerFound,
                hasValidFooter: file.footerFound ? true : null,
                footerDistanceOk: file.footerDistanceOk,
                byteContinuityOk: file.byteContinuityOk,
                mimeType: file.mimeType,
                metadataFieldCount: 0,
                internalStructureValid: internalOk,
            });

            if (score.total < 20) continue;

            // Compute hash of carved data for forensic integrity
            const carvedHash = crypto.createHash('sha256').update(file.data).digest('hex');

            // Sanitize filename (no path traversal)
            const safeName = `carved_${file.signatureName}_${file.offsetStart}.${this.mimeToExt(file.mimeType)}`
                .replace(/[^a-zA-Z0-9._-]/g, '_');

            await this.prisma.recoveredFile.create({
                data: {
                    id: uuidv4(),
                    caseId,
                    evidenceId,
                    filename: safeName,
                    mimeType: file.mimeType,
                    sizeBytes: BigInt(file.sizeBytes),
                    method: RecoveryMethod.CARVING,
                    status: RecoveryStatus.COMPLETED,
                    confidence: score.total,
                    offsetStart: BigInt(file.offsetStart),
                    offsetEnd: BigInt(file.offsetEnd),
                    entropyScore: file.entropyScore,
                    headerSignature: file.headerSignature,
                    footerSignature: file.footerSignature,
                    headerMatchScore: score.headerMatchScore,
                    footerMatchScore: score.footerMatchScore,
                    entropyRangeScore: score.entropyRangeScore,
                    metadataScore: score.metadataScore,
                    hasValidHeader: score.hasValidHeader,
                    hasValidFooter: score.hasValidFooter,
                    footerDistanceOk: score.footerDistanceOk,
                    byteContinuityOk: score.byteContinuityOk,
                    algorithmVersion: ALGORITHM_VERSION,
                    scoringModelVersion: SCORING_MODEL_VERSION,
                    sha256: carvedHash,
                    evidenceHash: ev.sha256 ?? ev.md5 ?? null,
                },
            });
            count++;
        }
        return count;
    }

    /**
     * FRAGMENT DETECTION + PROBABILISTIC LINKING
     */
    async recoverByFragmentLinking(caseId: string, evidenceId: string, _userId: string): Promise<number> {
        const ev = await this.prisma.evidence.findUnique({ where: { id: evidenceId } });
        if (!ev) return 0;

        const evidenceBuffer = await this.getEvidenceBuffer(ev);
        const SECTOR = 4096;
        const rawFragments: RawFragment[] = [];
        let offset = 0;

        while (offset < evidenceBuffer.length) {
            this.checkMemory();
            const sector = evidenceBuffer.subarray(offset, Math.min(offset + SECTOR, evidenceBuffer.length));
            const entropy = calculateEntropy(sector);
            const continuity = byteContinuity(sector);

            if (entropy >= 1.5 && entropy <= 7.5) {
                rawFragments.push({
                    id: uuidv4(),
                    offsetStart: BigInt(offset),
                    offsetEnd: BigInt(Math.min(offset + SECTOR, evidenceBuffer.length)),
                    sizeBytes: BigInt(Math.min(SECTOR, evidenceBuffer.length - offset)),
                    entropyScore: entropy,
                    byteContinuity: continuity,
                    headerHint: this.detectHeaderHint(sector),
                    data: sector,
                });
            }
            offset += SECTOR;
        }

        if (rawFragments.length === 0) return 0;

        const groups = linkFragments(rawFragments);
        let persistedCount = 0;

        // Build a Map for O(1) lookup instead of O(n) array.find
        const fragMap = new Map<string, RawFragment>();
        for (const f of rawFragments) fragMap.set(f.id, f);

        for (const group of groups) {
            if (group.fragments.length < 2) continue;

            for (const member of group.fragments) {
                const rawFrag = fragMap.get(member.fragmentId);
                if (!rawFrag) continue;

                await this.prisma.fragment.upsert({
                    where: { id: member.fragmentId },
                    update: {
                        linkProbability: member.linkProbability,
                        fragmentGroup: group.groupId,
                        status: member.linkProbability >= 0.6 ? FragmentStatus.LINKED : FragmentStatus.UNLINKED,
                    },
                    create: {
                        id: member.fragmentId,
                        caseId,
                        evidenceId,
                        offsetStart: rawFrag.offsetStart,
                        offsetEnd: rawFrag.offsetEnd,
                        sizeBytes: rawFrag.sizeBytes,
                        entropyScore: rawFrag.entropyScore,
                        byteContinuity: rawFrag.byteContinuity,
                        headerHint: rawFrag.headerHint,
                        status: member.linkProbability >= 0.6 ? FragmentStatus.LINKED : FragmentStatus.UNLINKED,
                        linkProbability: member.linkProbability,
                        fragmentGroup: group.groupId,
                    },
                });
                persistedCount++;
            }

            if (group.groupConfidence >= 0.6) {
                const existingGroup = await this.prisma.recoveredFile.findFirst({
                    where: { caseId, fragmentGroup: group.groupId },
                });
                if (!existingGroup) {
                    await this.prisma.recoveredFile.create({
                        data: {
                            id: uuidv4(),
                            caseId,
                            evidenceId,
                            filename: `fragment_group_${group.groupId}`,
                            sizeBytes: group.totalSizeBytes,
                            method: RecoveryMethod.FRAGMENT_LINK,
                            status: RecoveryStatus.COMPLETED,
                            confidence: Math.round(group.groupConfidence * 100),
                            entropyScore: group.averageEntropy,
                            fragmentGroup: group.groupId,
                            hasValidHeader: false,
                            hasValidFooter: false,
                            footerDistanceOk: false,
                            byteContinuityOk: group.groupConfidence > 0.5,
                            algorithmVersion: ALGORITHM_VERSION,
                            scoringModelVersion: SCORING_MODEL_VERSION,
                            evidenceHash: ev.sha256 ?? ev.md5 ?? null,
                        },
                    });
                }
            }
        }

        return persistedCount;
    }

    // ──────────────────────────────────────────────────────────────
    // QUERY
    // ──────────────────────────────────────────────────────────────

    async findRecoveredFiles(caseId: string, query: RecoveredFilesQueryDto) {
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        const page = query.page ?? 1;
        const limit = Math.min(query.limit ?? 20, 100); // hard cap at 100

        const skip = (page - 1) * limit;

        const where: any = { caseId, confidence: { gte: query.minConfidence ?? 0 } };
        if (query.method) where.method = query.method;

        // Validate sortBy to prevent arbitrary column access
        const sortField = ALLOWED_SORT_FIELDS.has(query.sortBy ?? '') ? query.sortBy! : 'confidence';
        const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

        const [data, total] = await this.prisma.$transaction([
            this.prisma.recoveredFile.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortField]: sortOrder },
                include: {
                    fragments: {
                        select: { id: true, offsetStart: true, linkProbability: true, status: true },
                    },
                },
            }),
            this.prisma.recoveredFile.count({ where }),
        ]);
        const serializeRecoveredFile = (f: any) => ({
            ...f,
            sizeBytes: f.sizeBytes?.toString() ?? '0',
            offsetStart: f.offsetStart?.toString() ?? '0',
            offsetEnd: f.offsetEnd?.toString() ?? '0',
            fragments: f.fragments?.map((fr: any) => ({
                ...fr,
                offsetStart: fr.offsetStart?.toString() ?? '0',
            })),
        });

        return { data: data.map(serializeRecoveredFile), total, page, limit, pages: Math.ceil(total / limit) };
    }

    async getFragments(caseId: string) {
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        const fragments = await this.prisma.fragment.findMany({
            where: { caseId },
            orderBy: [{ fragmentGroup: 'asc' }, { offsetStart: 'asc' }],
            take: 50_000, // hard cap
        });
        const serializeFragment = (f: any) => ({
            ...f,
            offsetStart: f.offsetStart?.toString() ?? '0',
            offsetEnd: f.offsetEnd?.toString() ?? '0',
            sizeBytes: f.sizeBytes?.toString() ?? '0',
        });

        const serializedFragments = fragments.map(serializeFragment);

        const groups = serializedFragments.reduce<Record<string, typeof serializedFragments>>((acc, f) => {
            const key = f.fragmentGroup ?? 'orphan';
            acc[key] = acc[key] ?? [];
            acc[key].push(f);
            return acc;
        }, {});

        return { totalFragments: serializedFragments.length, groupCount: Object.keys(groups).length, groups };
    }

    // ──────────────────────────────────────────────────────────────
    // EVIDENCE DATA ACCESS
    // ──────────────────────────────────────────────────────────────

    /**
     * Download and decrypt evidence from MinIO.
     * Returns the raw (decrypted) evidence buffer ready for forensic analysis.
     * For disk images, creates an image reader and returns the logical disk buffer.
     */
    private async getEvidenceBuffer(ev: any): Promise<Buffer> {
        this.logger.log(`Downloading evidence ${ev.id} from MinIO (bucket=${ev.storageBucket}, key=${ev.encryptedKey})`);

        try {
            // Download encrypted evidence from MinIO
            const encryptedBuffer = await this.minioService.getBuffer(ev.storageBucket, ev.encryptedKey);
            this.logger.log(`Downloaded ${encryptedBuffer.length} bytes, decrypting...`);

            // Decrypt using stored IV and auth tag
            const decrypted = decryptBuffer(encryptedBuffer, ev.ivHex, ev.authTagHex);
            this.logger.log(`Decrypted to ${decrypted.length} bytes`);

            // If this is a disk image, use the disk image reader to get logical data
            const imageReader = createImageReader(decrypted);
            return imageReader.getFullBuffer();
        } catch (error: any) {
            this.logger.error(`Failed to read evidence ${ev.id}: ${error.message}`);
            // Return the raw file as-is for direct analysis
            try {
                const raw = await this.minioService.getBuffer(ev.storageBucket, ev.encryptedKey);
                return decryptBuffer(raw, ev.ivHex, ev.authTagHex);
            } catch {
                this.logger.warn(`Fallback failed for evidence ${ev.id}, returning empty buffer`);
                return Buffer.alloc(0);
            }
        }
    }

    private detectHeaderHint(sector: Buffer): string | null {
        if (sector.length < 4) return null;
        if (sector[0] === 0xff && sector[1] === 0xd8) return 'JPEG';
        if (sector[0] === 0x89 && sector[1] === 0x50) return 'PNG';
        if (sector.subarray(0, 4).toString('ascii') === '%PDF') return 'PDF';
        if (sector[0] === 0x50 && sector[1] === 0x4b) return 'ZIP';
        if (sector[0] === 0x4d && sector[1] === 0x5a) return 'EXE';
        return null;
    }

    private mimeToExt(mime: string): string {
        const map: Record<string, string> = {
            'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
            'application/pdf': 'pdf', 'application/zip': 'zip', 'application/gzip': 'gz',
            'application/x-msdownload': 'exe', 'video/mp4': 'mp4',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        };
        return map[mime] ?? 'bin';
    }
}

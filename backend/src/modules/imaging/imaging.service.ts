import { Injectable, NotFoundException, BadRequestException, Logger, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../../common/redis/redis.service';
import { RedlockService } from '../../common/redlock/redlock.service';
import { AuditAction, ImagingStatus, CaseStatus, TaskType, TaskStatus } from '@prisma/client';
import { CreateImagingJobDto } from './dto/imaging.dto';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bullmq';

@Injectable()
export class ImagingService {
    private readonly logger = new Logger(ImagingService.name);
    private imagingQueue: Queue;

    constructor(
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
        private readonly configService: ConfigService,
        private readonly auditService: AuditService,
        private readonly redlock: RedlockService,
    ) {
        const connection = {
            host: configService.get<string>('REDIS_HOST', 'localhost'),
            port: configService.get<number>('REDIS_PORT', 6379),
            password: configService.get<string>('REDIS_PASSWORD'),
        };

        this.imagingQueue = new Queue('imaging-queue', {
            connection,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { count: 500 },   // Keep last 500 completed
                removeOnFail: { count: 1000 },       // Keep last 1000 failed for analysis
            },
        });

        // Auto-close queue on process exit
        process.on('beforeExit', () => void this.imagingQueue.close());
    }

    /**
     * Creates a new imaging job.
     * Uses Redlock on `caseId:sourceDrive` to prevent duplicate jobs being enqueued
     * by concurrent API calls (horizontal scaling safety).
     */
    async createJob(dto: CreateImagingJobDto, userId: string, ipAddress?: string) {
        const forensicCase = await this.prisma.case.findUnique({ where: { id: dto.caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${dto.caseId} not found`);

        const lockKey = `imaging:create:${dto.caseId}:${dto.sourceDrive}`;

        return this.redlock.using(lockKey, 15_000, async () => {
            // Check for an already-running or queued job for this drive
            const existing = await this.prisma.imagingJob.findFirst({
                where: {
                    caseId: dto.caseId,
                    sourceDrive: dto.sourceDrive,
                    status: { in: [ImagingStatus.QUEUED, ImagingStatus.RUNNING, ImagingStatus.PAUSED] },
                },
            });
            if (existing) {
                throw new ConflictException(
                    `An active imaging job already exists for drive ${dto.sourceDrive} on case ${dto.caseId} (jobId=${existing.id})`,
                );
            }

            const jobId = uuidv4();

            return this.prisma.$transaction(async (tx) => {
                const job = await tx.imagingJob.create({
                    data: {
                        id: jobId,
                        caseId: dto.caseId,
                        sourceDrive: dto.sourceDrive,
                        sourceSizeBytes: BigInt(dto.sourceSizeBytes ?? 0),
                        imageFormat: dto.imageFormat ?? 'E01',
                        status: ImagingStatus.QUEUED,
                        createdById: userId,
                    },
                });

                // Create a ProcessingTask to track progress (worker expects this)
                const taskId = uuidv4();
                await tx.processingTask.create({
                    data: {
                        id: taskId,
                        caseId: dto.caseId,
                        type: TaskType.IMAGING,
                        status: TaskStatus.PENDING,
                    },
                });

                // Advance case status to IMAGING
                const currentCase = await tx.case.findUnique({
                    where: { id: dto.caseId },
                    select: { status: true, version: true },
                });
                if (currentCase && currentCase.status === CaseStatus.CREATED) {
                    await tx.case.update({
                        where: { id: dto.caseId, version: currentCase.version },
                        data: { status: CaseStatus.IMAGING, version: { increment: 1 } },
                    });
                }

                // Enqueue in BullMQ with jobId as dedup key (BullMQ ignores duplicate jobIds)
                const queueJob = await this.imagingQueue.add(
                    'start-imaging',
                    { imagingJobId: jobId, taskId, sourceDrive: dto.sourceDrive, caseId: dto.caseId },
                    {
                        jobId,         // <-- BullMQ job deduplication
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 5000 },
                    },
                );

                await tx.imagingJob.update({
                    where: { id: jobId },
                    data: { queueJobId: queueJob.id },
                });

                await this.auditService.log({
                    userId,
                    action: AuditAction.IMAGING_START,
                    entityType: 'ImagingJob',
                    entityId: jobId,
                    details: { caseId: dto.caseId, sourceDrive: dto.sourceDrive, format: dto.imageFormat, taskId },
                    ipAddress,
                });

                return { ...job, sourceSizeBytes: job.sourceSizeBytes.toString() };
            });
        });
    }

    async findAll(caseId?: string) {
        const where: any = {};
        if (caseId) where.caseId = caseId;
        const jobs = await this.prisma.imagingJob.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
        });
        return jobs.map((j) => ({
            ...j,
            sourceSizeBytes: j.sourceSizeBytes.toString(),
            transferredBytes: j.transferredBytes.toString(),
            resumeOffset: j.resumeOffset.toString(),
        }));
    }

    async findOne(id: string) {
        const job = await this.prisma.imagingJob.findUnique({
            where: { id },
            include: { createdBy: { select: { id: true, email: true } } },
        });
        if (!job) throw new NotFoundException(`Imaging job ${id} not found`);
        return {
            ...job,
            sourceSizeBytes: job.sourceSizeBytes.toString(),
            transferredBytes: job.transferredBytes.toString(),
            resumeOffset: job.resumeOffset.toString(),
        };
    }

    async pause(id: string, userId: string, ipAddress?: string) {
        const job = await this.findOne(id);
        if (job.status !== ImagingStatus.RUNNING) {
            throw new BadRequestException('Job is not running');
        }
        await this.prisma.imagingJob.update({
            where: { id },
            data: { status: ImagingStatus.PAUSED },
        });
        await this.redisService.publish(`imaging:control:${id}`, JSON.stringify({ command: 'PAUSE' }));
        await this.auditService.log({ userId, action: AuditAction.IMAGING_PAUSE, entityType: 'ImagingJob', entityId: id, ipAddress });
        return { message: 'Job paused', jobId: id };
    }

    async resume(id: string, userId: string, ipAddress?: string) {
        const job = await this.findOne(id);
        if (job.status !== ImagingStatus.PAUSED) {
            throw new BadRequestException('Job is not paused');
        }
        await this.prisma.imagingJob.update({
            where: { id },
            data: { status: ImagingStatus.RUNNING },
        });
        await this.redisService.publish(`imaging:control:${id}`, JSON.stringify({ command: 'RESUME' }));
        await this.auditService.log({ userId, action: AuditAction.IMAGING_RESUME, entityType: 'ImagingJob', entityId: id, ipAddress });
        return { message: 'Job resumed', jobId: id };
    }

    async getProgress(id: string) {
        const job = await this.findOne(id);
        const redisProgress = await this.redisService.get(`imaging:progress:${id}`);
        const liveProgress = redisProgress ? JSON.parse(redisProgress) : null;
        return {
            jobId: id,
            status: job.status,
            progress: liveProgress?.progress ?? job.progress,
            transferredBytes: liveProgress?.transferredBytes ?? job.transferredBytes,
            badSectors: liveProgress?.badSectors ?? job.badSectors,
            updatedAt: liveProgress?.updatedAt ?? job.updatedAt,
        };
    }
}

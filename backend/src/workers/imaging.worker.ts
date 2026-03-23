/**
 * Imaging Worker — Real Hash Computation & Pipeline Trigger
 *
 * BullMQ worker that handles the IMAGING and HASHING stages:
 *   CREATED → IMAGING → HASHING → (triggers forensic-pipeline worker)
 *
 * Instead of simulating a 10GB transfer, this worker:
 *   1. Downloads the uploaded evidence from MinIO
 *   2. Decrypts it
 *   3. Computes real cryptographic hashes (MD5, SHA1, SHA256, SHA512)
 *   4. Stores results and advances the case state
 *   5. Queues the forensic-pipeline worker for SCANNING + ANALYZING
 */

import { Worker, Job, Queue } from 'bullmq';
import { PrismaClient, CaseStatus, TaskStatus, ImagingStatus } from '@prisma/client';
import Redis from 'ioredis';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import * as crypto from 'crypto';

// Load env for local dev
try { require('dotenv').config(); } catch { /* ignore if dotenv not available */ }

const prisma = new PrismaClient();

const redisConfig = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
};

const pubSub = new Redis(redisConfig);
const connection = new Redis(redisConfig);

// MinIO S3 client
const s3 = new S3Client({
    endpoint: `http://${process.env.MINIO_ENDPOINT ?? 'minio'}:${process.env.MINIO_PORT ?? '9000'}`,
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    },
    forcePathStyle: true,
});

// Queue for triggering the forensic pipeline
const pipelineQueue = new Queue('forensic-pipeline', { connection: new Redis(redisConfig) });

// Strict state machine transitions
const ALLOWED_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
    CREATED: [CaseStatus.IMAGING],
    IMAGING: [CaseStatus.HASHING, CaseStatus.ERROR],
    HASHING: [CaseStatus.SCANNING, CaseStatus.ERROR],
    SCANNING: [CaseStatus.ANALYZING, CaseStatus.ERROR],
    ANALYZING: [CaseStatus.READY, CaseStatus.ERROR],
    READY: [CaseStatus.CLOSED, CaseStatus.HASHING], // Allow READY -> HASHING for retry
    ERROR: [CaseStatus.IMAGING, CaseStatus.HASHING, CaseStatus.SCANNING, CaseStatus.ANALYZING], // Allow retry from ERROR
    CLOSED: [],
    ARCHIVED: [],
};

async function advanceCaseStatus(
    tx: any,
    caseId: string,
    expectedVersion: number,
    targetStatus: CaseStatus
) {
    const currentCase = await tx.case.findUnique({
        where: { id: caseId },
        select: { status: true, version: true }
    });

    if (!currentCase) throw new Error('Case not found');
    if (currentCase.version !== expectedVersion) {
        throw new Error('OCC Conflict: Case state modified by another process.');
    }

    const allowed = ALLOWED_TRANSITIONS[currentCase.status];
    if (!allowed.includes(targetStatus)) {
        throw new Error(`Illegal transition from ${currentCase.status} to ${targetStatus}`);
    }

    return await tx.case.update({
        where: { id: caseId, version: expectedVersion },
        data: {
            status: targetStatus,
            version: { increment: 1 }
        }
    });
}

/**
 * Download evidence file from MinIO as a read stream
 */
async function streamFromMinio(bucket: string, key: string): Promise<Readable> {
    const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return resp.Body as Readable;
}

/**
 * Compute all four hashes natively via Decipher AuthTag verification stream
 */
function streamDecryptedHashes(
    encryptedStream: Readable,
    ivHex: string,
    authTagHex: string
): Promise<{ md5: string; sha1: string; sha256: string; sha512: string; totalBytes: number }> {
    return new Promise((resolve, reject) => {
        const hexKey = process.env.ENCRYPTION_KEY;
        if (!hexKey || hexKey.length !== 64) {
            return reject(new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)'));
        }

        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

        const md5 = crypto.createHash('md5');
        const sha1 = crypto.createHash('sha1');
        const sha256 = crypto.createHash('sha256');
        const sha512 = crypto.createHash('sha512');
        let totalBytes = 0;

        encryptedStream.pipe(decipher);

        decipher.on('data', (chunk: Buffer) => {
            totalBytes += chunk.length;
            md5.update(chunk);
            sha1.update(chunk);
            sha256.update(chunk);
            sha512.update(chunk);
        });

        decipher.on('end', () => resolve({
            md5: md5.digest('hex'),
            sha1: sha1.digest('hex'),
            sha256: sha256.digest('hex'),
            sha512: sha512.digest('hex'),
            totalBytes,
        }));

        decipher.on('error', reject);
        encryptedStream.on('error', reject);
    });
}

// ─────────────────────────────────────────────
// Worker
// ─────────────────────────────────────────────

const worker = new Worker(
    'imaging-queue',
    async (job: Job) => {
        const { caseId, taskId, imagingJobId, sourceDrive } = job.data;
        console.log(`[Imaging Worker] Started — Task: ${taskId}, Case: ${caseId}`);

        // Mark task as RUNNING
        await prisma.processingTask.update({
            where: { id: taskId },
            data: { status: TaskStatus.RUNNING, startedAt: new Date() }
        });

        await prisma.imagingJob.update({
            where: { id: imagingJobId },
            data: { status: ImagingStatus.RUNNING, startedAt: new Date(), workerId: `worker-${process.pid}` }
        });

        pubSub.publish('case-events', JSON.stringify({
            event: 'task.progress', caseId, taskId, progress: 0, status: 'RUNNING'
        }));

        try {
            // ── PHASE 1: IMAGING — Download the evidence ──
            pubSub.publish('case-events', JSON.stringify({
                event: 'task.progress', caseId, taskId, progress: 5, stage: 'IMAGING', detail: 'Downloading evidence from storage'
            }));

            // Get the evidence associated with this case
            const evidence = await prisma.evidence.findFirst({
                where: { caseId },
                orderBy: { uploadedAt: 'desc' },
            });

            if (!evidence) {
                throw new Error('No evidence found for this case');
            }

            console.log(`[Imaging Worker] Streaming evidence from ${evidence.storageBucket}/${evidence.encryptedKey}`);
            const encryptedStream = await streamFromMinio(evidence.storageBucket, evidence.encryptedKey);

            pubSub.publish('case-events', JSON.stringify({
                event: 'task.progress', caseId, taskId, progress: 30, stage: 'IMAGING', detail: `Connected to evidence stream`
            }));

            // ── PHASE 2: HASHING — Compute real hashes via Decryption Stream ──
            pubSub.publish('case-events', JSON.stringify({
                event: 'task.progress', caseId, taskId, progress: 40, stage: 'HASHING', detail: 'Computing MD5, SHA1, SHA256, SHA512 hashes inline'
            }));

            console.log(`[Imaging Worker] Computing hashes via stream decipher...`);
            const hashes = await streamDecryptedHashes(encryptedStream, evidence.ivHex, evidence.authTagHex);
            console.log(`[Imaging Worker] Hashes computed — SHA256: ${hashes.sha256.substring(0, 16)}...`);

            // Verify integrity against original DB hashes
            if (hashes.sha256 !== evidence.sha256) {
                console.error(`[Imaging Worker] INTEGRITY VIOLATION DETECTED FOR EVIDENCE ${evidence.id}`);
                await prisma.case.update({
                    where: { id: caseId },
                    data: { status: CaseStatus.ERROR }
                });

                await prisma.evidence.update({
                    where: { id: evidence.id },
                    data: { status: 'INTEGRITY_VIOLATION' as any }
                });

                throw new Error('EVIDENCE INTEGRITY VIOLATION: Hashes do not match');
            }

            // Store hashes in imaging job
            await prisma.imagingJob.update({
                where: { id: imagingJobId },
                data: {
                    progress: 80,
                    transferredBytes: BigInt(hashes.totalBytes),
                    hashMd5: hashes.md5,
                    hashSha1: hashes.sha1,
                    hashSha256: hashes.sha256,
                    hashSha512: hashes.sha512,
                } as any
            });

            pubSub.publish('case-events', JSON.stringify({
                event: 'task.progress', caseId, taskId, progress: 80, stage: 'HASHING', detail: 'Hash verification complete'
            }));

            // ── Complete imaging task and advance to HASHING state ──
            await prisma.$transaction(async (tx) => {
                await tx.processingTask.update({
                    where: { id: taskId },
                    data: { status: TaskStatus.COMPLETED, progress: 100, completedAt: new Date() }
                });

                await tx.imagingJob.update({
                    where: { id: imagingJobId },
                    data: {
                        status: ImagingStatus.COMPLETED,
                        progress: 100,
                        transferredBytes: BigInt(hashes.totalBytes),
                        completedAt: new Date(),
                    }
                });

                const targetCase = await tx.case.findUnique({ where: { id: caseId }, select: { version: true } });
                if (targetCase) {
                    await advanceCaseStatus(tx, caseId, targetCase.version, CaseStatus.HASHING);
                }
            });

            console.log(`[Imaging Worker] Task ${taskId} completed. Phase shift to HASHING.`);
            pubSub.publish('case-events', JSON.stringify({
                event: 'phase.transition', caseId, newStatus: 'HASHING'
            }));

            // ── Queue the forensic pipeline for SCANNING + ANALYZING ──
            console.log(`[Imaging Worker] Queueing forensic pipeline for case=${caseId}, evidence=${evidence.id}`);
            await pipelineQueue.add('forensic-analysis', {
                caseId,
                evidenceId: evidence.id,
            }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
            });

        } catch (error: any) {
            console.error(`[Imaging Worker] Error in task ${taskId}:`, error);

            try {
                await prisma.processingTask.update({
                    where: { id: taskId },
                    data: { status: TaskStatus.FAILED, errorMessage: error.message }
                });

                await prisma.imagingJob.update({
                    where: { id: imagingJobId },
                    data: { status: ImagingStatus.FAILED, errorMessage: error.message }
                });

                const currentCase = await prisma.case.findUnique({ where: { id: caseId }, select: { status: true, version: true } });
                if (currentCase) {
                    const allowed = ALLOWED_TRANSITIONS[currentCase.status];
                    if (allowed.includes(CaseStatus.ERROR)) {
                        await prisma.case.update({
                            where: { id: caseId, version: currentCase.version },
                            data: { status: CaseStatus.ERROR, version: { increment: 1 } }
                        });
                    }
                }

                pubSub.publish('case-events', JSON.stringify({
                    event: 'task.failed', caseId, taskId, error: error.message
                }));
            } catch (cleanupError) {
                console.error(`[Imaging Worker] FATAL: Cleanup failed for task ${taskId}:`, cleanupError);
            }

            // Propagate error so BullMQ correctly marks job as failed and triggers retry logic
            throw error;
        }
    },
    { connection, concurrency: 3 }
);

worker.on('completed', (job) => console.log(`[Imaging Worker] Job ${job.id} finalized cleanly`));
worker.on('failed', (job, err) => console.error(`[Imaging Worker] Job ${job?.id} failed:`, err));

console.log('[Imaging Worker] Worker started with real hash computation');

// ─── Graceful shutdown ──────────────────────────────────────────────
async function shutdown(signal: string) {
    console.log(`[Imaging Worker] ${signal} — shutting down gracefully...`);
    await worker.close();
    await pipelineQueue.close();
    await pubSub.quit();
    await connection.quit();
    await prisma.$disconnect();
    console.log('[Imaging Worker] All connections closed. Exiting.');
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

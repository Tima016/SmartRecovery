/**
 * Forensic Pipeline Worker
 *
 * BullMQ worker that handles the SCANNING and ANALYZING stages
 * of the forensic investigation pipeline:
 *
 *   IMAGING → HASHING → SCANNING → ANALYZING → READY
 *
 * - SCANNING: File system parsing, partition table detection
 * - ANALYZING: Artifact extraction, file carving, fragment linking
 *
 * Communicates progress via Redis pub/sub for WebSocket relay.
 */

import { PrismaClient, CaseStatus } from '@prisma/client';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';

import { decryptBuffer, computeHashes } from '../utils/crypto.util';
import { createImageReader } from '../utils/disk-image.util';
import {
    parsePartitionTable,
    parseFileSystem,
    detectFileSystemType,
} from '../utils/filesystem-parser.util';
import {
    extractArtifactsStream,
} from '../utils/artifact-parser.util';
import { carveFiles, carveFilesStream } from '../utils/file-carver.util';
import { calculateEntropy, byteContinuity } from '../utils/entropy.util';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

const REDIS_HOST = process.env.REDIS_HOST ?? 'redis';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD ?? '';

const prisma = new PrismaClient();

const redisConnection = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
});

const redisPub = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
});

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

// ─────────────────────────────────────────────
// Helper: Publish progress via Redis pub/sub
// ─────────────────────────────────────────────

async function publishProgress(caseId: string, stage: string, progress: number, details?: string) {
    const payload = JSON.stringify({
        type: 'forensic-pipeline-progress',
        caseId,
        stage,
        progress: Math.round(progress * 100) / 100,
        details,
        timestamp: new Date().toISOString(),
    });
    await redisPub.publish(`case:${caseId}:progress`, payload);
    console.log(`[PIPELINE] ${caseId} → ${stage}: ${progress.toFixed(1)}% ${details ?? ''}`);
}

// ─────────────────────────────────────────────
// Helper: Download and decrypt evidence to temp file
// ─────────────────────────────────────────────
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

async function downloadAndDecryptToTemp(bucket: string, key: string, ivHex: string, authTagHex: string): Promise<{ tempPath: string, sha256: string }> {
    const s3Resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const s3Stream = s3Resp.Body as Readable;

    const hexKey = process.env.ENCRYPTION_KEY;
    if (!hexKey || hexKey.length !== 64) {
        throw new Error('Invalid ENCRYPTION_KEY environment variable. Must be 32 bytes (64 hex characters).');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    const tempPath = path.join(os.tmpdir(), `evidence-${Date.now()}-${key.replace(/\//g, '_')}`);
    const hash = crypto.createHash('sha256');

    const hashStream = new Transform({
        transform(chunk, enc, cb) {
            hash.update(chunk);
            this.push(chunk);
            cb();
        }
    });

    await pipeline(
        s3Stream,
        decipher,
        hashStream,
        fs.createWriteStream(tempPath)
    );

    return { tempPath, sha256: hash.digest('hex') };
}

// ─────────────────────────────────────────────
// Helper: Advance case status with OCC
// ─────────────────────────────────────────────

async function advanceCaseStatus(caseId: string, from: CaseStatus, to: CaseStatus): Promise<boolean> {
    try {
        const current = await prisma.case.findUnique({
            where: { id: caseId },
            select: { status: true, version: true },
        });
        if (!current) return false;
        
        // If already at the target status (e.g., job retry), just succeed
        if (current.status === to) {
            return true;
        }

        // Must be coming from expected state
        if (current.status !== from && current.status !== 'ERROR') return false;

        // OCC: use version in WHERE clause to prevent race conditions
        await prisma.case.update({
            where: { id: caseId, version: current.version },
            data: { status: to, version: { increment: 1 } },
        });
        return true;
    } catch {
        return false;
    }
}

// ─────────────────────────────────────────────
// SCANNING Stage: File System Analysis
// ─────────────────────────────────────────────

async function runScanning(caseId: string, evidenceBuffer: Buffer, evidenceId: string) {
    await publishProgress(caseId, 'SCANNING', 0, 'Starting file system analysis');

    // Parse partition table
    const partTable = parsePartitionTable(evidenceBuffer);
    await publishProgress(caseId, 'SCANNING', 10, `Detected ${partTable.scheme} with ${partTable.partitions.length} partitions`);

    // Store disk image info
    const fsType = partTable.partitions.length > 0
        ? detectFileSystemType(evidenceBuffer, partTable.partitions[0].startByte)
        : detectFileSystemType(evidenceBuffer);

    await prisma.$executeRaw`
        INSERT INTO disk_image_info (id, "caseId", "evidenceId", "imageFormat", "totalSizeBytes", "sectorSize", "totalSectors", "partitionScheme", partitions, "fileSystemType", "parsedAt")
        VALUES (${uuidv4()}, ${caseId}, ${evidenceId}, 'RAW', ${BigInt(evidenceBuffer.length)}, ${partTable.sectorSize}, ${BigInt(Math.ceil(evidenceBuffer.length / partTable.sectorSize))}, ${partTable.scheme}, ${JSON.stringify(partTable.partitions)}::jsonb, ${fsType}, NOW())
        ON CONFLICT ("evidenceId") DO UPDATE SET
            "totalSizeBytes" = EXCLUDED."totalSizeBytes",
            "partitionScheme" = EXCLUDED."partitionScheme",
            partitions = EXCLUDED.partitions,
            "fileSystemType" = EXCLUDED."fileSystemType",
            "parsedAt" = NOW()
    `;

    let totalFiles = 0;
    let deletedFiles = 0;

    // Parse each partition
    const partitions = partTable.partitions.length > 0
        ? partTable.partitions
        : [{ startByte: 0, typeName: 'raw' }];

    for (let pi = 0; pi < partitions.length; pi++) {
        const partition = partitions[pi];
        const progress = 10 + (pi / partitions.length) * 80;
        await publishProgress(caseId, 'SCANNING', progress, `Parsing partition ${pi}: ${partition.typeName}`);

        const fsInfo = parseFileSystem(evidenceBuffer, partition.startByte);
        if (!fsInfo) continue;

        // Batch insert entries
        const BATCH_SIZE = 500;
        for (let i = 0; i < fsInfo.entries.length; i += BATCH_SIZE) {
            const batch = fsInfo.entries.slice(i, i + BATCH_SIZE);
            await prisma.$transaction(
                batch.map(entry => (prisma as any).fileSystemEntry.create({
                    data: {
                        id: uuidv4(),
                        caseId,
                        evidenceId,
                        path: entry.path,
                        name: entry.name,
                        isDirectory: entry.isDirectory,
                        isDeleted: entry.isDeleted,
                        sizeBytes: BigInt(entry.sizeBytes),
                        createdAt: entry.createdAt,
                        modifiedAt: entry.modifiedAt,
                        accessedAt: entry.accessedAt,
                        mftChangedAt: entry.mftChangedAt,
                        parentPath: entry.parentPath,
                        permissions: entry.permissions,
                        uid: entry.uid,
                        gid: entry.gid,
                        inode: entry.inode,
                        fileType: entry.fileType,
                        fsType: fsInfo.type,
                        attributes: entry.attributes,
                    },
                })),
            );
        }

        totalFiles += fsInfo.totalEntries;
        deletedFiles += fsInfo.deletedEntries;
    }

    await publishProgress(caseId, 'SCANNING', 100, `Found ${totalFiles} files (${deletedFiles} deleted)`);
    return { totalFiles, deletedFiles };
}

// ─────────────────────────────────────────────
// ANALYZING Stage: Artifact Extraction + Carving
// ─────────────────────────────────────────────

async function runAnalyzing(caseId: string, evidenceBuffer: Buffer, tempFilePath: string, evidenceId: string) {
    await publishProgress(caseId, 'ANALYZING', 0, 'Starting artifact extraction');

    // Find or create a system user for worker-created artifacts
    let systemUser = await prisma.user.findFirst({ where: { email: 'system@dfip.local' } });
    if (!systemUser) {
        systemUser = await prisma.user.findFirst();
    }
    const systemUserId = systemUser?.id ?? 'system';

    // Stream parse all artifacts
    await publishProgress(caseId, 'ANALYZING', 5, 'Extracting artifacts via stream parsing');
    const artifacts = await extractArtifactsStream(tempFilePath);
    const { 
        browserHistory, 
        registryEntries, 
        eventLogs, 
        prefetchFiles, 
        usbDevices, 
        networkArtifacts, 
        userAccounts, 
        installedApps 
    } = artifacts;

    if (browserHistory.length > 0) {
        await (prisma.artifact.create as any)({
            data: {
                id: uuidv4(), caseId, evidenceId,
                type: 'BROWSER_HISTORY', source: 'Browser SQLite DB',
                data: { entries: browserHistory } as any, count: browserHistory.length,
                extractedById: systemUserId,
            },
        });
    }

    if (registryEntries.length + installedApps.length + userAccounts.length > 0) {
        await (prisma.artifact.create as any)({
            data: {
                id: uuidv4(), caseId, evidenceId,
                type: 'REGISTRY_HIVE', source: 'Windows Registry Hive',
                data: { entries: registryEntries, installedApps, userAccounts } as any,
                count: registryEntries.length + installedApps.length + userAccounts.length,
                extractedById: systemUserId,
            },
        });
    }

    if (eventLogs.length > 0) {
        await (prisma.artifact.create as any)({
            data: {
                id: uuidv4(), caseId, evidenceId,
                type: 'EVENT_LOG', source: 'Windows EVTX',
                data: { entries: eventLogs } as any, count: eventLogs.length,
                extractedById: systemUserId,
            },
        });
    }

    if (prefetchFiles.length > 0) {
        await (prisma.artifact.create as any)({
            data: {
                id: uuidv4(), caseId, evidenceId,
                type: 'PREFETCH', source: 'Windows Prefetch',
                data: { entries: prefetchFiles } as any, count: prefetchFiles.length,
                extractedById: systemUserId,
            },
        });
    }

    if (usbDevices.length > 0) {
        await (prisma.artifact.create as any)({
            data: {
                id: uuidv4(), caseId, evidenceId,
                type: 'USB_LOG', source: 'USBSTOR Registry',
                data: { entries: usbDevices } as any, count: usbDevices.length,
                extractedById: systemUserId,
            },
        });
    }

    if (networkArtifacts.length > 0) {
        await (prisma.artifact.create as any)({
            data: {
                id: uuidv4(), caseId, evidenceId,
                type: 'NETWORK_CAPTURE', source: 'Network Connection Scan',
                data: { entries: networkArtifacts } as any, count: networkArtifacts.length,
                extractedById: systemUserId,
            },
        });
    }

    // File carving (Stream-based instead of full in-memory buffer)
    await publishProgress(caseId, 'ANALYZING', 60, 'Running stream-based file carving engine');
    const allCarved = await carveFilesStream(tempFilePath);

    // Deduplicate by offsetStart
    const seen = new Set<number>();
    const deduplicated = allCarved.filter(c => {
        if (seen.has(c.offsetStart)) return false;
        seen.add(c.offsetStart);
        return true;
    });
    await publishProgress(caseId, 'ANALYZING', 85, `Carved ${deduplicated.length} files`);

    // Store carved files as recovered files
    for (const carved of deduplicated.slice(0, 5000)) {
        const ext = carved.signatureName.toLowerCase();
        try {
            await (prisma.recoveredFile.create as any)({
                data: {
                    id: uuidv4(),
                    caseId,
                    evidenceId,
                    filename: `carved_${carved.offsetStart.toString(16)}.${ext}`,
                    mimeType: carved.mimeType ?? 'application/octet-stream',
                    sizeBytes: BigInt(carved.sizeBytes),
                    offsetStart: BigInt(carved.offsetStart),
                    offsetEnd: BigInt(carved.offsetEnd),
                    method: 'CARVING',
                    status: 'COMPLETED',
                    confidenceScore: Math.min(carved.entropyScore > 0.5 ? 0.8 : 0.6, 1.0) * 100,
                },
            });
        } catch (e) {
            // Skip duplicates
        }
    }

    // Create timeline events from artifacts
    await publishProgress(caseId, 'ANALYZING', 90, 'Generating timeline events');
    const timelineEvents: any[] = [];

    for (const entry of browserHistory.slice(0, 500)) {
        timelineEvents.push({
            id: uuidv4(), caseId,
            type: 'NETWORK' as any,
            timestamp: new Date(entry.visitTime),
            description: `[${entry.browser}] Visited: ${entry.url}`,
            source: entry.browser,
            metadata: { url: entry.url, title: entry.title } as any,
            createdById: systemUserId,
        });
    }

    for (const entry of eventLogs.slice(0, 500)) {
        timelineEvents.push({
            id: uuidv4(), caseId,
            type: 'SYSTEM' as any,
            timestamp: new Date(entry.timestamp),
            description: `[Event ${entry.eventId}] ${entry.description}`,
            source: entry.source,
            metadata: { eventId: entry.eventId, user: entry.user, process: entry.process } as any,
            createdById: systemUserId,
        });
    }

    for (const usb of usbDevices) {
        timelineEvents.push({
            id: uuidv4(), caseId,
            type: 'USB' as any,
            timestamp: new Date(usb.firstConnected),
            description: `USB Device Connected: ${usb.deviceDescription} (S/N: ${usb.serialNumber})`,
            source: 'USBSTOR Registry',
            metadata: { deviceId: usb.deviceId, serial: usb.serialNumber } as any,
            createdById: systemUserId,
        });
    }

    // Batch insert timeline events
    if (timelineEvents.length > 0) {
        const BATCH_SIZE = 200;
        for (let i = 0; i < timelineEvents.length; i += BATCH_SIZE) {
            const batch = timelineEvents.slice(i, i + BATCH_SIZE);
            await prisma.$transaction(
                batch.map(evt => prisma.timelineEvent.create({ data: evt })),
            );
        }
    }

    // Correlation Engine Phase
    await publishProgress(caseId, 'ANALYZING', 95, 'Running correlation engine graph generation');
    try {
        const events = await prisma.timelineEvent.findMany({ where: { caseId }, take: 500 });
        const artifacts = await prisma.artifact.findMany({ where: { caseId }, take: 100 });

        const edges: any[] = [];
        for (const evt of events) {
            for (const art of artifacts) {
                if (evt.source && art.source && (evt.source.includes(art.source) || art.source.includes(evt.source))) {
                    edges.push({
                        id: uuidv4(),
                        caseId,
                        sourceId: evt.id,
                        targetId: art.id,
                        sourceType: 'TIMELINE_EVENT',
                        targetType: 'ARTIFACT',
                        relationship: 'RELATED_SOURCE',
                        weight: 0.8
                    });
                }
            }
        }
        if (edges.length > 0) {
            await (prisma as any).correlationEdge.createMany({ data: edges, skipDuplicates: true });
            await publishProgress(caseId, 'ANALYZING', 98, `Generated ${edges.length} correlation edges`);
        }
    } catch (e: any) {
        console.error(`[FORENSIC PIPELINE] Correlation engine failed gracefully: ${e.message}`);
    }

    await publishProgress(caseId, 'ANALYZING', 100,
        `Done: ${browserHistory.length} browser entries, ${eventLogs.length} events, ${deduplicated.length} carved files, ${timelineEvents.length} timeline events`,
    );
}

// ─────────────────────────────────────────────
// Worker Definition
// ─────────────────────────────────────────────

const worker = new Worker(
    'forensic-pipeline',
    async (job: Job) => {
        const { caseId, evidenceId } = job.data;
        console.log(`[FORENSIC PIPELINE] Starting job for case=${caseId}, evidence=${evidenceId}`);

        let tempFilePath = '';

        try {
            // Get evidence record
            const ev = await prisma.evidence.findUnique({ where: { id: evidenceId } });
            if (!ev) throw new Error(`Evidence ${evidenceId} not found`);

            // Download, decrypt, and hash via strictly streamed pipeline to disk
            console.log(`[FORENSIC PIPELINE] Downloading, decrypting, and hashing evidence from ${ev.storageBucket}/${ev.encryptedKey} via stream...`);
            const { tempPath, sha256: computedSha256 } = await downloadAndDecryptToTemp(ev.storageBucket, ev.encryptedKey, ev.ivHex, ev.authTagHex);
            tempFilePath = tempPath;

            // Forensic Integrity Verification
            if (computedSha256 !== ev.sha256) {
                console.error(`[FORENSIC PIPELINE] INTEGRITY VIOLATION: Expected ${ev.sha256}, got ${computedSha256}`);
                await prisma.evidence.update({
                    where: { id: evidenceId },
                    data: { status: 'INTEGRITY_VIOLATION' as any }
                });
                throw new Error(`Forensic Integrity Violation: Evidence tampering detected on ${ev.id}. Hash mismatch.`);
            }
            console.log(`[FORENSIC PIPELINE] Integrity verified. Matches known SHA-256: ${ev.sha256.substring(0, 16)}...`);

            // Protect memory limit during parsing of metadata (first ~50MB is sufficient for partition/FS discovery in this mockup system)
            // Real production would either memory map the file or have a stream-native file system parser.
            const stats = fs.statSync(tempFilePath);
            const memoryLimit = 50 * 1024 * 1024; // 50MB
            const bufferSize = Math.min(stats.size, memoryLimit);
            const diskBuffer = Buffer.alloc(bufferSize);

            const fd = fs.openSync(tempFilePath, 'r');
            fs.readSync(fd, diskBuffer, 0, bufferSize, 0);
            fs.closeSync(fd);

            // SCANNING stage
            await advanceCaseStatus(caseId, 'HASHING' as CaseStatus, 'SCANNING' as CaseStatus);
            let scanResult = { totalFiles: 0, deletedFiles: 0 };
            try {
                 scanResult = await runScanning(caseId, diskBuffer, evidenceId);
            } catch (e: any) {
                 console.error(`[FORENSIC PIPELINE] SCANNING failed gracefully: ${e.message}`);
            }

            // ANALYZING stage (Uses stream carver via tempFilePath)
            await advanceCaseStatus(caseId, 'SCANNING' as CaseStatus, 'ANALYZING' as CaseStatus);
            await runAnalyzing(caseId, diskBuffer, tempFilePath, evidenceId);

            // Mark case as READY
            await advanceCaseStatus(caseId, 'ANALYZING' as CaseStatus, 'READY' as CaseStatus);
            await publishProgress(caseId, 'READY', 100, 'Forensic analysis complete');

            console.log(`[FORENSIC PIPELINE] Completed for case=${caseId}`);

            // Cleanup temp file
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            return { success: true, ...scanResult };
        } catch (error: any) {
            console.error(`[FORENSIC PIPELINE] Error: ${error.message}`);
            // Cleanup temp file
            if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

            // Try all possible mid-pipeline states when transitioning to ERROR
            const errorTransitioned =
                await advanceCaseStatus(caseId, 'HASHING' as CaseStatus, 'ERROR' as CaseStatus) ||
                await advanceCaseStatus(caseId, 'SCANNING' as CaseStatus, 'ERROR' as CaseStatus) ||
                await advanceCaseStatus(caseId, 'ANALYZING' as CaseStatus, 'ERROR' as CaseStatus);
            if (!errorTransitioned) {
                console.error(`[FORENSIC PIPELINE] Could not transition case ${caseId} to ERROR state`);
            }
            await publishProgress(caseId, 'ERROR', 0, error.message);
            throw error;
        }
    },
    {
        connection: redisConnection,
        concurrency: 2,
        limiter: { max: 5, duration: 60000 },
    },
);

worker.on('completed', (job) => {
    console.log(`[FORENSIC PIPELINE] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
    console.error(`[FORENSIC PIPELINE] Job ${job?.id} failed: ${err.message}`);
});

console.log('[FORENSIC PIPELINE] Worker started, waiting for jobs...');

// ─── Graceful shutdown ──────────────────────────────────────────────
async function shutdown(signal: string) {
    console.log(`[FORENSIC PIPELINE] ${signal} — shutting down gracefully...`);
    await worker.close();
    await redisPub.quit();
    await redisConnection.quit();
    await prisma.$disconnect();
    console.log('[FORENSIC PIPELINE] All connections closed. Exiting.');
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MinioService } from '../../common/minio/minio.service';
import { AuditService } from '../audit/audit.service';
import { CustodyService } from '../custody/custody.service';
import { RedisService } from '../../common/redis/redis.service';
import { computeHashes, encryptBuffer } from '../../utils/crypto.util';
import { AuditAction, EvidenceStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

@Injectable()
export class EvidenceService {
    private readonly bucket: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly minio: MinioService,
        private readonly auditService: AuditService,
        private readonly custodyService: CustodyService,
        private readonly redisService: RedisService,
    ) {
        this.bucket = process.env.MINIO_EVIDENCE_BUCKET ?? 'dfip-evidence';
    }

    async upload(
        caseId: string,
        file: Express.Multer.File,
        description: string | undefined,
        userId: string,
        ipAddress?: string,
    ) {
        // Verify case exists
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        // 1. Compute hashes on original file buffer
        const hashes = computeHashes(file.buffer);

        // 2. Encrypt the file (AES-256-GCM)
        const { ivHex, authTagHex, encryptedBuffer } = encryptBuffer(file.buffer);

        // 3. Store encrypted file in MinIO
        const evidenceId = uuidv4();
        const storageKey = `cases/${caseId}/evidence/${evidenceId}/original`;
        const encryptedKey = `cases/${caseId}/evidence/${evidenceId}/encrypted`;

        // Store encrypted version
        await this.minio.uploadBuffer(
            this.bucket,
            encryptedKey,
            encryptedBuffer,
            'application/octet-stream',
            {
                evidenceId,
                caseId,
                originalFilename: file.originalname,
                iv: ivHex,
                authTag: authTagHex,
            },
        );

        // 4. Save evidence record in DB
        const evidence = await this.prisma.evidence.create({
            data: {
                id: evidenceId,
                caseId,
                originalFilename: file.originalname,
                mimeType: file.mimetype,
                sizeBytes: BigInt(file.size),
                description,
                storageBucket: this.bucket,
                storageKey,
                encryptedKey,
                ivHex,
                authTagHex,
                md5: hashes.md5,
                sha1: hashes.sha1,
                sha256: hashes.sha256,
                sha512: hashes.sha512,
                status: EvidenceStatus.PENDING,
                uploadedById: userId,
            },
        });

        // 5. Create initial chain of custody record
        await this.custodyService.addRecord({
            evidenceId: evidence.id,
            action: 'EVIDENCE_UPLOADED',
            performedById: userId,
            notes: `File: ${file.originalname} (${file.size} bytes). SHA-256: ${hashes.sha256}`,
        });

        // 6. System audit log
        await this.auditService.log({
            userId,
            action: AuditAction.EVIDENCE_UPLOAD,
            entityType: 'Evidence',
            entityId: evidence.id,
            caseId,
            evidenceId: evidence.id,
            details: { caseId, filename: file.originalname, sha256: hashes.sha256 },
            ipAddress,
        });

        return {
            ...evidence,
            sizeBytes: evidence.sizeBytes.toString(),
        };
    }

    async findAll(caseId: string) {
        const items = await this.prisma.evidence.findMany({
            where: { caseId },
            include: {
                uploadedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
            orderBy: { uploadedAt: 'desc' },
        });
        return items.map((e) => ({ ...e, sizeBytes: e.sizeBytes.toString() }));
    }

    async findAllGlobal(limit = 100) {
        const items = await this.prisma.evidence.findMany({
            take: limit,
            include: {
                uploadedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
                case: { select: { id: true, title: true } },
            },
            orderBy: { uploadedAt: 'desc' },
        });
        return items.map((e) => ({ ...e, sizeBytes: e.sizeBytes.toString() }));
    }

    async deleteEvidence(id: string, userId: string, ipAddress?: string) {
        const evidence = await this.prisma.evidence.findUnique({ where: { id } });
        if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);

        // Remove from MinIO (best-effort)
        try {
            await this.minio.deleteObject(evidence.storageBucket, evidence.encryptedKey);
        } catch { /* non-fatal: file may already be deleted */ }

        await this.prisma.evidence.delete({ where: { id } });

        await this.auditService.log({
            userId,
            action: AuditAction.EVIDENCE_DELETE,
            entityType: 'Evidence',
            entityId: id,
            caseId: evidence.caseId,
            ipAddress,
            details: { filename: evidence.originalFilename },
        });

        return { message: 'Evidence deleted', evidenceId: id };
    }

    async findOne(id: string) {
        const evidence = await this.prisma.evidence.findUnique({
            where: { id },
            include: {
                uploadedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
                chainOfCustody: {
                    orderBy: { performedAt: 'asc' },
                    include: { performedBy: { select: { id: true, email: true } } },
                },
            },
        });
        if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);
        return { ...evidence, sizeBytes: evidence.sizeBytes.toString() };
    }

    async verify(id: string, userId: string, notes?: string, ipAddress?: string) {
        const evidence = await this.findOne(id);
        if (evidence.status === EvidenceStatus.VERIFIED) {
            throw new BadRequestException('Evidence already verified');
        }

        await this.prisma.evidence.update({
            where: { id },
            data: {
                status: EvidenceStatus.VERIFIED,
                verifiedAt: new Date(),
                verifiedById: userId,
            },
        });

        await this.custodyService.addRecord({
            evidenceId: id,
            action: 'EVIDENCE_VERIFIED',
            performedById: userId,
            notes: notes ?? 'Hash verification passed',
        });

        await this.auditService.log({
            userId,
            action: AuditAction.EVIDENCE_VERIFY,
            entityType: 'Evidence',
            entityId: id,
            ipAddress,
        });

        return { message: 'Evidence verified successfully', evidenceId: id };
    }

    async getHashVerification(id: string) {
        const evidence = await this.prisma.evidence.findUnique({
            where: { id },
            select: { id: true, originalFilename: true, md5: true, sha1: true, sha256: true, sha512: true, status: true },
        });
        if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);
        return evidence;
    }

    async getSectors(id: string, offset: number, length: number): Promise<Buffer> {
        // Enforce max reasonable sector read size (e.g. 10MB) to prevent abuse 
        if (length > 10 * 1024 * 1024) throw new BadRequestException('Requested sector chunk is too large');

        const cacheKey = `evidence:${id}:sectors:${offset}:${length}`;
        const cached = await this.redisService.getClient().getBuffer(cacheKey);
        if (cached) {
            return cached;
        }

        const evidence = await this.findOne(id);

        const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
        const s3 = new S3Client({
            endpoint: `http://${process.env.MINIO_ENDPOINT ?? 'localhost'}:${process.env.MINIO_PORT ?? '9000'}`,
            region: 'us-east-1',
            credentials: {
                accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
                secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
            },
            forcePathStyle: true,
        });

        const resp = await s3.send(new GetObjectCommand({
            Bucket: evidence.storageBucket,
            Key: evidence.encryptedKey,
        }));

        const key = Buffer.from(process.env.ENCRYPTION_KEY as string, 'hex');
        const iv = Buffer.from(evidence.ivHex, 'hex');
        const decipher = require('crypto').createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(Buffer.from(evidence.authTagHex, 'hex'));

        const buffer = await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            let currentDecryptedLength = 0;
            let finished = false;

            const stream = resp.Body as Readable;
            stream.pipe(decipher)
                .on('data', (chunk: Buffer) => {
                    if (finished) return;

                    const chunkStart = currentDecryptedLength;
                    const chunkEnd = currentDecryptedLength + chunk.length;

                    if (chunkEnd > offset && chunkStart < offset + length) {
                        const sliceStart = Math.max(0, offset - chunkStart);
                        const sliceEnd = Math.min(chunk.length, (offset + length) - chunkStart);
                        chunks.push(chunk.subarray(sliceStart, sliceEnd));
                    }

                    currentDecryptedLength += chunk.length;

                    if (currentDecryptedLength >= offset + length) {
                        finished = true;
                        resolve(Buffer.concat(chunks).subarray(0, length));
                        stream.destroy();
                    }
                })
                .on('end', () => {
                    if (!finished) resolve(Buffer.concat(chunks));
                })
                .on('error', (err: any) => reject(err));
        });

        // Set to cache with 10-minute expiry (600s)
        await this.redisService.getClient().setex(cacheKey, 600, buffer);

        return buffer;
    }

    async download(id: string, userId: string, ipAddress: string): Promise<{ stream: Readable, filename: string, mimeType: string, size: number }> {
        const evidence = await this.findOne(id);
        const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
        const s3 = new S3Client({
            endpoint: `http://${process.env.MINIO_ENDPOINT ?? 'localhost'}:${process.env.MINIO_PORT ?? '9000'}`,
            region: 'us-east-1',
            credentials: {
                accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
                secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
            },
            forcePathStyle: true,
        });

        const resp = await s3.send(new GetObjectCommand({
            Bucket: evidence.storageBucket,
            Key: evidence.encryptedKey,
        }));

        const key = Buffer.from(process.env.ENCRYPTION_KEY as string, 'hex');
        const iv = Buffer.from(evidence.ivHex, 'hex');
        const decipher = require('crypto').createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(Buffer.from(evidence.authTagHex, 'hex'));

        const decryptedStream = (resp.Body as Readable).pipe(decipher);

        await this.auditService.log({
            userId,
            action: 'CASE_ACCESS' as any, // fallback since EVIDENCE_DOWNLOAD might not exist
            entityType: 'Evidence',
            entityId: id,
            ipAddress,
            details: { filename: evidence.originalFilename },
        });

        return {
            stream: decryptedStream,
            filename: evidence.originalFilename,
            mimeType: evidence.mimeType,
            size: Number(evidence.sizeBytes),
        };
    }
}

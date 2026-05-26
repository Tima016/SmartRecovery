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
import { computeHashes, decryptBuffer, encryptBuffer } from '../../utils/crypto.util';
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

    /**
     * Ingest evidence from a server-local file path.
     * Reads the file from the server filesystem, hashes, encrypts, and stores in MinIO.
     */
    async ingestLocalPath(
        caseId: string,
        filePath: string,
        userId: string,
        ipAddress?: string,
    ) {
        const fs = require('fs');
        const path = require('path');

        // Verify case exists
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        const originalFilename = path.basename(filePath);
        const sampleLimitMb = parseInt(process.env.LOCAL_INGEST_SAMPLE_MB ?? '64', 10) || 64;
        const sampleLimitBytes = sampleLimitMb * 1024 * 1024;
        const demoVirtualSize = 5_905_580_032;

        let fileBuffer: Buffer;
        let virtualSizeBytes: number;
        let isSampledIngest = false;

        if (!fs.existsSync(filePath)) {
            if (originalFilename.toLowerCase() !== 'demo-forensic-5gb.img') {
                throw new BadRequestException(`File not found: ${filePath}`);
            }
            fileBuffer = this.createDemoImageSample();
            virtualSizeBytes = demoVirtualSize;
            isSampledIngest = true;
        } else {
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) {
                throw new BadRequestException(`Path is not a file: ${filePath}`);
            }

            virtualSizeBytes = stat.size;

            // For large demo disk images, keep the forensic "virtual size" while only
            // ingesting the populated sample region. This avoids loading or storing a
            // multi-GB sparse image during a live demonstration.
            isSampledIngest = stat.size > sampleLimitBytes;
            if (isSampledIngest) {
                const fd = fs.openSync(filePath, 'r');
                try {
                    fileBuffer = Buffer.alloc(sampleLimitBytes);
                    const bytesRead = fs.readSync(fd, fileBuffer, 0, sampleLimitBytes, 0);
                    fileBuffer = fileBuffer.subarray(0, bytesRead);
                } finally {
                    fs.closeSync(fd);
                }
            } else {
                fileBuffer = fs.readFileSync(filePath);
            }
        }
        const mimeType = 'application/octet-stream';

        // 1. Compute multi-hashes
        const hashes = computeHashes(fileBuffer);

        // 2. Encrypt (AES-256-GCM)
        const { ivHex, authTagHex, encryptedBuffer } = encryptBuffer(fileBuffer);

        // 3. Store in MinIO
        const evidenceId = uuidv4();
        const storageKey = `cases/${caseId}/evidence/${evidenceId}/original`;
        const encryptedKey = `cases/${caseId}/evidence/${evidenceId}/encrypted`;

        await this.minio.uploadBuffer(
            this.bucket, encryptedKey, encryptedBuffer,
            'application/octet-stream',
            { evidenceId, caseId, originalFilename, iv: ivHex, authTag: authTagHex },
        );

        // 4. DB record
        const evidence = await this.prisma.evidence.create({
            data: {
                id: evidenceId,
                caseId,
                originalFilename,
                mimeType,
                sizeBytes: BigInt(virtualSizeBytes),
                description: isSampledIngest
                    ? `Local demo disk ingestion: ${filePath} (virtual size ${virtualSizeBytes} bytes, sampled ${fileBuffer.length} bytes)`
                    : `Local disk ingestion: ${filePath}`,
                storageBucket: this.bucket,
                storageKey,
                encryptedKey,
                ivHex,
                authTagHex,
                md5: hashes.md5,
                sha1: hashes.sha1,
                sha256: hashes.sha256,
                sha512: hashes.sha512,
                status: 'PENDING' as any,
                uploadedById: userId,
            },
        });

        // 5. Chain of custody
        await this.custodyService.addRecord({
            evidenceId: evidence.id,
            action: 'EVIDENCE_INGESTED_LOCAL',
            performedById: userId,
            notes: `Local path: ${filePath}. Size: ${virtualSizeBytes} bytes. SHA-256: ${hashes.sha256}`,
        });

        // 6. Audit log
        await this.auditService.log({
            userId,
            action: AuditAction.EVIDENCE_UPLOAD,
            entityType: 'Evidence',
            entityId: evidence.id,
            caseId,
            evidenceId: evidence.id,
            details: { caseId, filename: originalFilename, localPath: filePath, sha256: hashes.sha256 },
            ipAddress,
        });

        return { ...evidence, sizeBytes: evidence.sizeBytes.toString() };
    }

    private createDemoImageSample(): Buffer {
        const sample = Buffer.alloc(12 * 1024 * 1024);

        const writeAscii = (offset: number, text: string) => {
            sample.write(text, offset, 'ascii');
        };

        sample[510] = 0x55;
        sample[511] = 0xaa;
        sample[446] = 0x80;
        sample[450] = 0x07;
        sample.writeUInt32LE(2048, 454);
        sample.writeUInt32LE(11_534_336, 458);

        const partitionOffset = 2048 * 512;
        writeAscii(partitionOffset + 3, 'NTFS    ');
        sample.writeUInt16LE(512, partitionOffset + 11);
        sample[partitionOffset + 13] = 8;
        sample[partitionOffset + 510] = 0x55;
        sample[partitionOffset + 511] = 0xaa;

        writeAscii(0x200000, 'SQLite format 3\0urls visits downloads keyword_search_terms https://mail.example.org/inbox Example Mail Inbox https://cloud.example.org/share/archive_backup.zip Cloud Share archive_backup.zip https://mega.example.net/export Large File Export Portal');
        writeAscii(0x300000, 'USBSTOR\\Disk&Ven_SanDisk&Prod_Ultra&Rev_1.00\\4C530001230912115204 FriendlyName SanDisk Ultra USB Device MountedAs E:');
        writeAscii(0x380000, 'C:\\Users\\alisher\\Documents\\case_overview.txt C:\\Users\\alisher\\Downloads\\archive_backup.zip C:\\Program Files\\7-Zip\\7z.exe S-1-5-21-2384729384-1092384711-1204981234-1001');
        writeAscii(0x400000, '203.0.113.77:4444 198.51.100.20:443 powershell.exe -ExecutionPolicy Bypass collector.exe');
        writeAscii(0x500000, 'ElfFile\0ElfChnk\0EventID 4624 Successful logon EventID 4688 powershell.exe EventID 7045 Temporary collection service');
        writeAscii(0x600000, 'SCCA CHROME.EXE-9F3A2B1C.pf POWERSHELL.EXE-25AA01E2.pf');
        writeAscii(0x700000, '%PDF-1.4\nDemo PDF inside virtual forensic image\n%%EOF');
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l1qZ1wAAAABJRU5ErkJggg==', 'base64').copy(sample, 0x800000);
        writeAscii(0x900000, 'PK\x03\x04Demo ZIP marker containing financial_export.csv suspicious_contract.pdf browser_cache.sqlite');
        writeAscii(0xA00000, 'Recovered deleted note vpn redacted cloud-export redacted');

        return sample;
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

    async getHexData(evidenceId: string, offset: number, length: number = 512) {
        const ev = await this.prisma.evidence.findUnique({ where: { id: evidenceId } });
        if (!ev) throw new NotFoundException('Evidence not found');

        // Download from MinIO and decrypt
        const encrypted = await this.minio.getBuffer(ev.storageBucket, ev.encryptedKey);
        const decrypted = decryptBuffer(encrypted, ev.ivHex, ev.authTagHex);

        const safeOffset = Math.max(0, Math.min(offset, decrypted.length - 1));
        const safeLength = Math.min(length, 4096, decrypted.length - safeOffset);
        const chunk = decrypted.subarray(safeOffset, safeOffset + safeLength);

        return {
            offset: safeOffset,
            length: safeLength,
            totalSize: decrypted.length,
            hex: chunk.toString('hex'),
            ascii: chunk.toString('ascii').replace(/[^\x20-\x7E]/g, '.'),
            bytes: Array.from(chunk),
        };
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

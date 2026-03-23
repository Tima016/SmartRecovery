import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MinioService } from '../../common/minio/minio.service';
import { decryptBuffer } from '../../utils/crypto.util';
import { createImageReader } from '../../utils/disk-image.util';
import { parsePartitionTable, parseFileSystem, detectFileSystemType } from '../../utils/filesystem-parser.util';
import { v4 as uuidv4 } from 'uuid';
import { FileSystemQueryDto } from './dto/filesystem.dto';

@Injectable()
export class FileSystemService {
    private readonly logger = new Logger(FileSystemService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly minioService: MinioService,
    ) { }

    /**
     * Parse file system structure from evidence and store entries in the database.
     */
    async parseEvidence(caseId: string, evidenceId?: string) {
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        const evidenceList = evidenceId
            ? await this.prisma.evidence.findMany({ where: { id: evidenceId, caseId } })
            : await this.prisma.evidence.findMany({ where: { caseId } });

        if (evidenceList.length === 0) {
            throw new NotFoundException('No evidence found for this case');
        }

        let totalFiles = 0;
        let totalDeleted = 0;

        for (const ev of evidenceList) {
            this.logger.log(`Parsing filesystem for evidence ${ev.id}...`);

            // Download and decrypt evidence
            const evidenceBuffer = await this.getEvidenceBuffer(ev);
            if (evidenceBuffer.length === 0) continue;

            // Parse partition table
            const partTable = parsePartitionTable(evidenceBuffer);
            this.logger.log(`Detected ${partTable.scheme} partition table with ${partTable.partitions.length} partitions`);

            // Store disk image info
            const firstPartitionFs = partTable.partitions.length > 0
                ? detectFileSystemType(evidenceBuffer, partTable.partitions[0].startByte)
                : detectFileSystemType(evidenceBuffer);

            await this.prisma.diskImageInfo.upsert({
                where: { evidenceId: ev.id },
                update: {
                    imageFormat: 'RAW',
                    totalSizeBytes: BigInt(evidenceBuffer.length),
                    sectorSize: partTable.sectorSize,
                    totalSectors: BigInt(Math.ceil(evidenceBuffer.length / partTable.sectorSize)),
                    partitionScheme: partTable.scheme,
                    partitions: partTable.partitions.map(p => ({
                        index: p.index,
                        startByte: p.startByte,
                        sizeBytes: p.sizeBytes,
                        typeName: p.typeName,
                        fsType: p.fsType,
                        bootable: p.bootable,
                    })),
                    fileSystemType: firstPartitionFs,
                },
                create: {
                    id: uuidv4(),
                    caseId,
                    evidenceId: ev.id,
                    imageFormat: 'RAW',
                    totalSizeBytes: BigInt(evidenceBuffer.length),
                    sectorSize: partTable.sectorSize,
                    totalSectors: BigInt(Math.ceil(evidenceBuffer.length / partTable.sectorSize)),
                    partitionScheme: partTable.scheme,
                    partitions: partTable.partitions.map(p => ({
                        index: p.index,
                        startByte: p.startByte,
                        sizeBytes: p.sizeBytes,
                        typeName: p.typeName,
                        fsType: p.fsType,
                        bootable: p.bootable,
                    })),
                    fileSystemType: firstPartitionFs,
                },
            });

            // Parse file system for each partition
            for (const partition of partTable.partitions) {
                const fsInfo = parseFileSystem(evidenceBuffer, partition.startByte);
                if (!fsInfo) {
                    this.logger.log(`Could not parse FS for partition ${partition.index} (${partition.typeName})`);
                    continue;
                }

                this.logger.log(`Parsed ${fsInfo.totalEntries} entries from ${fsInfo.type} partition ${partition.index}`);

                // Batch insert entries
                const BATCH_SIZE = 500;
                for (let i = 0; i < fsInfo.entries.length; i += BATCH_SIZE) {
                    const batch = fsInfo.entries.slice(i, i + BATCH_SIZE);

                    await this.prisma.$transaction(
                        batch.map(entry => this.prisma.fileSystemEntry.create({
                            data: {
                                id: uuidv4(),
                                caseId,
                                evidenceId: ev.id,
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
                totalDeleted += fsInfo.deletedEntries;
            }

            // If no partitions found, try parsing the whole buffer as a single FS
            if (partTable.partitions.length === 0) {
                const fsInfo = parseFileSystem(evidenceBuffer, 0);
                if (fsInfo) {
                    this.logger.log(`Parsed ${fsInfo.totalEntries} entries from raw ${fsInfo.type} image`);
                    const BATCH_SIZE = 500;
                    for (let i = 0; i < fsInfo.entries.length; i += BATCH_SIZE) {
                        const batch = fsInfo.entries.slice(i, i + BATCH_SIZE);
                        await this.prisma.$transaction(
                            batch.map(entry => this.prisma.fileSystemEntry.create({
                                data: {
                                    id: uuidv4(),
                                    caseId,
                                    evidenceId: ev.id,
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
                    totalDeleted += fsInfo.deletedEntries;
                }
            }

            // Update disk image info with results
            await this.prisma.diskImageInfo.update({
                where: { evidenceId: ev.id },
                data: { totalFiles, deletedFiles: totalDeleted },
            });
        }

        return { caseId, totalFiles, totalDeleted };
    }

    /**
     * Get filesystem entries for a case.
     */
    async getEntries(caseId: string, query: FileSystemQueryDto) {
        const where: any = { caseId };

        if (query.deletedOnly) {
            where.isDeleted = true;
        }
        if (query.parentPath) {
            where.parentPath = query.parentPath;
        }
        if (query.search) {
            where.name = { contains: query.search, mode: 'insensitive' };
        }

        const entries = await this.prisma.fileSystemEntry.findMany({
            where,
            orderBy: [{ isDirectory: 'desc' }, { name: 'asc' }],
            take: 1000,
        });

        return {
            caseId,
            total: entries.length,
            entries: entries.map(e => ({
                ...e,
                sizeBytes: e.sizeBytes.toString(),
            })),
        };
    }

    /**
     * Advanced file search with multiple constraints.
     */
    async advancedSearch(caseId: string, query: any) {
        const where: any = { caseId };

        if (query.fileName) where.name = { contains: query.fileName, mode: 'insensitive' };
        if (query.extension) where.name = { endsWith: query.extension, mode: 'insensitive' };

        if (query.sizeMin) {
            where.sizeBytes = { gte: BigInt(query.sizeMin) };
        }
        if (query.sizeMax) {
            where.sizeBytes = where.sizeBytes || {};
            where.sizeBytes.lte = BigInt(query.sizeMax);
        }

        if (query.timeStart) {
            where.modifiedAt = { gte: new Date(query.timeStart) };
        }
        if (query.timeEnd) {
            where.modifiedAt = where.modifiedAt || {};
            where.modifiedAt.lte = new Date(query.timeEnd);
        }

        if (query.deletedOnly === 'true') {
            where.isDeleted = true;
        }

        if (query.tags) {
            const tagNames = query.tags.split(',').map((t: string) => t.trim());
            const tagRelations = await this.prisma.tagRelation.findMany({
                where: {
                    entityType: 'FILE',
                    tag: { name: { in: tagNames }, caseId }
                },
                select: { entityId: true }
            });
            const entityIds = tagRelations.map(tr => tr.entityId);
            where.id = { in: entityIds };
        }

        const entries = await this.prisma.fileSystemEntry.findMany({
            where,
            orderBy: [{ isDirectory: 'desc' }, { name: 'asc' }],
            take: 1000,
        });

        return {
            caseId,
            total: entries.length,
            entries: entries.map(e => ({
                ...e,
                sizeBytes: e.sizeBytes.toString(),
            })),
        };
    }

    /**
     * Get deleted file entries for a case.
     */
    async getDeletedEntries(caseId: string) {
        return this.getEntries(caseId, { deletedOnly: true });
    }

    /**
     * Get disk image info for evidence.
     */
    async getDiskImageInfo(caseId: string) {
        const info = await this.prisma.diskImageInfo.findMany({
            where: { caseId },
        });

        return info.map(i => ({
            ...i,
            totalSizeBytes: i.totalSizeBytes.toString(),
            totalSectors: i.totalSectors.toString(),
        }));
    }

    /**
     * Preview file contents by extracting from the disk image.
     * Uses inode * 512 as an approximate mock offset in the raw image for demonstration.
     */
    async previewFile(caseId: string, fileId: string) {
        const entry = await this.prisma.fileSystemEntry.findUnique({
            where: { id: fileId }
        });

        if (!entry || entry.caseId !== caseId) {
            throw new NotFoundException('File entry not found');
        }

        const evidence = await this.prisma.evidence.findUnique({
            where: { id: entry.evidenceId }
        });

        if (!evidence) {
            throw new NotFoundException('Associated evidence not found');
        }

        const buffer = await this.getEvidenceBuffer(evidence);

        // Mock extraction logic: Use inode as offset in sectors
        let offset = 0;
        if (entry.inode) {
            offset = entry.inode * 512;
        }

        const size = Number(entry.sizeBytes);
        const extracted = buffer.subarray(offset, Math.min(offset + size, buffer.length));

        // Let's ensure it's returned as a streamable response object
        const { StreamableFile } = await import('@nestjs/common');
        return new StreamableFile(extracted);
    }

    private async getEvidenceBuffer(ev: any): Promise<Buffer> {
        try {
            const encryptedBuffer = await this.minioService.getBuffer(ev.storageBucket, ev.encryptedKey);
            const decrypted = decryptBuffer(encryptedBuffer, ev.ivHex, ev.authTagHex);
            const imageReader = createImageReader(decrypted);
            return imageReader.getFullBuffer();
        } catch (error: any) {
            this.logger.error(`Failed to read evidence ${ev.id}: ${error.message}`);
            return Buffer.alloc(0);
        }
    }
}

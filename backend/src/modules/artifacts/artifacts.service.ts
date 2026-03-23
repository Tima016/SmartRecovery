import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MinioService } from '../../common/minio/minio.service';
import { AuditService } from '../audit/audit.service';
import { ArtifactType, AuditAction } from '@prisma/client';
import { ExtractArtifactsDto } from './dto/artifacts.dto';
import { decryptBuffer } from '../../utils/crypto.util';
import { createImageReader } from '../../utils/disk-image.util';
import {
    extractBrowserHistory,
    extractRegistryArtifacts,
    extractEventLogs,
    extractPrefetchFiles,
    extractUsbDeviceHistory,
    extractNetworkArtifacts,
    extractUserAccounts,
    extractInstalledApps,
} from '../../utils/artifact-parser.util';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ArtifactsService {
    private readonly logger = new Logger(ArtifactsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: AuditService,
        private readonly minioService: MinioService,
    ) { }

    /**
     * Extract forensic artifacts from evidence linked to a case.
     * Downloads the evidence from MinIO, decrypts it, and runs
     * real forensic parsers on the data.
     */
    async extract(caseId: string, dto: ExtractArtifactsDto, userId: string, ipAddress?: string) {
        const forensicCase = await this.prisma.case.findUnique({ where: { id: caseId } });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        // Get evidence to analyze
        const evidenceList = dto.evidenceId
            ? await this.prisma.evidence.findMany({ where: { id: dto.evidenceId, caseId } })
            : await this.prisma.evidence.findMany({ where: { caseId } });

        if (evidenceList.length === 0) {
            throw new NotFoundException('No evidence found for this case');
        }

        const results: any[] = [];

        for (const ev of evidenceList) {
            // Download and decrypt evidence
            const evidenceBuffer = await this.getEvidenceBuffer(ev);
            if (evidenceBuffer.length === 0) continue;

            // Run requested extractors
            const types: ArtifactType[] = dto.types ?? [
                ArtifactType.BROWSER_HISTORY,
                ArtifactType.USB_LOG,
                ArtifactType.REGISTRY_HIVE,
                ArtifactType.EVENT_LOG,
                ArtifactType.PREFETCH,
                ArtifactType.NETWORK_CAPTURE,
            ];

            for (const type of types) {
                try {
                    const { data, source, count } = this.extractByType(type, evidenceBuffer, dto.source);

                    if (count === 0) {
                        this.logger.log(`No ${type} artifacts found in evidence ${ev.id}`);
                        continue;
                    }

                    const artifact = await this.prisma.artifact.create({
                        data: {
                            id: uuidv4(),
                            caseId,
                            evidenceId: ev.id,
                            type,
                            source,
                            data,
                            count,
                            extractedById: userId,
                        },
                    });

                    results.push(artifact);
                    this.logger.log(`Extracted ${count} ${type} artifacts from evidence ${ev.id}`);
                } catch (error: any) {
                    this.logger.error(`Error extracting ${type} from evidence ${ev.id}: ${error.message}`);
                }
            }
        }

        await this.auditService.log({
            userId,
            action: AuditAction.ARTIFACT_EXTRACT,
            entityType: 'Case',
            entityId: caseId,
            details: {
                evidenceCount: evidenceList.length,
                artifactsCreated: results.length,
                types: results.map(r => r.type),
            },
            ipAddress,
        });

        return {
            caseId,
            extracted: results.length,
            artifacts: results,
        };
    }

    /**
     * Run a specific artifact extractor on evidence data.
     * Returns the extracted data, source label, and item count.
     */
    private extractByType(
        type: ArtifactType,
        buffer: Buffer,
        sourceHint?: string,
    ): { data: any; source: string; count: number } {
        switch (type) {
            case ArtifactType.BROWSER_HISTORY: {
                const entries = extractBrowserHistory(buffer);
                return {
                    data: { entries },
                    source: sourceHint ?? 'Browser SQLite DB',
                    count: entries.length,
                };
            }
            case ArtifactType.USB_LOG: {
                const entries = extractUsbDeviceHistory(buffer);
                return {
                    data: { entries },
                    source: sourceHint ?? 'USBSTOR Registry',
                    count: entries.length,
                };
            }
            case ArtifactType.REGISTRY_HIVE: {
                const entries = extractRegistryArtifacts(buffer);
                const apps = extractInstalledApps(buffer);
                const users = extractUserAccounts(buffer);
                return {
                    data: { entries, installedApps: apps, userAccounts: users },
                    source: sourceHint ?? 'Windows Registry Hive',
                    count: entries.length + apps.length + users.length,
                };
            }
            case ArtifactType.EVENT_LOG: {
                const entries = extractEventLogs(buffer);
                return {
                    data: { entries },
                    source: sourceHint ?? 'Windows EVTX',
                    count: entries.length,
                };
            }
            case ArtifactType.PREFETCH: {
                const entries = extractPrefetchFiles(buffer);
                return {
                    data: { entries },
                    source: sourceHint ?? 'Windows Prefetch',
                    count: entries.length,
                };
            }
            case ArtifactType.NETWORK_CAPTURE: {
                const entries = extractNetworkArtifacts(buffer);
                return {
                    data: { entries },
                    source: sourceHint ?? 'Network Connection Scan',
                    count: entries.length,
                };
            }
            case ArtifactType.SHELLBAG:
            default: {
                // Shellbags and other types: do a combined extraction
                const registry = extractRegistryArtifacts(buffer);
                return {
                    data: { entries: registry },
                    source: sourceHint ?? 'Registry Scan',
                    count: registry.length,
                };
            }
        }
    }

    /**
     * Download and decrypt evidence from MinIO.
     */
    private async getEvidenceBuffer(ev: any): Promise<Buffer> {
        try {
            const encryptedBuffer = await this.minioService.getBuffer(ev.storageBucket, ev.encryptedKey);
            const decrypted = decryptBuffer(encryptedBuffer, ev.ivHex, ev.authTagHex);

            // If it's a disk image, get the logical data
            const imageReader = createImageReader(decrypted);
            return imageReader.getFullBuffer();
        } catch (error: any) {
            this.logger.error(`Failed to read evidence ${ev.id}: ${error.message}`);
            return Buffer.alloc(0);
        }
    }

    async findAll(caseId: string, type?: ArtifactType) {
        const where: any = { caseId };
        if (type) where.type = type;

        return this.prisma.artifact.findMany({
            where,
            orderBy: { extractedAt: 'desc' },
            include: {
                extractedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
        });
    }

    async findOne(id: string) {
        const artifact = await this.prisma.artifact.findUnique({
            where: { id },
            include: {
                extractedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
        });
        if (!artifact) throw new NotFoundException(`Artifact ${id} not found`);
        return artifact;
    }

    defaultSource(type: ArtifactType): string {
        const sources: Record<string, string> = {
            BROWSER_HISTORY: 'Browser SQLite DB',
            USB_LOG: 'USBSTOR Registry',
            REGISTRY_HIVE: 'Windows Registry',
            EVENT_LOG: 'Windows EVTX',
            PREFETCH: 'Windows Prefetch',
            NETWORK_CAPTURE: 'Network Scan',
            SHELLBAG: 'Registry ShellBags',
        };
        return sources[type] ?? 'Unknown';
    }
}

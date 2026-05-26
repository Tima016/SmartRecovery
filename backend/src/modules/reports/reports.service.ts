import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MinioService } from '../../common/minio/minio.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');
import { stringify } from 'csv-stringify/sync';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ReportsService {
    private readonly logger = new Logger(ReportsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly minio: MinioService,
        private readonly configService: ConfigService,
        private readonly auditService: AuditService,
    ) { }

    async exportPdf(caseId: string, userId: string, ipAddress?: string): Promise<Buffer> {
        const data = await this.gatherReportData(caseId);
        let buffer: Buffer;
        try {
            buffer = await this.buildPdf(data);
        } catch (pdfErr: any) {
            this.logger.error(`PDF generation failed for case ${caseId}: ${pdfErr?.message ?? pdfErr}`);
            throw new Error(`PDF generation failed: ${pdfErr?.message ?? 'Unknown error'}`);
        }
        const reportId = uuidv4();

        // Non-blocking persistence: PDF export should still succeed even if object storage/DB are temporarily unavailable.
        try {
            const bucket = this.configService.get<string>('MINIO_REPORTS_BUCKET', 'dfip-reports');
            const key = `cases/${caseId}/reports/${reportId}.pdf`;
            await this.minio.uploadBuffer(bucket, key, buffer, 'application/pdf');

            await this.prisma.report.create({
                data: {
                    id: reportId,
                    caseId,
                    format: 'pdf',
                    storageBucket: bucket,
                    storageKey: key,
                    sizeBytes: BigInt(buffer.length),
                    generatedById: userId,
                },
            });
        } catch (err) {
            this.logger.warn(`Report persistence failed for case ${caseId}: ${(err as Error).message}`);
        }

        await this.auditService.log({
            userId,
            action: 'REPORT_GENERATE' as AuditAction,
            entityType: 'Case',
            entityId: caseId,
            caseId,
            details: { format: 'pdf', reportId },
            ipAddress,
        });

        return buffer;
    }

    async exportJson(caseId: string, userId: string, ipAddress?: string): Promise<object> {
        const data = await this.gatherReportData(caseId);
        await this.auditService.log({
            userId,
            action: 'REPORT_GENERATE' as AuditAction,
            entityType: 'Case',
            entityId: caseId,
            caseId,
            details: { format: 'json' },
            ipAddress,
        });
        return data;
    }

    async exportCsv(caseId: string, userId: string, ipAddress?: string): Promise<string> {
        const data = await this.gatherReportData(caseId);
        const rows = data.timelineEvents.map((e: any) => ({
            timestamp: e.timestamp,
            type: e.type,
            description: e.description,
            source: e.source,
            actor: e.actor ?? '',
            targetObject: e.targetObject ?? '',
            correlationScore: e.correlationScore,
        }));

        const csvOutput = stringify(rows, { header: true });
        await this.auditService.log({
            userId,
            action: 'REPORT_GENERATE' as AuditAction,
            entityType: 'Case',
            entityId: caseId,
            caseId,
            details: { format: 'csv' },
            ipAddress,
        });
        return csvOutput;
    }

    private async gatherReportData(caseId: string) {
        const forensicCase = await this.prisma.case.findUnique({
            where: { id: caseId },
            include: {
                createdBy: { select: { email: true, firstName: true, lastName: true } },
                assignedTo: { select: { email: true, firstName: true, lastName: true } },
            },
        });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        const [
            evidenceRes,
            timelineEventsRes,
            artifactsRes,
            custodyRecordsRes,
            recoveredFilesRes,
        ] = await Promise.allSettled([
            this.prisma.evidence.findMany({ where: { caseId }, orderBy: { uploadedAt: 'asc' } }),
            this.prisma.timelineEvent.findMany({ where: { caseId }, orderBy: { timestamp: 'asc' } }),
            this.prisma.artifact.findMany({ where: { caseId }, orderBy: { extractedAt: 'asc' } }),
            this.prisma.chainOfCustody.findMany({
                where: { evidence: { caseId } },
                orderBy: { performedAt: 'asc' },
                include: { evidence: { select: { originalFilename: true } }, performedBy: { select: { email: true } } },
            }),
            this.prisma.recoveredFile.findMany({ where: { caseId }, orderBy: { confidence: 'desc' }, take: 150 }),
        ]);

        const getSettled = <T>(result: PromiseSettledResult<T>, label: string, fallback: T): T => {
            if (result.status === 'fulfilled') return result.value;
            this.logger.warn(`Report data query failed (${label}) for case ${caseId}: ${result.reason?.message ?? result.reason}`);
            return fallback;
        };

        const evidence = getSettled(evidenceRes, 'evidence', []);
        const timelineEvents = getSettled(timelineEventsRes, 'timeline', []);
        const artifacts = getSettled(artifactsRes, 'artifacts', []);
        const custodyRecords = getSettled(custodyRecordsRes, 'custody', []);
        const recoveredFiles = getSettled(recoveredFilesRes, 'recoveredFiles', []);

        const suspiciousEvents = timelineEvents.filter((e) => Number(e.correlationScore ?? 0) >= 70);
        const avgConfidence = recoveredFiles.length > 0
            ? recoveredFiles.reduce((sum, f) => sum + Number(f.confidence ?? 0), 0) / recoveredFiles.length
            : 0;

        const timelineTypeSummary = timelineEvents.reduce<Record<string, number>>((acc, item) => {
            const key = String(item.type);
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {});

        return {
            generatedAt: new Date().toISOString(),
            platformName: 'DFIP - Digital Forensic Investigation Platform',
            case: {
                ...forensicCase,
                openedAt: forensicCase.openedAt.toISOString(),
                closedAt: forensicCase.closedAt?.toISOString() ?? null,
                updatedAt: forensicCase.updatedAt.toISOString(),
            },
            evidence: evidence.map((e) => ({
                id: e.id,
                filename: e.originalFilename,
                status: e.status,
                md5: e.md5,
                sha1: e.sha1,
                sha256: e.sha256,
                sha512: e.sha512,
                uploadedAt: e.uploadedAt.toISOString(),
                sizeBytes: e.sizeBytes.toString(),
            })),
            timelineEvents,
            timelineTypeSummary,
            suspiciousEvents,
            artifacts: artifacts.map((a) => ({
                id: a.id,
                type: a.type,
                source: a.source,
                count: a.count,
                extractedAt: a.extractedAt.toISOString(),
            })),
            recoveredFiles: recoveredFiles.map((f) => ({
                ...f,
                sizeBytes: f.sizeBytes?.toString(),
                offsetStart: f.offsetStart?.toString(),
                offsetEnd: f.offsetEnd?.toString(),
            })),
            recoverySummary: {
                total: recoveredFiles.length,
                highConfidence: recoveredFiles.filter((f) => Number(f.confidence ?? 0) >= 90).length,
                avgConfidence: Number(avgConfidence.toFixed(2)),
            },
            custodyRecords: custodyRecords.map((c) => ({
                evidenceFile: c.evidence?.originalFilename ?? 'N/A',
                action: c.action,
                performedBy: c.performedBy?.email ?? 'N/A',
                performedAt: c.performedAt.toISOString(),
                recordHash: c.recordHash,
            })),
        };
    }

    private buildPdf(data: Awaited<ReturnType<typeof this.gatherReportData>>): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            try {
            const doc = new PDFDocument({ margin: 50, size: 'A4', info: {
                Title: `Forensic Report - ${data.case.caseNumber ?? 'N/A'}`,
                Author: data.platformName,
                Subject: `Case ${data.case.caseNumber ?? 'N/A'}`,
                Keywords: 'forensic,investigation,report,evidence,timeline',
            } });
            let pageNumber = 0;
            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', (err: any) => reject(err ?? new Error('PDFKit error')));

            const BRAND = {
                primary: '#0F172A',
                accent: '#0EA5E9',
                muted: '#475569',
                light: '#E2E8F0',
                ok: '#16A34A',
                warn: '#D97706',
                danger: '#DC2626',
            };

            const formatDate = (v?: string | Date | null) => {
                if (!v) return 'N/A';
                const d = typeof v === 'string' ? new Date(v) : v;
                if (isNaN(d.getTime())) return 'N/A';
                return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            };

            const toText = (value: unknown, fallback = 'N/A') => {
                if (value === null || value === undefined) return fallback;
                const txt = String(value).trim();
                return txt.length > 0 ? txt : fallback;
            };

            const buildFullName = (person?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) => {
                if (!person) return 'N/A';
                const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
                if (fullName.length > 0) return fullName;
                return toText(person.email);
            };

            const formatBytes = (sizeStr: string) => {
                const size = Number(sizeStr || 0);
                if (!Number.isFinite(size) || size < 0) return 'N/A';
                if (size < 1024) return `${size} B`;
                if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
                if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
                return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
            };

            const drawHeader = () => {
                doc.rect(0, 0, doc.page.width, 48).fill(BRAND.primary);
                doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
                    .text(toText(data.platformName), 50, 16, { align: 'left' });
                doc.font('Helvetica').fontSize(9)
                    .text(`Case ${toText(data.case.caseNumber)} | ${toText(data.case.title)}`, 50, 29, {
                        width: doc.page.width - 100,
                        ellipsis: true,
                    });
                doc.fillColor(BRAND.light).lineWidth(0.5)
                    .moveTo(50, 46).lineTo(doc.page.width - 50, 46).stroke();
                doc.fillColor('#111827');
            };

            const drawFooter = () => {
                const y = doc.page.height - 36;
                doc.strokeColor(BRAND.light).lineWidth(0.5)
                    .moveTo(50, y - 8).lineTo(doc.page.width - 50, y - 8).stroke();
                doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8)
                    .text(`Generated ${formatDate(data.generatedAt)} | Confidential For Official Use`, 50, y, {
                        align: 'left',
                        width: doc.page.width - 100,
                    })
                    .text(`Page ${pageNumber}`, 50, y, {
                        align: 'right',
                        width: doc.page.width - 100,
                    });
                doc.fillColor('#111827');
            };

            const ensureSpace = (heightNeeded = 60) => {
                if (doc.y + heightNeeded > doc.page.height - 60) {
                    doc.addPage();
                }
            };

            const sectionTitle = (index: string, title: string) => {
                ensureSpace(45);
                doc.moveDown(0.2);
                doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND.primary)
                    .text(`${index}. ${title}`);
                doc.moveDown(0.3);
                doc.strokeColor(BRAND.light).lineWidth(0.8)
                    .moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
                doc.moveDown(0.5);
                doc.fillColor('#111827').font('Helvetica').fontSize(10);
            };

            const keyValue = (label: string, value: string) => {
                ensureSpace(18);
                doc.font('Helvetica-Bold').fillColor(BRAND.muted).text(`${label}: `, { continued: true, width: 160 });
                doc.font('Helvetica').fillColor('#111827').text(value || 'N/A');
            };

            const drawSimpleTable = (headers: string[], rows: string[][], widths: number[]) => {
                const rowHeight = 18;
                const startX = 50;
                const totalWidth = widths.reduce((a, b) => a + b, 0);

                ensureSpace(rowHeight * 2);

                doc.rect(startX, doc.y, totalWidth, rowHeight).fill(BRAND.primary);
                let cursorX = startX;
                doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
                headers.forEach((h, idx) => {
                    doc.text(h, cursorX + 4, doc.y + 5, { width: widths[idx] - 8, ellipsis: true });
                    cursorX += widths[idx];
                });
                doc.moveDown(1.2);

                rows.forEach((row, i) => {
                    ensureSpace(rowHeight + 6);
                    const y = doc.y;
                    if (i % 2 === 0) {
                        doc.rect(startX, y - 2, totalWidth, rowHeight).fill('#F8FAFC');
                    }
                    cursorX = startX;
                    doc.fillColor('#111827').font('Helvetica').fontSize(8);
                    row.forEach((cell, idx) => {
                        doc.text(cell ?? '', cursorX + 4, y + 3, { width: widths[idx] - 8, ellipsis: true });
                        cursorX += widths[idx];
                    });
                    doc.y = y + rowHeight;
                });
                doc.moveDown(0.4);
            };

            doc.on('pageAdded', () => {
                pageNumber++;
                drawHeader();
                drawFooter();
                doc.y = 66;
            });

            // Cover page
            pageNumber = 1;
            doc.rect(0, 0, doc.page.width, doc.page.height).fill('#F8FAFC');
            doc.rect(0, 0, doc.page.width, 160).fill(BRAND.primary);
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(25)
                .text('DIGITAL FORENSIC REPORT', 50, 58, { align: 'left' });
            doc.font('Helvetica').fontSize(12)
                .text(data.platformName, 50, 95, { align: 'left' })
                .text('Professional Incident Evidence Dossier', 50, 112, { align: 'left' });

            doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(13).text('Case Information', 50, 190);
            doc.roundedRect(50, 214, doc.page.width - 100, 190, 8).fill('#FFFFFF').stroke('#E2E8F0');
            doc.font('Helvetica').fontSize(11).fillColor('#111827');

            const coverRows = [
                ['Case Number', toText(data.case.caseNumber)],
                ['Case Title', toText(data.case.title)],
                ['Status', String(data.case.status)],
                ['Priority', String(data.case.priority)],
                ['Classification', String(data.case.classification)],
                ['Investigator', data.case.assignedTo ? buildFullName(data.case.assignedTo) : 'Unassigned'],
                ['Prepared By', buildFullName(data.case.createdBy)],
                ['Opened', formatDate(data.case.openedAt)],
                ['Generated', formatDate(data.generatedAt)],
            ];

            let coverY = 230;
            coverRows.forEach(([label, value]) => {
                doc.font('Helvetica-Bold').fillColor(BRAND.muted).text(`${label}:`, 68, coverY, { width: 130 });
                doc.font('Helvetica').fillColor('#111827').text(String(value ?? 'N/A'), 205, coverY, {
                    width: doc.page.width - 270,
                    ellipsis: true,
                });
                coverY += 18;
            });

            doc.fillColor(BRAND.muted).font('Helvetica').fontSize(9)
                .text('This report is generated by the DFIP platform and is intended for investigative and legal workflows.', 50, doc.page.height - 88, {
                    width: doc.page.width - 100,
                    align: 'center',
                });
            drawFooter();

            // Page 2 onwards with headers
            doc.addPage();

            sectionTitle('1', 'Executive Summary');
            keyValue('Total Evidence Items', String(data.evidence.length));
            keyValue('Timeline Events', String(data.timelineEvents.length));
            keyValue('Extracted Artifacts', String(data.artifacts.length));
            keyValue('Recovered Files', String(data.recoverySummary.total));
            keyValue('High-Confidence Recoveries', String(data.recoverySummary.highConfidence));
            keyValue('Average Recovery Confidence', `${data.recoverySummary.avgConfidence}%`);
            keyValue('Suspicious Timeline Events (>= 70 score)', String(data.suspiciousEvents.length));

            sectionTitle('2', 'Case Metadata');
            keyValue('Case ID', data.case.id);
            keyValue('Case Number', toText(data.case.caseNumber));
            keyValue('Case Title', toText(data.case.title));
            keyValue('Description', toText(data.case.description));
            keyValue('Tags', Array.isArray(data.case.tags) && data.case.tags.length > 0 ? data.case.tags.join(', ') : 'None');
            keyValue('Assigned Investigator', data.case.assignedTo
                ? `${buildFullName(data.case.assignedTo)} (${toText(data.case.assignedTo.email)})`
                : 'Unassigned');

            sectionTitle('3', 'Evidence Integrity Register');
            if (data.evidence.length === 0) {
                doc.font('Helvetica').fontSize(10).fillColor(BRAND.muted).text('No evidence items available for this case.');
            } else {
                const evidenceRows = data.evidence.map((e: any) => ([
                    e.filename,
                    String(e.status),
                    formatBytes(e.sizeBytes),
                    String(e.sha256 || '').slice(0, 16) + '...',
                ]));
                drawSimpleTable(
                    ['Evidence File', 'Status', 'Size', 'SHA-256 (short)'],
                    evidenceRows,
                    [220, 90, 80, 155],
                );
            }

            sectionTitle('4', 'Chain Of Custody Summary');
            if (data.custodyRecords.length === 0) {
                doc.font('Helvetica').fontSize(10).fillColor(BRAND.muted).text('No custody records were found.');
            } else {
                const rows = data.custodyRecords.slice(0, 60).map((item: any) => ([
                    formatDate(item.performedAt),
                    item.action,
                    item.performedBy,
                    String(item.evidenceFile || '').slice(0, 30),
                ]));
                drawSimpleTable(
                    ['Timestamp', 'Action', 'Operator', 'Evidence'],
                    rows,
                    [130, 110, 130, 175],
                );
                if (data.custodyRecords.length > 60) {
                    doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8)
                        .text(`Showing first 60 custody entries of ${data.custodyRecords.length}. Use JSON export for full dataset.`);
                }
            }

            sectionTitle('5', 'Timeline Highlights');
            const typeEntries = Object.entries(data.timelineTypeSummary);
            if (typeEntries.length === 0) {
                doc.font('Helvetica').fontSize(10).fillColor(BRAND.muted).text('No timeline events available.');
            } else {
                const typeRows = typeEntries.map(([k, v]) => [k, String(v)]);
                drawSimpleTable(['Timeline Type', 'Events'], typeRows, [350, 195]);
            }

            const highlightEvents = data.suspiciousEvents.slice(0, 20);
            if (highlightEvents.length > 0) {
                ensureSpace(30);
                doc.moveDown(0.3);
                doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.danger).text('High-Risk Event Highlights');
                doc.moveDown(0.3);
                highlightEvents.forEach((ev: any, idx: number) => {
                    ensureSpace(28);
                    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827')
                        .text(`${idx + 1}. [${formatDate(ev.timestamp)}] Score ${ev.correlationScore}`);
                    doc.font('Helvetica').fontSize(9).fillColor(BRAND.muted)
                        .text(`${ev.description || 'No description'} | Source: ${ev.source || 'N/A'}`);
                    if (ev.targetObject) {
                        doc.text(`Target: ${ev.targetObject}`);
                    }
                    doc.moveDown(0.2);
                });
            }

            sectionTitle('6', 'Artifact Extraction Summary');
            if (data.artifacts.length === 0) {
                doc.font('Helvetica').fontSize(10).fillColor(BRAND.muted).text('No extracted artifacts found.');
            } else {
                const artifactRows = data.artifacts.slice(0, 80).map((a: any) => ([
                    String(a.type),
                    String(a.source || 'N/A').slice(0, 30),
                    String(a.count ?? 0),
                    formatDate(a.extractedAt),
                ]));
                drawSimpleTable(
                    ['Type', 'Source', 'Count', 'Extracted'],
                    artifactRows,
                    [145, 155, 60, 185],
                );
            }

            sectionTitle('7', 'Recovered File Findings');
            if (data.recoveredFiles.length === 0) {
                doc.font('Helvetica').fontSize(10).fillColor(BRAND.muted).text('No recovered files available.');
            } else {
                const recoveredRows = data.recoveredFiles.slice(0, 70).map((f: any) => ([
                    String(f.filename || '').slice(0, 28),
                    String(f.method || 'N/A'),
                    `${Number(f.confidence ?? 0).toFixed(1)}%`,
                    formatBytes(String(f.sizeBytes || '0')),
                    String(f.mimeType || 'N/A').slice(0, 20),
                ]));
                drawSimpleTable(
                    ['File', 'Method', 'Confidence', 'Size', 'MIME'],
                    recoveredRows,
                    [190, 80, 75, 80, 120],
                );
            }

            sectionTitle('8', 'Report Certification');
            keyValue('Platform', data.platformName);
            keyValue('Document Type', 'Digital Forensic Investigation Report (PDF)');
            keyValue('Integrity Statement', 'This report reflects the current case dataset and audit-tracked exports.');
            keyValue('Prepared Timestamp', formatDate(data.generatedAt));
            keyValue('Legal Notice', 'Confidential. Distribution only to authorized investigation personnel.');

            doc.end();
            } catch (buildErr: any) {
                reject(buildErr ?? new Error('PDF build failed'));
            }
        });
    }
}

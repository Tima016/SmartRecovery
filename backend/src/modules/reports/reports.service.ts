import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MinioService } from '../../common/minio/minio.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@prisma/client';
import * as PDFDocument from 'pdfkit';
import { stringify } from 'csv-stringify/sync';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

@Injectable()
export class ReportsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly minio: MinioService,
        private readonly configService: ConfigService,
        private readonly auditService: AuditService,
    ) { }

    async exportPdf(caseId: string, userId: string, ipAddress?: string): Promise<Buffer> {
        const data = await this.gatherReportData(caseId);
        const buffer = await this.buildPdf(data);

        // Store generated report in MinIO
        const reportId = uuidv4();
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
        await this.auditService.log({ userId, action: 'REPORT_GENERATE' as AuditAction, entityType: 'Case', entityId: caseId, caseId, details: { format: 'json' }, ipAddress });
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
        await this.auditService.log({ userId, action: 'REPORT_GENERATE' as AuditAction, entityType: 'Case', entityId: caseId, caseId, details: { format: 'csv' }, ipAddress });
        return csvOutput;
    }

    // ─── Private helpers ──────────────────────────────────────────────

    private async gatherReportData(caseId: string) {
        const forensicCase = await this.prisma.case.findUnique({
            where: { id: caseId },
            include: {
                createdBy: { select: { email: true, firstName: true, lastName: true } },
                assignedTo: { select: { email: true, firstName: true, lastName: true } },
            },
        });
        if (!forensicCase) throw new NotFoundException(`Case ${caseId} not found`);

        const [evidence, timelineEvents, artifacts, custodyRecords] = await this.prisma.$transaction([
            this.prisma.evidence.findMany({ where: { caseId }, orderBy: { uploadedAt: 'asc' } }),
            this.prisma.timelineEvent.findMany({ where: { caseId }, orderBy: { timestamp: 'asc' } }),
            this.prisma.artifact.findMany({ where: { caseId }, orderBy: { extractedAt: 'asc' } }),
            this.prisma.chainOfCustody.findMany({
                where: { evidence: { caseId } },
                orderBy: { performedAt: 'asc' },
                include: { evidence: { select: { originalFilename: true } }, performedBy: { select: { email: true } } },
            }),
        ]);

        return {
            generatedAt: new Date().toISOString(),
            case: { ...forensicCase, openedAt: forensicCase.openedAt.toISOString() },
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
            artifacts: artifacts.map((a) => ({ id: a.id, type: a.type, source: a.source, count: a.count })),
            custodyRecords: custodyRecords.map((c) => ({
                evidenceFile: c.evidence.originalFilename,
                action: c.action,
                performedBy: c.performedBy.email,
                performedAt: c.performedAt.toISOString(),
                recordHash: c.recordHash,
            })),
        };
    }

    private buildPdf(data: Awaited<ReturnType<typeof this.gatherReportData>>): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            const chunks: Buffer[] = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const c = data.case as any;

            // ── Cover ────────────────────────────────────────────────────
            doc.fontSize(22).fillColor('#1a1a2e').text('DIGITAL FORENSIC INVESTIGATION REPORT', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(14).fillColor('#333').text('CONFIDENTIAL — COURT ADMISSIBLE DOCUMENT', { align: 'center' });
            doc.moveDown(1);
            doc.strokeColor('#aaa').lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
            doc.moveDown(1);

            // ── Case Details ────────────────────────────────────────────
            doc.fontSize(16).fillColor('#1a1a2e').text('1. Case Summary');
            doc.moveDown(0.3);
            const details = [
                ['Case Number', c.caseNumber],
                ['Title', c.title],
                ['Status', c.status],
                ['Priority', c.priority],
                ['Classification', c.classification],
                ['Opened', c.openedAt],
                ['Assigned To', c.assignedTo ? `${c.assignedTo.firstName} ${c.assignedTo.lastName}` : 'Unassigned'],
                ['Created By', `${c.createdBy.firstName} ${c.createdBy.lastName}`],
                ['Tags', c.tags?.join(', ') || 'None'],
            ];
            doc.fontSize(10).fillColor('#333');
            details.forEach(([k, v]) => {
                doc.text(`${k}: `, { continued: true }).fillColor('#555').text(String(v)).fillColor('#333');
            });
            doc.moveDown(1);

            // ── Evidence Hashes ──────────────────────────────────────────
            doc.fontSize(16).fillColor('#1a1a2e').text('2. Evidence Hash Verification');
            doc.moveDown(0.3);
            if (data.evidence.length === 0) {
                doc.fontSize(10).fillColor('#555').text('No evidence items recorded.');
            } else {
                data.evidence.forEach((e, i) => {
                    doc.fontSize(11).fillColor('#333').text(`${i + 1}. ${e.filename}`);
                    doc.fontSize(9).fillColor('#666')
                        .text(`   Status: ${e.status} | Size: ${e.sizeBytes} bytes | Uploaded: ${e.uploadedAt}`)
                        .text(`   MD5:    ${e.md5}`)
                        .text(`   SHA1:   ${e.sha1}`)
                        .text(`   SHA256: ${e.sha256}`)
                        .text(`   SHA512: ${e.sha512}`);
                    doc.moveDown(0.5);
                });
            }
            doc.moveDown(0.5);

            // ── Chain of Custody ─────────────────────────────────────────
            doc.fontSize(16).fillColor('#1a1a2e').text('3. Chain of Custody');
            doc.moveDown(0.3);
            data.custodyRecords.forEach((cr, i) => {
                doc.fontSize(9).fillColor('#333')
                    .text(`${i + 1}. [${cr.performedAt}] ${cr.action}`)
                    .fillColor('#666')
                    .text(`   File: ${cr.evidenceFile} | By: ${cr.performedBy}`)
                    .text(`   Hash: ${cr.recordHash}`);
                doc.moveDown(0.3);
            });
            doc.moveDown(0.5);

            // ── Timeline Events ──────────────────────────────────────────
            doc.addPage();
            doc.fontSize(16).fillColor('#1a1a2e').text('4. Forensic Timeline');
            doc.moveDown(0.3);
            const timelineEvents: any[] = data.timelineEvents;
            if (timelineEvents.length === 0) {
                doc.fontSize(10).fillColor('#555').text('No timeline events recorded.');
            } else {
                timelineEvents.slice(0, 100).forEach((e, i) => {
                    const ts = e.timestamp ? new Date(e.timestamp).toISOString() : '';
                    doc.fontSize(9).fillColor('#333')
                        .text(`${i + 1}. [${ts}] [${e.type}] ${e.description}`)
                        .fillColor('#666');
                    if (e.targetObject) doc.text(`   Target: ${e.targetObject}`);
                    if (e.correlationScore > 0) doc.text(`   Correlation Score: ${e.correlationScore}`);
                    doc.moveDown(0.2);
                });
                if (timelineEvents.length > 100) {
                    doc.fontSize(9).fillColor('#999').text(`... and ${timelineEvents.length - 100} more events (see JSON export for full list).`);
                }
            }
            doc.moveDown(0.5);

            // ── Key Findings ─────────────────────────────────────────────
            doc.fontSize(16).fillColor('#1a1a2e').text('5. Key Findings');
            doc.moveDown(0.3);
            const highCorrelation: any[] = timelineEvents.filter((e: any) => e.correlationScore >= 75);
            if (highCorrelation.length > 0) {
                doc.fontSize(10).fillColor('#c0392b').text(`⚠ ${highCorrelation.length} high-correlation event(s) detected:`);
                highCorrelation.forEach((e: any) => {
                    doc.fontSize(9).fillColor('#333').text(`  • [Score: ${e.correlationScore}] ${e.description}`);
                });
            } else {
                doc.fontSize(10).fillColor('#555').text('No high-correlation events detected.');
            }
            doc.moveDown(1);

            // ── Footer ────────────────────────────────────────────────────
            doc.strokeColor('#aaa').lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
            doc.moveDown(0.5);
            doc.fontSize(8).fillColor('#999')
                .text(`Generated by DFIP Platform • ${data.generatedAt}`, { align: 'center' })
                .text('This document is confidential and intended for authorized personnel only.', { align: 'center' });

            doc.end();
        });
    }
}

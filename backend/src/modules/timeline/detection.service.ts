import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Rule-based forensic anomaly detector.
 * Analyses timeline events for suspicious behavioural patterns.
 */
@Injectable()
export class DetectionService {
    private readonly logger = new Logger(DetectionService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Run all detection rules for a case and persist SuspiciousEvent records.
     */
    async runDetection(caseId: string): Promise<{ detected: number }> {
        this.logger.log(`Running anomaly detection for case ${caseId}`);

        const events = await this.prisma.timelineEvent.findMany({
            where: { caseId },
            orderBy: { timestamp: 'asc' },
        });

        const auditLogs = await this.prisma.auditLog.findMany({
            where: { caseId },
            orderBy: { createdAt: 'asc' },
        });

        const detectedEvents: {
            title: string;
            description: string;
            severity: string;
            relatedEventIds: string[];
        }[] = [];

        // ── Rule 1: USB Connect → File Copy → Internet Upload within 2h window ──
        const usbEvents = events.filter(e => e.type === 'USB');
        const networkEvents = events.filter(e => e.type === 'NETWORK');
        const fileEvents = events.filter(e => e.type === 'FILE');

        for (const usbEv of usbEvents) {
            const windowEnd = new Date(usbEv.timestamp.getTime() + 2 * 60 * 60 * 1000);
            const filesAfter = fileEvents.filter(
                e => e.timestamp > usbEv.timestamp && e.timestamp <= windowEnd,
            );
            const uploadsAfter = networkEvents.filter(
                e =>
                    e.timestamp > usbEv.timestamp &&
                    e.timestamp <= windowEnd &&
                    (e.targetObject?.includes('upload') ||
                        e.targetObject?.includes('mega') ||
                        e.targetObject?.includes('dropbox') ||
                        e.description?.toLowerCase().includes('upload')),
            );

            if (filesAfter.length > 0 && uploadsAfter.length > 0) {
                detectedEvents.push({
                    title: 'Potential Data Exfiltration via USB',
                    description: `USB device connected at ${usbEv.timestamp.toISOString()}, followed by ${filesAfter.length} file access(es) and ${uploadsAfter.length} network upload(s) within 2 hours. This pattern is characteristic of data exfiltration.`,
                    severity: 'CRITICAL',
                    relatedEventIds: [
                        usbEv.id,
                        ...filesAfter.slice(0, 5).map(e => e.id),
                        ...uploadsAfter.slice(0, 5).map(e => e.id),
                    ],
                });
            }
        }

        // ── Rule 2: Mass File Deletion (>20 file events) → Archive Creation within 30 min ──
        const deletionEvents = fileEvents.filter(e =>
            e.description?.toLowerCase().includes('delet') ||
            e.description?.toLowerCase().includes('remov'),
        );

        if (deletionEvents.length >= 20) {
            const firstDeletion = deletionEvents[0];
            const lastDeletion = deletionEvents[deletionEvents.length - 1];
            const windowEnd = new Date(lastDeletion.timestamp.getTime() + 30 * 60 * 1000);

            const archiveEvents = fileEvents.filter(
                e =>
                    e.timestamp >= firstDeletion.timestamp &&
                    e.timestamp <= windowEnd &&
                    (e.targetObject?.match(/\.(zip|rar|7z|tar|gz)$/i) ||
                        e.description?.toLowerCase().includes('archiv')),
            );

            if (archiveEvents.length > 0) {
                detectedEvents.push({
                    title: 'Mass File Deletion Followed by Archive Creation',
                    description: `${deletionEvents.length} file deletions detected between ${firstDeletion.timestamp.toISOString()} and ${lastDeletion.timestamp.toISOString()}, followed by archive creation. This may indicate anti-forensic activity.`,
                    severity: 'HIGH',
                    relatedEventIds: [
                        ...deletionEvents.slice(0, 10).map(e => e.id),
                        ...archiveEvents.map(e => e.id),
                    ],
                });
            }
        }

        // ── Rule 3: Rapid Login Failures (>5 auth events within 60s) ──
        const authEvents = events.filter(e => e.type === 'AUTHENTICATION');
        for (let i = 0; i < authEvents.length - 5; i++) {
            const windowStart = authEvents[i].timestamp;
            const windowEnd = new Date(windowStart.getTime() + 60 * 1000);
            const burst = authEvents.filter(
                e => e.timestamp >= windowStart && e.timestamp <= windowEnd,
            );
            if (burst.length >= 5) {
                detectedEvents.push({
                    title: 'Rapid Authentication Attempts Detected',
                    description: `${burst.length} authentication events detected within 60 seconds starting at ${windowStart.toISOString()}. This may indicate a brute force or credential stuffing attack.`,
                    severity: 'HIGH',
                    relatedEventIds: burst.map(e => e.id),
                });
                break; // Only report once per burst cluster
            }
        }

        // ── Rule 4: Suspicious Login from Audit Logs (repeated failed logins) ──
        const failedLogins = auditLogs.filter(
            l => l.action === 'USER_FAILED_LOGIN',
        );
        if (failedLogins.length >= 10) {
            detectedEvents.push({
                title: 'Excessive Failed Login Attempts',
                description: `${failedLogins.length} failed login attempts recorded for this case's investigators. This may indicate unauthorized access attempts or compromised accounts.`,
                severity: 'MEDIUM',
                relatedEventIds: [],
            });
        }

        // ── Rule 5: Privilege Escalation Pattern — registry Run key modification ──
        const registryEvents = events.filter(e => e.type === 'REGISTRY');
        const runkeyEvents = registryEvents.filter(
            e =>
                e.targetObject?.toLowerCase().includes('\\run') ||
                e.targetObject?.toLowerCase().includes('\\runonce'),
        );
        if (runkeyEvents.length > 0) {
            detectedEvents.push({
                title: 'Persistence Mechanism Detected (Registry Run Key)',
                description: `${runkeyEvents.length} modification(s) to Windows startup registry key(s) detected. Attackers commonly use Run/RunOnce keys for persistence.`,
                severity: 'HIGH',
                relatedEventIds: runkeyEvents.map(e => e.id),
            });
        }

        // Persist deduplicated findings
        let created = 0;
        for (const finding of detectedEvents) {
            await this.prisma.suspiciousEvent.create({
                data: {
                    id: uuidv4(),
                    caseId,
                    title: finding.title,
                    description: finding.description,
                    severity: finding.severity,
                    relatedEventIds: finding.relatedEventIds,
                },
            });
            created++;
        }

        this.logger.log(`Detection complete: ${created} suspicious events found`);
        return { detected: created };
    }

    async getSuspiciousEvents(caseId: string) {
        return this.prisma.suspiciousEvent.findMany({
            where: { caseId },
            orderBy: { createdAt: 'desc' },
        });
    }
}

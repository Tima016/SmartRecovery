import { PrismaClient, UserRole, CaseStatus, CasePriority, CaseClassification, AuditAction } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function computeHash(fields: { prevHash: string | null; entityId: string; action: string; userId: string; ts: Date }) {
    const data = [fields.prevHash ?? 'GENESIS', fields.entityId, fields.action, fields.userId, fields.ts.toISOString()].join('|');
    return crypto.createHash('sha256').update(data).digest('hex');
}

async function main() {
    console.log('🌱 Seeding DFIP database...');

    await prisma.auditLog.deleteMany();
    await prisma.timelineEvent.deleteMany();
    await prisma.artifact.deleteMany();
    await prisma.chainOfCustody.deleteMany();
    await prisma.evidence.deleteMany();
    await prisma.imagingJob.deleteMany();
    await prisma.report.deleteMany();
    await prisma.caseMember.deleteMany();
    await prisma.case.deleteMany();
    await prisma.user.deleteMany();

    // ─── Users ────────────────────────────────────────────────────────
    const ROUNDS = 12;
    const [adminId, investigatorId, analystId, auditorId] = [uuidv4(), uuidv4(), uuidv4(), uuidv4()];

    const users = await Promise.all([
        prisma.user.create({
            data: {
                id: adminId,
                email: 'admin@forensics.io',
                passwordHash: await bcrypt.hash('Admin@123456', ROUNDS),
                firstName: 'Sarah',
                lastName: 'Connor',
                role: UserRole.ADMIN,
                isActive: true,
            },
        }),
        prisma.user.create({
            data: {
                id: investigatorId,
                email: 'investigator@forensics.io',
                passwordHash: await bcrypt.hash('Invest@123456', ROUNDS),
                firstName: 'John',
                lastName: 'Reese',
                role: UserRole.INVESTIGATOR,
                isActive: true,
            },
        }),
        prisma.user.create({
            data: {
                id: analystId,
                email: 'analyst@forensics.io',
                passwordHash: await bcrypt.hash('Analyst@123456', ROUNDS),
                firstName: 'Samantha',
                lastName: 'Shaw',
                role: UserRole.ANALYST,
                isActive: true,
            },
        }),
        prisma.user.create({
            data: {
                id: auditorId,
                email: 'auditor@forensics.io',
                passwordHash: await bcrypt.hash('Auditor@123456', ROUNDS),
                firstName: 'Harold',
                lastName: 'Finch',
                role: UserRole.AUDITOR,
                isActive: true,
            },
        }),
    ]);
    console.log(`✅ Created ${users.length} users`);

    // ─── Cases ────────────────────────────────────────────────────────
    const case1Id = uuidv4();
    const case2Id = uuidv4();

    const [case1, case2] = await Promise.all([
        prisma.case.create({
            data: {
                id: case1Id,
                caseNumber: 'DFIP-2024-000001',
                title: 'Corporate Data Exfiltration — TechCorp Inc.',
                description: 'Suspected insider threat exfiltrating proprietary source code and customer database to external cloud storage.',
                status: CaseStatus.READY,
                priority: CasePriority.CRITICAL,
                classification: CaseClassification.CONFIDENTIAL,
                tags: ['insider-threat', 'data-exfiltration', 'ransomware'],
                createdById: adminId,
                assignedToId: investigatorId,
            },
        }),
        prisma.case.create({
            data: {
                id: case2Id,
                caseNumber: 'DFIP-2024-000002',
                title: 'Ransomware Incident — Healthcare Network',
                description: 'Ransomware attack on hospital network affecting patient record systems.',
                status: CaseStatus.ANALYZING,
                priority: CasePriority.HIGH,
                classification: CaseClassification.SECRET,
                tags: ['ransomware', 'healthcare', 'encryption'],
                createdById: investigatorId,
                assignedToId: investigatorId,
            },
        }),
    ]);
    console.log('✅ Created 2 cases');

    // ─── Case Members ─────────────────────────────────────────────────
    await prisma.caseMember.createMany({
        data: [
            { id: uuidv4(), caseId: case1Id, userId: analystId, permissions: ['READ', 'WRITE'] },
            { id: uuidv4(), caseId: case1Id, userId: auditorId, permissions: ['READ'] },
            { id: uuidv4(), caseId: case2Id, userId: analystId, permissions: ['READ'] },
        ],
    });
    console.log('✅ Created case members');

    // ─── Evidence ─────────────────────────────────────────────────────
    const evidence1Id = uuidv4();
    const evidence2Id = uuidv4();

    const fakeContent1 = Buffer.from('Fake evidence: Chrome History SQLite database with exfiltration URLs', 'utf8');
    const fakeContent2 = Buffer.from('Fake evidence: Windows Event Log Security.evtx with suspicious process creation events', 'utf8');

    const computeFileHashes = (buf: Buffer) => ({
        md5: crypto.createHash('md5').update(buf).digest('hex'),
        sha1: crypto.createHash('sha1').update(buf).digest('hex'),
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        sha512: crypto.createHash('sha512').update(buf).digest('hex'),
    });

    await Promise.all([
        prisma.evidence.create({
            data: {
                id: evidence1Id,
                caseId: case1Id,
                originalFilename: 'Chrome_History.db',
                mimeType: 'application/octet-stream',
                sizeBytes: BigInt(fakeContent1.length),
                description: 'Chrome browser history database extracted from suspect workstation',
                storageBucket: 'dfip-evidence',
                storageKey: `cases/${case1Id}/evidence/${evidence1Id}/original`,
                encryptedKey: `cases/${case1Id}/evidence/${evidence1Id}/encrypted`,
                ivHex: crypto.randomBytes(16).toString('hex'),
                authTagHex: crypto.randomBytes(16).toString('hex'),
                ...computeFileHashes(fakeContent1),
                status: 'VERIFIED',
                verifiedAt: new Date(),
                verifiedById: investigatorId,
                uploadedById: investigatorId,
            },
        }),
        prisma.evidence.create({
            data: {
                id: evidence2Id,
                caseId: case1Id,
                originalFilename: 'Security.evtx',
                mimeType: 'application/octet-stream',
                sizeBytes: BigInt(fakeContent2.length),
                description: 'Windows Security Event Log from suspect workstation',
                storageBucket: 'dfip-evidence',
                storageKey: `cases/${case1Id}/evidence/${evidence2Id}/original`,
                encryptedKey: `cases/${case1Id}/evidence/${evidence2Id}/encrypted`,
                ivHex: crypto.randomBytes(16).toString('hex'),
                authTagHex: crypto.randomBytes(16).toString('hex'),
                ...computeFileHashes(fakeContent2),
                status: 'PENDING',
                uploadedById: analystId,
            },
        }),
    ]);
    console.log('✅ Created 2 evidence items');

    // ─── Chain of Custody ─────────────────────────────────────────────
    const custodyEntries = [
        { evidenceId: evidence1Id, action: 'EVIDENCE_UPLOADED', userId: investigatorId },
        { evidenceId: evidence1Id, action: 'EVIDENCE_VERIFIED', userId: investigatorId },
        { evidenceId: evidence2Id, action: 'EVIDENCE_UPLOADED', userId: analystId },
    ];

    const chainByEvidence: Record<string, string | null> = {};
    for (const entry of custodyEntries) {
        const prev = chainByEvidence[entry.evidenceId] ?? null;
        const now = new Date();
        const hash = computeHash({ prevHash: prev, entityId: entry.evidenceId, action: entry.action, userId: entry.userId, ts: now });
        await prisma.chainOfCustody.create({
            data: {
                id: uuidv4(),
                evidenceId: entry.evidenceId,
                action: entry.action,
                performedById: entry.userId,
                performedAt: now,
                prevHash: prev,
                recordHash: hash,
            },
        });
        chainByEvidence[entry.evidenceId] = hash;
    }
    console.log('✅ Created chain of custody entries');

    // ─── Timeline Events ──────────────────────────────────────────────
    const timelineData = [
        { type: 'NETWORK', ts: '2024-02-15T09:23:11Z', desc: 'Browser visit: Pastebin (suspicious paste URL)', source: 'Chrome History', target: 'https://pastebin.com/abc123', score: 75, actor: 'JohnDoe' },
        { type: 'USB', ts: '2024-02-15T09:15:00Z', desc: 'USB device connected: SanDisk Ultra', source: 'Registry USBSTOR', target: 'E:', score: 60, actor: 'JohnDoe' },
        { type: 'NETWORK', ts: '2024-02-15T09:45:02Z', desc: 'Browser visit: MEGA.NZ file upload', source: 'Chrome History', target: 'https://mega.nz/file/secureupload', score: 95, actor: 'JohnDoe' },
        { type: 'PROCESS', ts: '2024-02-15T09:05:00Z', desc: 'Process created: cmd.exe net use command', source: 'Windows Event Log', target: 'cmd.exe /c net use \\\\192.168.1.200\\IPC$', score: 80, actor: 'DOMAIN\\JohnDoe' },
        { type: 'REGISTRY', ts: '2024-02-15T08:30:00Z', desc: 'Persistence via registry Run key — svchost32.exe', source: 'Registry Hive', target: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', score: 92, actor: 'JohnDoe' },
        { type: 'AUTHENTICATION', ts: '2024-02-15T08:55:00Z', desc: 'Successful network logon', source: 'Windows Event Log', target: '192.168.1.150', score: 30, actor: 'DOMAIN\\JohnDoe' },
    ];

    await prisma.timelineEvent.createMany({
        data: timelineData.map((e) => ({
            id: uuidv4(),
            caseId: case1Id,
            type: e.type as any,
            timestamp: new Date(e.ts),
            description: e.desc,
            source: e.source,
            actor: e.actor,
            targetObject: e.target,
            correlationScore: e.score,
            createdById: investigatorId,
        })),
    });
    console.log(`✅ Created ${timelineData.length} timeline events`);

    // ─── Audit Logs ───────────────────────────────────────────────────
    const auditActions = [
        { userId: adminId, action: AuditAction.USER_REGISTER, entityType: 'User', entityId: adminId },
        { userId: investigatorId, action: AuditAction.USER_REGISTER, entityType: 'User', entityId: investigatorId },
        { userId: adminId, action: AuditAction.USER_LOGIN, entityType: 'User', entityId: adminId },
        { userId: investigatorId, action: AuditAction.CASE_CREATE, entityType: 'Case', entityId: case1Id },
        { userId: investigatorId, action: AuditAction.EVIDENCE_UPLOAD, entityType: 'Evidence', entityId: evidence1Id },
    ];

    let prevHash: string | null = null;
    for (const entry of auditActions) {
        const now = new Date();
        const hash = computeHash({ prevHash, entityId: entry.entityId, action: entry.action, userId: entry.userId, ts: now });
        await prisma.auditLog.create({
            data: {
                id: uuidv4(),
                userId: entry.userId,
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId,
                prevHash,
                recordHash: hash,
                createdAt: now,
            },
        });
        prevHash = hash;
    }
    console.log(`✅ Created ${auditActions.length} audit log entries`);

    console.log('\n🎉 Seed complete!');
    console.log('\nLogin credentials:');
    console.log('  Admin:        admin@forensics.io / Admin@123456');
    console.log('  Investigator: investigator@forensics.io / Invest@123456');
    console.log('  Analyst:      analyst@forensics.io / Analyst@123456');
    console.log('  Auditor:      auditor@forensics.io / Auditor@123456');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

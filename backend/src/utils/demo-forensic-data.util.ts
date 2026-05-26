import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

type DemoFile = {
    path: string;
    name: string;
    parentPath: string;
    fileType: string;
    sizeBytes: number;
    isDeleted?: boolean;
    previewText?: string;
    previewBase64?: string;
};

const day = 24 * 60 * 60 * 1000;

function at(daysAgo: number, hour = 10, minute = 0): Date {
    const d = new Date();
    d.setUTCHours(hour, minute, 0, 0);
    return new Date(d.getTime() - daysAgo * day);
}

function sha256(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

const transparentPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l1qZ1wAAAABJRU5ErkJggg==';

const demoFiles: DemoFile[] = [
    {
        path: '/Users/alisher/Documents/case_overview.txt',
        parentPath: '/Users/alisher/Documents',
        name: 'case_overview.txt',
        fileType: 'text/plain',
        sizeBytes: 1180,
        previewText:
            'DFIP demo evidence notes\n\n' +
            'Observed activity:\n' +
            '- Chrome visits to cloud storage and webmail.\n' +
            '- USB mass-storage device mounted as E:.\n' +
            '- Archive created shortly before USB connection.\n' +
            '- Suspicious outbound connection to 203.0.113.77:4444.\n',
    },
    {
        path: '/Users/alisher/Documents/financial_export.csv',
        parentPath: '/Users/alisher/Documents',
        name: 'financial_export.csv',
        fileType: 'text/csv',
        sizeBytes: 936,
        previewText:
            'timestamp,account,amount,currency,note\n' +
            '2026-04-21T09:12:00Z,ACC-7781,14200,USD,quarterly export\n' +
            '2026-04-21T09:14:00Z,ACC-9982,8800,USD,manual export\n',
    },
    {
        path: '/Users/alisher/Documents/suspicious_contract.pdf',
        parentPath: '/Users/alisher/Documents',
        name: 'suspicious_contract.pdf',
        fileType: 'application/pdf',
        sizeBytes: 284672,
        previewText:
            '%PDF-1.4\n' +
            'Demo PDF placeholder for courtroom report preview.\n' +
            'Finding: document was staged before archive creation and USB copy.\n',
    },
    {
        path: '/Users/alisher/Pictures/id_card.png',
        parentPath: '/Users/alisher/Pictures',
        name: 'id_card.png',
        fileType: 'image/png',
        sizeBytes: 5120,
        previewBase64: transparentPngBase64,
    },
    {
        path: '/Users/alisher/Downloads/archive_backup.zip',
        parentPath: '/Users/alisher/Downloads',
        name: 'archive_backup.zip',
        fileType: 'application/zip',
        sizeBytes: 7340032,
        previewText:
            'PK demo archive preview\n' +
            'Contains: financial_export.csv, suspicious_contract.pdf, browser_cache.sqlite\n',
    },
    {
        path: '/Windows/System32/winevt/Logs/Security.evtx',
        parentPath: '/Windows/System32/winevt/Logs',
        name: 'Security.evtx',
        fileType: 'application/octet-stream',
        sizeBytes: 8388608,
        previewText:
            'EVTX demo extract\n' +
            '4624 Logon success for ALISHER-PC\\alisher\n' +
            '4688 Process created: powershell.exe -ExecutionPolicy Bypass\n',
    },
    {
        path: '/Windows/Prefetch/CHROME.EXE-9F3A2B1C.pf',
        parentPath: '/Windows/Prefetch',
        name: 'CHROME.EXE-9F3A2B1C.pf',
        fileType: 'application/octet-stream',
        sizeBytes: 24576,
        previewText: 'Prefetch demo: CHROME.EXE run count 18, last run aligned with browser history.',
    },
    {
        path: '/$Recycle.Bin/S-1-5-21/deleted-passwords.txt',
        parentPath: '/$Recycle.Bin/S-1-5-21',
        name: 'deleted-passwords.txt',
        fileType: 'text/plain',
        sizeBytes: 420,
        isDeleted: true,
        previewText:
            'Recovered deleted note\n\n' +
            'vpn: redacted\n' +
            'cloud-export: redacted\n' +
            'This file is intentionally static demo content.\n',
    },
];

const demoDirs = [
    ['Users', '/Users', '/'],
    ['alisher', '/Users/alisher', '/Users'],
    ['Documents', '/Users/alisher/Documents', '/Users/alisher'],
    ['Downloads', '/Users/alisher/Downloads', '/Users/alisher'],
    ['Pictures', '/Users/alisher/Pictures', '/Users/alisher'],
    ['Windows', '/Windows', '/'],
    ['System32', '/Windows/System32', '/Windows'],
    ['winevt', '/Windows/System32/winevt', '/Windows/System32'],
    ['Logs', '/Windows/System32/winevt/Logs', '/Windows/System32/winevt'],
    ['Prefetch', '/Windows/Prefetch', '/Windows'],
    ['$Recycle.Bin', '/$Recycle.Bin', '/'],
    ['S-1-5-21', '/$Recycle.Bin/S-1-5-21', '/$Recycle.Bin'],
] as const;

export async function ensureDemoForensicFindings(
    prisma: PrismaClient,
    caseId: string,
    evidenceId: string,
    totalSizeBytes: bigint,
    createdById: string,
): Promise<{ created: boolean; files: number; artifacts: number; events: number }> {
    const existing = await (prisma as any).fileSystemEntry.findFirst({
        where: { caseId, evidenceId, name: 'case_overview.txt' },
        select: { id: true },
    });
    if (existing) {
        const [files, artifacts, events] = await Promise.all([
            (prisma as any).fileSystemEntry.count({ where: { caseId, evidenceId } }),
            prisma.artifact.count({ where: { caseId, evidenceId } }),
            prisma.timelineEvent.count({ where: { caseId } }),
        ]);
        return { created: false, files, artifacts, events };
    }

    await prisma.$transaction(async (tx) => {
        await (tx as any).diskImageInfo.upsert({
            where: { evidenceId },
            update: {
                imageFormat: 'IMG',
                totalSizeBytes,
                sectorSize: 512,
                totalSectors: totalSizeBytes / 512n,
                partitionScheme: 'MBR',
                partitions: [
                    {
                        index: 0,
                        startLBA: 2048,
                        sizeLBA: Number(totalSizeBytes / 512n - 2048n),
                        startByte: 2048 * 512,
                        sizeBytes: totalSizeBytes.toString(),
                        typeName: 'NTFS Demo Partition',
                        fsType: 'NTFS',
                        bootable: true,
                    },
                ],
                fileSystemType: 'NTFS',
                totalFiles: demoFiles.length + demoDirs.length,
                deletedFiles: demoFiles.filter((f) => f.isDeleted).length,
            },
            create: {
                id: uuidv4(),
                caseId,
                evidenceId,
                imageFormat: 'IMG',
                totalSizeBytes,
                sectorSize: 512,
                totalSectors: totalSizeBytes / 512n,
                partitionScheme: 'MBR',
                partitions: [
                    {
                        index: 0,
                        startLBA: 2048,
                        sizeLBA: Number(totalSizeBytes / 512n - 2048n),
                        startByte: 2048 * 512,
                        sizeBytes: totalSizeBytes.toString(),
                        typeName: 'NTFS Demo Partition',
                        fsType: 'NTFS',
                        bootable: true,
                    },
                ],
                fileSystemType: 'NTFS',
                totalFiles: demoFiles.length + demoDirs.length,
                deletedFiles: demoFiles.filter((f) => f.isDeleted).length,
            },
        });

        for (const [name, path, parentPath] of demoDirs) {
            await (tx as any).fileSystemEntry.create({
                data: {
                    id: uuidv4(),
                    caseId,
                    evidenceId,
                    path,
                    name,
                    isDirectory: true,
                    isDeleted: false,
                    sizeBytes: 0n,
                    createdAt: at(16),
                    modifiedAt: at(3),
                    accessedAt: at(1),
                    mftChangedAt: at(3),
                    parentPath,
                    permissions: null,
                    uid: null,
                    gid: null,
                    inode: null,
                    fileType: 'directory',
                    fsType: 'NTFS',
                    attributes: { demoScenario: true },
                },
            });
        }

        demoFiles.forEach((file, index) => {
            void index;
        });

        for (let index = 0; index < demoFiles.length; index++) {
            const file = demoFiles[index];
            await (tx as any).fileSystemEntry.create({
                data: {
                    id: uuidv4(),
                    caseId,
                    evidenceId,
                    path: file.path,
                    name: file.name,
                    isDirectory: false,
                    isDeleted: Boolean(file.isDeleted),
                    sizeBytes: BigInt(file.sizeBytes),
                    createdAt: at(12 - (index % 5), 8 + index, 10),
                    modifiedAt: at(3 - (index % 3), 10 + index, 20),
                    accessedAt: at(index % 2, 11 + index, 5),
                    mftChangedAt: at(2, 12 + index, 15),
                    parentPath: file.parentPath,
                    permissions: null,
                    uid: null,
                    gid: null,
                    inode: 4096 + index,
                    fileType: file.fileType,
                    fsType: 'NTFS',
                    attributes: {
                        demoScenario: true,
                        previewText: file.previewText,
                        previewBase64: file.previewBase64,
                    },
                },
            });
        }

        const browserEntries = [
            {
                url: 'https://mail.example.org/inbox',
                title: 'Example Mail Inbox',
                visitTime: at(2, 9, 11).toISOString(),
                visitCount: 7,
                browser: 'Chrome',
                profilePath: 'C:\\Users\\alisher\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\History',
            },
            {
                url: 'https://cloud.example.org/share/archive_backup.zip',
                title: 'Cloud Share - archive_backup.zip',
                visitTime: at(2, 10, 4).toISOString(),
                visitCount: 3,
                browser: 'Chrome',
                profilePath: 'C:\\Users\\alisher\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\History',
            },
            {
                url: 'https://mega.example.net/export',
                title: 'Large File Export Portal',
                visitTime: at(2, 10, 18).toISOString(),
                visitCount: 2,
                browser: 'Edge',
                profilePath: 'C:\\Users\\alisher\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\History',
            },
        ];

        const usbEntries = [
            {
                deviceId: 'USBSTOR\\Disk&Ven_SanDisk&Prod_Ultra&Rev_1.00\\4C530001230912115204',
                vendorId: 'SanDisk',
                productId: 'Ultra',
                serialNumber: '4C530001230912115204',
                deviceDescription: 'SanDisk Ultra USB Device',
                driveLetter: 'E:',
                firstConnected: at(2, 10, 41).toISOString(),
                lastConnected: at(2, 11, 23).toISOString(),
            },
        ];

        const registryEntries = [
            {
                hive: 'NTUSER.DAT',
                key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU',
                valueName: 'a',
                valueData: 'powershell.exe -ExecutionPolicy Bypass',
                valueType: 'REG_SZ',
                lastModified: at(2, 10, 32).toISOString(),
            },
            {
                hive: 'SYSTEM',
                key: 'ControlSet001\\Enum\\USBSTOR\\Disk&Ven_SanDisk&Prod_Ultra',
                valueName: 'FriendlyName',
                valueData: 'SanDisk Ultra USB Device',
                valueType: 'REG_SZ',
                lastModified: at(2, 10, 41).toISOString(),
            },
        ];

        const eventLogs = [
            {
                eventId: 4624,
                source: 'Microsoft-Windows-Security-Auditing',
                channel: 'Security',
                level: 'INFO',
                timestamp: at(2, 9, 2).toISOString(),
                description: 'Successful logon for ALISHER-PC\\alisher',
                user: 'alisher',
                process: 'winlogon.exe',
                commandLine: null,
                ip: null,
            },
            {
                eventId: 4688,
                source: 'Microsoft-Windows-Security-Auditing',
                channel: 'Security',
                level: 'WARN',
                timestamp: at(2, 10, 33).toISOString(),
                description: 'Process created: powershell.exe -ExecutionPolicy Bypass',
                user: 'alisher',
                process: 'powershell.exe',
                commandLine: 'powershell.exe -ExecutionPolicy Bypass -File collect.ps1',
                ip: null,
            },
            {
                eventId: 7045,
                source: 'Service Control Manager',
                channel: 'System',
                level: 'WARN',
                timestamp: at(2, 10, 36).toISOString(),
                description: 'Temporary collection service installed',
                user: 'SYSTEM',
                process: 'services.exe',
                commandLine: 'C:\\Users\\alisher\\Downloads\\collector.exe',
                ip: null,
            },
        ];

        const prefetchEntries = [
            {
                filename: 'CHROME.EXE',
                path: 'C:\\Windows\\Prefetch\\CHROME.EXE-9F3A2B1C.pf',
                lastRun: at(2, 10, 18).toISOString(),
                runCount: 18,
                hash: '9F3A2B1C',
            },
            {
                filename: 'POWERSHELL.EXE',
                path: 'C:\\Windows\\Prefetch\\POWERSHELL.EXE-25AA01E2.pf',
                lastRun: at(2, 10, 33).toISOString(),
                runCount: 4,
                hash: '25AA01E2',
            },
        ];

        const networkEntries = [
            {
                protocol: 'TCP-HIGH',
                srcIp: '192.168.1.42',
                srcPort: 51422,
                dstIp: '203.0.113.77',
                dstPort: 4444,
                timestamp: at(2, 10, 39).toISOString(),
                note: 'Potentially suspicious outbound connection',
                suspicious: true,
            },
            {
                protocol: 'HTTPS',
                srcIp: '192.168.1.42',
                srcPort: 51428,
                dstIp: '198.51.100.20',
                dstPort: 443,
                timestamp: at(2, 10, 44).toISOString(),
                note: 'Cloud upload session',
                suspicious: false,
            },
        ];

        const artifactPayloads = [
            ['BROWSER_HISTORY', 'Chrome/Edge History', { entries: browserEntries }, browserEntries.length],
            ['USB_LOG', 'USBSTOR Registry', { entries: usbEntries }, usbEntries.length],
            ['REGISTRY_HIVE', 'Windows Registry Hive', {
                entries: registryEntries,
                installedApps: [
                    {
                        name: '7-Zip',
                        version: '24.01',
                        publisher: 'Igor Pavlov',
                        installDate: at(6).toISOString(),
                        installPath: 'C:\\Program Files\\7-Zip\\',
                    },
                ],
                userAccounts: [
                    {
                        username: 'alisher',
                        sid: 'S-1-5-21-2384729384-1092384711-1204981234-1001',
                        fullName: 'Alisher Demo',
                        lastLogin: at(2, 9, 2).toISOString(),
                        accountType: 'Local',
                        isDisabled: false,
                    },
                ],
            }, registryEntries.length + 2],
            ['EVENT_LOG', 'Windows Security/System EVTX', { entries: eventLogs }, eventLogs.length],
            ['PREFETCH', 'Windows Prefetch', { entries: prefetchEntries }, prefetchEntries.length],
            ['NETWORK_CAPTURE', 'Network Connection Scan', { entries: networkEntries }, networkEntries.length],
        ] as const;

        const artifactIds: Record<string, string> = {};
        for (const [type, source, data, count] of artifactPayloads) {
            const id = uuidv4();
            artifactIds[type] = id;
            await tx.artifact.create({
                data: {
                    id,
                    caseId,
                    evidenceId,
                    type: type as any,
                    source,
                    data: data as any,
                    count,
                    extractedById: createdById,
                    extractedAt: new Date(),
                },
            });
        }

        const timeline = [
            ['AUTHENTICATION', at(2, 9, 2), 'Successful logon for ALISHER-PC\\alisher', 'Security.evtx', 'alisher', 'ALISHER-PC', 20],
            ['NETWORK', at(2, 10, 4), 'Browser opened cloud share archive_backup.zip', 'Chrome History', 'alisher', 'https://cloud.example.org/share/archive_backup.zip', 45],
            ['PROCESS', at(2, 10, 33), 'PowerShell collection script executed', 'Security.evtx', 'alisher', 'powershell.exe -ExecutionPolicy Bypass', 82],
            ['REGISTRY', at(2, 10, 34), 'RunMRU updated with PowerShell command', 'NTUSER.DAT', 'alisher', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU', 78],
            ['NETWORK', at(2, 10, 39), 'Suspicious outbound TCP connection to 203.0.113.77:4444', 'Network Scan', 'powershell.exe', '203.0.113.77:4444', 94],
            ['USB', at(2, 10, 41), 'USB Device Connected: SanDisk Ultra USB Device', 'USBSTOR Registry', 'SYSTEM', 'E:', 70],
            ['FILE', at(2, 10, 42), 'Archive staged for removable media copy', 'File System Parser', 'alisher', '/Users/alisher/Downloads/archive_backup.zip', 74],
            ['FILE', at(2, 11, 18), 'Deleted credentials note recovered from recycle bin', 'File System Parser', 'alisher', '/$Recycle.Bin/S-1-5-21/deleted-passwords.txt', 88],
        ] as const;

        for (const [type, timestamp, description, source, actor, targetObject, score] of timeline) {
            await tx.timelineEvent.create({
                data: {
                    id: uuidv4(),
                    caseId,
                    type: type as any,
                    timestamp,
                    description,
                    source,
                    actor,
                    targetObject,
                    artifactId: type === 'USB' ? artifactIds.USB_LOG : undefined,
                    correlationScore: score,
                    tags: score >= 80 ? ['high-risk', 'demo'] : ['demo'],
                    metadata: { demoScenario: true } as any,
                    createdById,
                },
            });
        }

        for (let index = 0; index < demoFiles.length; index++) {
            const file = demoFiles[index];
            const offsetStart = BigInt(1_048_576 + index * 6_553_600);
            const offsetEnd = offsetStart + BigInt(file.sizeBytes);
            await tx.recoveredFile.create({
                data: {
                    id: uuidv4(),
                    caseId,
                    evidenceId,
                    filename: file.name,
                    mimeType: file.fileType,
                    sizeBytes: BigInt(file.sizeBytes),
                    method: file.isDeleted ? 'METADATA' as any : 'CARVING' as any,
                    status: 'COMPLETED' as any,
                    confidence: file.isDeleted ? 92 : 86 + (index % 4) * 3,
                    offsetStart,
                    offsetEnd,
                    sha256: sha256(file.previewText ?? file.previewBase64 ?? file.name),
                    md5: crypto.createHash('md5').update(file.name).digest('hex'),
                    entropyScore: 2.1 + (index % 6) * 0.82,
                    headerSignature: file.fileType.includes('pdf') ? '25504446' : undefined,
                    footerSignature: file.fileType.includes('pdf') ? '2525454f46' : undefined,
                    headerMatchScore: 25,
                    footerMatchScore: file.fileType.includes('pdf') ? 16 : 8,
                    entropyRangeScore: 18,
                    metadataScore: 24,
                    hasValidHeader: true,
                    hasValidFooter: !file.fileType.includes('octet-stream'),
                    footerDistanceOk: true,
                    byteContinuityOk: true,
                    algorithmVersion: 'demo-1.0.0',
                    scoringModelVersion: 'demo-1.0.0',
                    evidenceHash: null,
                },
            });

            await tx.fragment.create({
                data: {
                    id: uuidv4(),
                    caseId,
                    evidenceId,
                    offsetStart,
                    offsetEnd,
                    sizeBytes: BigInt(file.sizeBytes),
                    entropyScore: 2.1 + (index % 6) * 0.82,
                    byteContinuity: 0.72 + (index % 3) * 0.08,
                    headerHint: file.fileType.includes('png') ? 'PNG' : file.fileType.includes('pdf') ? 'PDF' : null,
                    status: 'LINKED' as any,
                    linkProbability: 0.62 + (index % 4) * 0.08,
                    fragmentGroup: `demo-group-${Math.floor(index / 2) + 1}`,
                },
            });
        }
    }, { timeout: 30_000 });

    return {
        created: true,
        files: demoFiles.length + demoDirs.length,
        artifacts: 6,
        events: 8,
    };
}

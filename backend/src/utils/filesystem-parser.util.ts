/**
 * File System Parser — Binary Structure Analysis
 *
 * Parses partition tables and file system structures from raw disk image data.
 * Supports:
 *   - MBR (Master Boot Record) partition table
 *   - GPT (GUID Partition Table)
 *   - NTFS (MFT record parsing, $FILE_NAME, $STANDARD_INFORMATION)
 *   - FAT32 (BPB, FAT chains, directory entries, LFN)
 *   - EXT4 (superblock, group descriptors, inode table, directory entries)
 */

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export type FileSystemType = 'NTFS' | 'FAT32' | 'FAT16' | 'EXFAT' | 'EXT4' | 'EXT3' | 'EXT2' | 'UNKNOWN';
export type PartitionScheme = 'MBR' | 'GPT' | 'NONE';

export interface PartitionEntry {
    index: number;
    startLBA: number;
    sizeLBA: number;
    startByte: number;
    sizeBytes: number;
    typeCode: number;
    typeName: string;
    fsType: FileSystemType;
    bootable: boolean;
}

export interface PartitionTable {
    scheme: PartitionScheme;
    sectorSize: number;
    partitions: PartitionEntry[];
}

export interface FileSystemEntry {
    path: string;
    name: string;
    isDirectory: boolean;
    isDeleted: boolean;
    sizeBytes: number;
    createdAt: Date | null;
    modifiedAt: Date | null;
    accessedAt: Date | null;
    mftChangedAt: Date | null;  // NTFS-specific
    parentPath: string;
    permissions: string | null; // EXT4 mode bits
    uid: number | null;         // EXT4 UID
    gid: number | null;         // EXT4 GID
    inode: number | null;       // inode number (EXT4/NTFS MFT index)
    fileType: string | null;    // deduced MIME type
    attributes: Record<string, any>;
}

export interface FileSystemInfo {
    type: FileSystemType;
    label: string;
    totalSizeBytes: number;
    freeSizeBytes: number;
    clusterSize: number;
    totalEntries: number;
    deletedEntries: number;
    entries: FileSystemEntry[];
}

// ────────────────────────────────────────────────────────────────────
// MBR Partition Table Parser
// ────────────────────────────────────────────────────────────────────

const MBR_PARTITION_TYPES: Record<number, string> = {
    0x00: 'Empty',
    0x01: 'FAT12',
    0x04: 'FAT16 <32M',
    0x05: 'Extended',
    0x06: 'FAT16',
    0x07: 'NTFS/HPFS/exFAT',
    0x0B: 'FAT32 CHS',
    0x0C: 'FAT32 LBA',
    0x0E: 'FAT16 LBA',
    0x0F: 'Extended LBA',
    0x11: 'Hidden FAT12',
    0x14: 'Hidden FAT16 <32M',
    0x16: 'Hidden FAT16',
    0x17: 'Hidden NTFS',
    0x1B: 'Hidden FAT32',
    0x1C: 'Hidden FAT32 LBA',
    0x27: 'WinRecovery',
    0x82: 'Linux swap',
    0x83: 'Linux (EXT2/3/4)',
    0x85: 'Linux extended',
    0x8E: 'Linux LVM',
    0xEE: 'GPT Protective MBR',
    0xEF: 'EFI System',
    0xFD: 'Linux RAID',
};

function detectFsType(typeCode: number): FileSystemType {
    if (typeCode === 0x07) return 'NTFS'; // Could also be exFAT
    if ([0x0B, 0x0C, 0x1B, 0x1C].includes(typeCode)) return 'FAT32';
    if ([0x04, 0x06, 0x0E, 0x14, 0x16, 0x1E].includes(typeCode)) return 'FAT16';
    if (typeCode === 0x83) return 'EXT4'; // Could be EXT2/3
    return 'UNKNOWN';
}

export function parseMBR(buffer: Buffer, sectorSize = 512): PartitionTable | null {
    if (buffer.length < 512) return null;

    // Check MBR signature
    const sig = buffer.readUInt16LE(510);
    if (sig !== 0xAA55) return null;

    const partitions: PartitionEntry[] = [];

    // 4 primary partition entries at offset 0x1BE, each 16 bytes
    for (let i = 0; i < 4; i++) {
        const entryOffset = 0x1BE + (i * 16);
        const status = buffer.readUInt8(entryOffset);
        const typeCode = buffer.readUInt8(entryOffset + 4);
        const startLBA = buffer.readUInt32LE(entryOffset + 8);
        const sizeLBA = buffer.readUInt32LE(entryOffset + 12);

        if (typeCode === 0x00 || sizeLBA === 0) continue;

        // If GPT protective MBR, return early and let GPT parser handle it
        if (typeCode === 0xEE) {
            return { scheme: 'GPT', sectorSize, partitions: [] };
        }

        partitions.push({
            index: i,
            startLBA,
            sizeLBA,
            startByte: startLBA * sectorSize,
            sizeBytes: sizeLBA * sectorSize,
            typeCode,
            typeName: MBR_PARTITION_TYPES[typeCode] ?? `Unknown (0x${typeCode.toString(16)})`,
            fsType: detectFsType(typeCode),
            bootable: (status & 0x80) !== 0,
        });
    }

    return { scheme: 'MBR', sectorSize, partitions };
}

// ────────────────────────────────────────────────────────────────────
// GPT Parser
// ────────────────────────────────────────────────────────────────────

const GPT_SIGNATURE = Buffer.from('EFI PART');

const GPT_PARTITION_GUID_TYPES: Record<string, { name: string; fs: FileSystemType }> = {
    'EBD0A0A2-B9E5-4433-87C0-68B6B72699C7': { name: 'Microsoft Basic Data', fs: 'NTFS' },
    '0FC63DAF-8483-4772-8E79-3D69D8477DE4': { name: 'Linux Filesystem', fs: 'EXT4' },
    'C12A7328-F81F-11D2-BA4B-00A0C93EC93B': { name: 'EFI System', fs: 'FAT32' },
    'E3C9E316-0B5C-4DB8-817D-F92DF00215AE': { name: 'Microsoft Reserved', fs: 'UNKNOWN' },
};

function readGUID(buffer: Buffer, offset: number): string {
    if (offset + 16 > buffer.length) return '';

    // GUID is mixed-endian: first 3 parts are LE, last 2 are BE
    const p1 = buffer.readUInt32LE(offset).toString(16).padStart(8, '0');
    const p2 = buffer.readUInt16LE(offset + 4).toString(16).padStart(4, '0');
    const p3 = buffer.readUInt16LE(offset + 6).toString(16).padStart(4, '0');
    const p4 = buffer.subarray(offset + 8, offset + 10).toString('hex').padStart(4, '0');
    const p5 = buffer.subarray(offset + 10, offset + 16).toString('hex').padStart(12, '0');

    return `${p1}-${p2}-${p3}-${p4}-${p5}`.toUpperCase();
}

export function parseGPT(buffer: Buffer, sectorSize = 512): PartitionTable | null {
    // GPT header is at LBA 1
    const headerOffset = sectorSize;
    if (buffer.length < headerOffset + 92) return null;

    const sig = buffer.subarray(headerOffset, headerOffset + 8);
    if (!sig.equals(GPT_SIGNATURE)) return null;

    const partEntryStart = Number(buffer.readBigUInt64LE(headerOffset + 72)) * sectorSize;
    const partEntryCount = buffer.readUInt32LE(headerOffset + 80);
    const partEntrySize = buffer.readUInt32LE(headerOffset + 84);

    const partitions: PartitionEntry[] = [];
    const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

    const maxEntries = Math.min(partEntryCount, 128);

    for (let i = 0; i < maxEntries; i++) {
        const entryOffset = partEntryStart + (i * partEntrySize);
        if (entryOffset + partEntrySize > buffer.length) break;

        const typeGUID = readGUID(buffer, entryOffset);
        if (typeGUID === EMPTY_GUID) continue;

        const firstLBA = Number(buffer.readBigUInt64LE(entryOffset + 32));
        const lastLBA = Number(buffer.readBigUInt64LE(entryOffset + 40));
        const sizeLBA = lastLBA - firstLBA + 1;

        const guidInfo = GPT_PARTITION_GUID_TYPES[typeGUID];

        partitions.push({
            index: i,
            startLBA: firstLBA,
            sizeLBA,
            startByte: firstLBA * sectorSize,
            sizeBytes: sizeLBA * sectorSize,
            typeCode: 0,
            typeName: guidInfo?.name ?? `GPT ${typeGUID}`,
            fsType: guidInfo?.fs ?? 'UNKNOWN',
            bootable: false,
        });
    }

    return { scheme: 'GPT', sectorSize, partitions };
}

// ────────────────────────────────────────────────────────────────────
// Partition Table Detection
// ────────────────────────────────────────────────────────────────────

export function parsePartitionTable(buffer: Buffer, sectorSize = 512): PartitionTable {
    // Try MBR first
    const mbr = parseMBR(buffer, sectorSize);

    if (mbr && mbr.scheme === 'GPT') {
        // MBR indicated GPT protective MBR — parse GPT
        const gpt = parseGPT(buffer, sectorSize);
        if (gpt) return gpt;
    }

    if (mbr && mbr.partitions.length > 0) {
        return mbr;
    }

    // No partition table — could be a raw partition image
    // Try to detect filesystem type directly on the buffer
    const fsType = detectFileSystemType(buffer);
    if (fsType !== 'UNKNOWN') {
        return {
            scheme: 'NONE',
            sectorSize,
            partitions: [{
                index: 0,
                startLBA: 0,
                sizeLBA: Math.ceil(buffer.length / sectorSize),
                startByte: 0,
                sizeBytes: buffer.length,
                typeCode: 0,
                typeName: 'Raw Partition',
                fsType,
                bootable: false,
            }],
        };
    }

    return { scheme: 'NONE', sectorSize, partitions: [] };
}

// ────────────────────────────────────────────────────────────────────
// Filesystem Type Detection (from boot sector/superblock)
// ────────────────────────────────────────────────────────────────────

export function detectFileSystemType(buffer: Buffer, offset = 0): FileSystemType {
    if (buffer.length < offset + 1024 + 100) return 'UNKNOWN';

    // NTFS: "NTFS    " at offset 3 of boot sector
    const ntfsMagic = buffer.subarray(offset + 3, offset + 11).toString('ascii');
    if (ntfsMagic === 'NTFS    ') return 'NTFS';

    // exFAT: "EXFAT   " at offset 3
    const exfatMagic = buffer.subarray(offset + 3, offset + 11).toString('ascii');
    if (exfatMagic === 'EXFAT   ') return 'EXFAT';

    // FAT32: Check for FAT32 filesystem type string at offset 82
    const fat32Sig = buffer.subarray(offset + 82, offset + 90).toString('ascii');
    if (fat32Sig.startsWith('FAT32')) return 'FAT32';

    // FAT16: Check at offset 54
    const fat16Sig = buffer.subarray(offset + 54, offset + 62).toString('ascii');
    if (fat16Sig.startsWith('FAT16') || fat16Sig.startsWith('FAT12')) return 'FAT16';

    // EXT2/3/4: magic number 0xEF53 at superblock offset 56 (superblock starts at byte 1024)
    const extMagicOffset = offset + 1024 + 56;
    if (extMagicOffset + 2 <= buffer.length) {
        const extMagic = buffer.readUInt16LE(extMagicOffset);
        if (extMagic === 0xEF53) {
            // Distinguish EXT versions from feature flags
            const featureIncompat = buffer.readUInt32LE(offset + 1024 + 96);
            if (featureIncompat & 0x0040) return 'EXT4'; // EXTENTS feature
            if (featureIncompat & 0x0004) return 'EXT3'; // HAS_JOURNAL
            return 'EXT2';
        }
    }

    return 'UNKNOWN';
}

// ────────────────────────────────────────────────────────────────────
// NTFS Parser
// ────────────────────────────────────────────────────────────────────

/** Windows FILETIME epoch: 1601-01-01 */
function filetimeToDate(filetime: bigint): Date | null {
    if (filetime === 0n || filetime < 0n) return null;
    // FILETIME is 100-nanosecond intervals since 1601-01-01
    const EPOCH_DIFF = 11644473600000n; // ms between 1601 and 1970
    const ms = filetime / 10000n - EPOCH_DIFF;
    const date = new Date(Number(ms));
    if (isNaN(date.getTime())) return null;
    return date;
}

export function parseNTFS(buffer: Buffer, partitionOffset = 0): FileSystemEntry[] {
    const entries: FileSystemEntry[] = [];
    const bootSector = buffer.subarray(partitionOffset, partitionOffset + 512);

    // Verify NTFS signature
    const sig = bootSector.subarray(3, 7).toString('ascii');
    if (sig !== 'NTFS') return entries;

    // Read BPB
    const bytesPerSector = bootSector.readUInt16LE(11);
    const sectorsPerCluster = bootSector.readUInt8(13);
    const bytesPerCluster = bytesPerSector * sectorsPerCluster;

    // MFT location: offset 48 is $MFT cluster number (8 bytes)
    const mftCluster = Number(bootSector.readBigInt64LE(48));
    const mftOffset = partitionOffset + mftCluster * bytesPerCluster;

    // MFT record size: offset 64 (signed byte — if negative, it's 2^|value|)
    let mftRecordSize: number;
    const mftRecordSizeRaw = bootSector.readInt8(64);
    if (mftRecordSizeRaw < 0) {
        mftRecordSize = Math.pow(2, Math.abs(mftRecordSizeRaw));
    } else {
        mftRecordSize = mftRecordSizeRaw * bytesPerCluster;
    }

    if (mftRecordSize === 0) mftRecordSize = 1024;

    // Parse MFT records
    const MAX_MFT_RECORDS = 10000;  // Safety limit
    const maxOffset = Math.min(
        mftOffset + MAX_MFT_RECORDS * mftRecordSize,
        buffer.length
    );

    for (let recordOffset = mftOffset; recordOffset + mftRecordSize <= maxOffset; recordOffset += mftRecordSize) {
        const recordMagic = buffer.subarray(recordOffset, recordOffset + 4).toString('ascii');
        if (recordMagic !== 'FILE') continue;

        const flags = buffer.readUInt16LE(recordOffset + 22);
        const isInUse = (flags & 0x01) !== 0;
        const isDirectory = (flags & 0x02) !== 0;
        const isDeleted = !isInUse;

        // First attribute offset
        const firstAttrOffset = buffer.readUInt16LE(recordOffset + 20);
        let attrOffset = recordOffset + firstAttrOffset;

        let fileName = '';
        let parentDir = '';
        let fileSize = 0n;
        let createdAt: Date | null = null;
        let modifiedAt: Date | null = null;
        let accessedAt: Date | null = null;
        let mftChangedAt: Date | null = null;

        // Walk attributes
        while (attrOffset + 8 < recordOffset + mftRecordSize && attrOffset + 8 < buffer.length) {
            const attrType = buffer.readUInt32LE(attrOffset);
            if (attrType === 0xFFFFFFFF || attrType === 0) break;

            const attrLength = buffer.readUInt32LE(attrOffset + 4);
            if (attrLength === 0 || attrLength > mftRecordSize) break;

            // $STANDARD_INFORMATION (type 0x10)
            if (attrType === 0x10) {
                const contentOffset = buffer.readUInt16LE(attrOffset + 20);
                const siOffset = attrOffset + contentOffset;

                if (siOffset + 32 <= buffer.length) {
                    createdAt = filetimeToDate(buffer.readBigUInt64LE(siOffset));
                    modifiedAt = filetimeToDate(buffer.readBigUInt64LE(siOffset + 8));
                    mftChangedAt = filetimeToDate(buffer.readBigUInt64LE(siOffset + 16));
                    accessedAt = filetimeToDate(buffer.readBigUInt64LE(siOffset + 24));
                }
            }

            // $FILE_NAME (type 0x30)
            if (attrType === 0x30) {
                const isResident = buffer.readUInt8(attrOffset + 8) === 0;
                if (isResident) {
                    const contentOffset = buffer.readUInt16LE(attrOffset + 20);
                    const fnOffset = attrOffset + contentOffset;

                    if (fnOffset + 66 <= buffer.length) {
                        const parentRef = Number(buffer.readBigUInt64LE(fnOffset) & 0xFFFFFFFFFFFFn);
                        fileSize = buffer.readBigUInt64LE(fnOffset + 48);
                        const nameLength = buffer.readUInt8(fnOffset + 64);
                        const namespace = buffer.readUInt8(fnOffset + 65);

                        // Skip DOS (short) names (namespace 2)
                        if (namespace !== 2 && fnOffset + 66 + nameLength * 2 <= buffer.length) {
                            const nameBuffer = buffer.subarray(fnOffset + 66, fnOffset + 66 + nameLength * 2);
                            const parsedName = nameBuffer.toString('utf16le');
                            if (parsedName && (fileName === '' || namespace === 1 || namespace === 3)) {
                                fileName = parsedName;
                            }
                        }

                        parentDir = parentRef.toString();
                    }
                }
            }

            attrOffset += attrLength;
        }

        if (!fileName || fileName.startsWith('$')) continue; // skip system metafiles

        entries.push({
            path: fileName,
            name: fileName,
            isDirectory,
            isDeleted,
            sizeBytes: Number(fileSize),
            createdAt,
            modifiedAt,
            accessedAt,
            mftChangedAt,
            parentPath: parentDir,
            permissions: null,
            uid: null,
            gid: null,
            inode: Math.floor((recordOffset - mftOffset) / mftRecordSize),
            fileType: isDirectory ? 'directory' : guessFileType(fileName),
            attributes: { flags, ntfsAttrs: true },
        });
    }

    return entries;
}

// ────────────────────────────────────────────────────────────────────
// FAT32 Parser
// ────────────────────────────────────────────────────────────────────

/** DOS date+time to Date */
function dosDateTimeToDate(date: number, time: number): Date | null {
    if (date === 0 && time === 0) return null;
    const day = date & 0x1F;
    const month = ((date >> 5) & 0x0F) - 1;
    const year = ((date >> 9) & 0x7F) + 1980;
    const seconds = (time & 0x1F) * 2;
    const minutes = (time >> 5) & 0x3F;
    const hours = (time >> 11) & 0x1F;

    const d = new Date(year, month, day, hours, minutes, seconds);
    if (isNaN(d.getTime())) return null;
    return d;
}

export function parseFAT32(buffer: Buffer, partitionOffset = 0): FileSystemEntry[] {
    const entries: FileSystemEntry[] = [];
    const bpb = buffer.subarray(partitionOffset, partitionOffset + 512);

    // Verify FAT32 signature
    const fatSig = bpb.subarray(82, 90).toString('ascii');
    if (!fatSig.startsWith('FAT32')) return entries;

    const bytesPerSector = bpb.readUInt16LE(11);
    const sectorsPerCluster = bpb.readUInt8(13);
    const reservedSectors = bpb.readUInt16LE(14);
    const numFATs = bpb.readUInt8(16);
    const fatSize32 = bpb.readUInt32LE(36);
    const rootCluster = bpb.readUInt32LE(44);

    const bytesPerCluster = bytesPerSector * sectorsPerCluster;
    const fatStart = partitionOffset + reservedSectors * bytesPerSector;
    const dataStart = fatStart + numFATs * fatSize32 * bytesPerSector;

    // Read FAT table for cluster chain traversal
    function getNextCluster(cluster: number): number {
        const fatEntryOffset = fatStart + cluster * 4;
        if (fatEntryOffset + 4 > buffer.length) return 0x0FFFFFF8;
        return buffer.readUInt32LE(fatEntryOffset) & 0x0FFFFFFF;
    }

    function clusterToOffset(cluster: number): number {
        return dataStart + (cluster - 2) * bytesPerCluster;
    }

    // Read directory entries from a cluster chain
    function readDirectory(startCluster: number, parentPath: string): void {
        let cluster = startCluster;
        let lfnParts: string[] = [];
        const visited = new Set<number>();

        while (cluster >= 2 && cluster < 0x0FFFFFF8) {
            if (visited.has(cluster)) break; // circular chain
            visited.add(cluster);

            const dirOffset = clusterToOffset(cluster);
            if (dirOffset + bytesPerCluster > buffer.length) break;

            for (let i = 0; i < bytesPerCluster; i += 32) {
                const entryOffset = dirOffset + i;
                if (entryOffset + 32 > buffer.length) break;

                const firstByte = buffer.readUInt8(entryOffset);
                if (firstByte === 0x00) return; // end of directory
                if (firstByte === 0xE5) {
                    // Deleted entry
                    const attr = buffer.readUInt8(entryOffset + 11);
                    if (attr === 0x0F) continue; // deleted LFN entry

                    const rawName = buffer.subarray(entryOffset, entryOffset + 8).toString('ascii').trimEnd();
                    const rawExt = buffer.subarray(entryOffset + 8, entryOffset + 11).toString('ascii').trimEnd();
                    const delName = '?' + rawName.substring(1) + (rawExt ? '.' + rawExt : '');

                    const isDir = (attr & 0x10) !== 0;
                    const fileSize = buffer.readUInt32LE(entryOffset + 28);
                    const modDate = buffer.readUInt16LE(entryOffset + 24);
                    const modTime = buffer.readUInt16LE(entryOffset + 22);
                    const createDate = buffer.readUInt16LE(entryOffset + 16);
                    const createTime = buffer.readUInt16LE(entryOffset + 14);

                    entries.push({
                        path: parentPath + delName,
                        name: delName,
                        isDirectory: isDir,
                        isDeleted: true,
                        sizeBytes: fileSize,
                        createdAt: dosDateTimeToDate(createDate, createTime),
                        modifiedAt: dosDateTimeToDate(modDate, modTime),
                        accessedAt: null,
                        mftChangedAt: null,
                        parentPath,
                        permissions: null,
                        uid: null,
                        gid: null,
                        inode: null,
                        fileType: isDir ? 'directory' : guessFileType(delName),
                        attributes: { fat32: true, deleted: true, attr },
                    });
                    continue;
                }

                const attr = buffer.readUInt8(entryOffset + 11);

                // Long File Name entry
                if (attr === 0x0F) {
                    const seq = buffer.readUInt8(entryOffset) & 0x3F;
                    const part1 = buffer.subarray(entryOffset + 1, entryOffset + 11);
                    const part2 = buffer.subarray(entryOffset + 14, entryOffset + 26);
                    const part3 = buffer.subarray(entryOffset + 28, entryOffset + 32);
                    const partStr = Buffer.concat([part1, part2, part3])
                        .toString('utf16le')
                        .replace(/\uFFFF/g, '')
                        .replace(/\0.*/, '');

                    while (lfnParts.length < seq) lfnParts.push('');
                    lfnParts[seq - 1] = partStr;
                    continue;
                }

                // Regular directory entry
                if (attr & 0x08) { lfnParts = []; continue; } // Volume label

                const rawName = buffer.subarray(entryOffset, entryOffset + 8).toString('ascii').trimEnd();
                const rawExt = buffer.subarray(entryOffset + 8, entryOffset + 11).toString('ascii').trimEnd();

                if (rawName === '.' || rawName === '..') { lfnParts = []; continue; }

                let fileName: string;
                if (lfnParts.length > 0) {
                    fileName = lfnParts.join('');
                    lfnParts = [];
                } else {
                    fileName = rawName + (rawExt ? '.' + rawExt : '');
                }

                const isDir = (attr & 0x10) !== 0;
                const fileSize = buffer.readUInt32LE(entryOffset + 28);
                const modDate = buffer.readUInt16LE(entryOffset + 24);
                const modTime = buffer.readUInt16LE(entryOffset + 22);
                const createDate = buffer.readUInt16LE(entryOffset + 16);
                const createTime = buffer.readUInt16LE(entryOffset + 14);
                const accessDate = buffer.readUInt16LE(entryOffset + 18);

                const highCluster = buffer.readUInt16LE(entryOffset + 20);
                const lowCluster = buffer.readUInt16LE(entryOffset + 26);
                const fileCluster = (highCluster << 16) | lowCluster;

                const fullPath = parentPath + fileName;

                entries.push({
                    path: fullPath,
                    name: fileName,
                    isDirectory: isDir,
                    isDeleted: false,
                    sizeBytes: fileSize,
                    createdAt: dosDateTimeToDate(createDate, createTime),
                    modifiedAt: dosDateTimeToDate(modDate, modTime),
                    accessedAt: dosDateTimeToDate(accessDate, 0),
                    mftChangedAt: null,
                    parentPath,
                    permissions: null,
                    uid: null,
                    gid: null,
                    inode: null,
                    fileType: isDir ? 'directory' : guessFileType(fileName),
                    attributes: { fat32: true, attr, cluster: fileCluster },
                });

                // Recurse into subdirectories
                if (isDir && fileCluster >= 2 && fileCluster < 0x0FFFFFF8 && entries.length < 50000) {
                    readDirectory(fileCluster, fullPath + '/');
                }
            }

            cluster = getNextCluster(cluster);
        }
    }

    readDirectory(rootCluster, '/');
    return entries;
}

// ────────────────────────────────────────────────────────────────────
// EXT4 Parser
// ────────────────────────────────────────────────────────────────────

export function parseEXT4(buffer: Buffer, partitionOffset = 0): FileSystemEntry[] {
    const entries: FileSystemEntry[] = [];

    // Superblock starts at offset 1024
    const sbOffset = partitionOffset + 1024;
    if (sbOffset + 256 > buffer.length) return entries;

    // Verify EXT magic
    const magic = buffer.readUInt16LE(sbOffset + 56);
    if (magic !== 0xEF53) return entries;

    // Read superblock fields
    const totalInodes = buffer.readUInt32LE(sbOffset + 0);
    const totalBlocks = buffer.readUInt32LE(sbOffset + 4);
    const blockSizeLog = buffer.readUInt32LE(sbOffset + 24);
    const blockSize = Math.pow(2, 10 + blockSizeLog);
    const inodesPerGroup = buffer.readUInt32LE(sbOffset + 40);
    const inodeSize = buffer.readUInt16LE(sbOffset + 88) || 128;
    const blocksPerGroup = buffer.readUInt32LE(sbOffset + 32);

    const groupCount = Math.ceil(totalInodes / inodesPerGroup);

    // Read group descriptor table (starts at block 1 or 2)
    const gdtBlock = blockSize === 1024 ? 2 : 1;
    const gdtOffset = partitionOffset + gdtBlock * blockSize;

    // Parse inode from inode table
    function readInode(inodeNum: number): {
        mode: number; uid: number; gid: number; size: number;
        atime: number; ctime: number; mtime: number; crtime: number;
        linksCount: number; blocks: number; flags: number;
        blockPointers: number[];
    } | null {
        if (inodeNum < 1) return null;

        const groupIdx = Math.floor((inodeNum - 1) / inodesPerGroup);
        const inodeIdx = (inodeNum - 1) % inodesPerGroup;

        const gdOffset = gdtOffset + groupIdx * 32;
        if (gdOffset + 32 > buffer.length) return null;

        const inodeTableBlock = buffer.readUInt32LE(gdOffset + 8);
        const inodeOffset = partitionOffset + inodeTableBlock * blockSize + inodeIdx * inodeSize;
        if (inodeOffset + 128 > buffer.length) return null;

        const mode = buffer.readUInt16LE(inodeOffset);
        const uid = buffer.readUInt16LE(inodeOffset + 2);
        const sizeLow = buffer.readUInt32LE(inodeOffset + 4);
        const atime = buffer.readUInt32LE(inodeOffset + 8);
        const ctime = buffer.readUInt32LE(inodeOffset + 12);
        const mtime = buffer.readUInt32LE(inodeOffset + 16);
        const linksCount = buffer.readUInt16LE(inodeOffset + 26);
        const blocks = buffer.readUInt32LE(inodeOffset + 28);
        const flags = buffer.readUInt32LE(inodeOffset + 32);
        const gid = buffer.readUInt16LE(inodeOffset + 24);

        // Block pointers (12 direct + 1 indirect + 1 double + 1 triple)
        const blockPointers: number[] = [];
        for (let i = 0; i < 15; i++) {
            blockPointers.push(buffer.readUInt32LE(inodeOffset + 40 + i * 4));
        }

        // For EXT4 with extents, check inode flags
        let crtime = 0;
        if (inodeSize >= 256 && inodeOffset + 160 <= buffer.length) {
            crtime = buffer.readUInt32LE(inodeOffset + 144); // creation time in extra inode area
        }

        const sizeHigh = buffer.readUInt32LE(inodeOffset + 108);
        const size = sizeLow + (sizeHigh * 0x100000000);

        return { mode, uid, gid, size, atime, ctime, mtime, crtime, linksCount, blocks, flags, blockPointers };
    }

    // Read directory entries from inode block pointers
    function readDirectoryEntries(inode: ReturnType<typeof readInode>, parentPath: string): void {
        if (!inode || inode.blockPointers.length === 0) return;

        // Use EXT4 extent tree if EXTENTS flag is set (0x80000)
        const usesExtents = (inode.flags & 0x80000) !== 0;

        const dataBlocks: number[] = [];

        if (usesExtents) {
            // First 12 block pointers area is used as extent tree header
            // For simplicity, read direct extent entries
            // Extent header at blockPointers[0..2] position in inode
            // We'll just try the first few direct block pointers
            for (const bp of inode.blockPointers) {
                if (bp > 0 && bp < totalBlocks) dataBlocks.push(bp);
            }
        } else {
            for (let i = 0; i < 12 && i < inode.blockPointers.length; i++) {
                if (inode.blockPointers[i] > 0) dataBlocks.push(inode.blockPointers[i]);
            }
        }

        for (const blockNum of dataBlocks) {
            const blockOff = partitionOffset + blockNum * blockSize;
            if (blockOff + blockSize > buffer.length) continue;

            let pos = 0;
            while (pos + 8 < blockSize) {
                const dirInodeNum = buffer.readUInt32LE(blockOff + pos);
                const recLen = buffer.readUInt16LE(blockOff + pos + 4);
                const nameLen = buffer.readUInt8(blockOff + pos + 6);
                const fileType = buffer.readUInt8(blockOff + pos + 7);

                if (recLen === 0 || recLen > blockSize) break;
                if (dirInodeNum === 0) { pos += recLen; continue; }

                if (nameLen > 0 && pos + 8 + nameLen <= blockSize) {
                    const name = buffer.subarray(blockOff + pos + 8, blockOff + pos + 8 + nameLen).toString('utf8');

                    if (name !== '.' && name !== '..') {
                        const childInode = readInode(dirInodeNum);
                        const isDir = fileType === 2 || (childInode ? (childInode.mode & 0xF000) === 0x4000 : false);
                        const isDeleted = childInode ? childInode.linksCount === 0 : false;

                        const fullPath = parentPath + name;
                        const modeStr = childInode ? (childInode.mode & 0o777).toString(8).padStart(3, '0') : null;

                        entries.push({
                            path: fullPath,
                            name,
                            isDirectory: isDir,
                            isDeleted,
                            sizeBytes: childInode?.size ?? 0,
                            createdAt: childInode?.crtime ? new Date(childInode.crtime * 1000) : null,
                            modifiedAt: childInode?.mtime ? new Date(childInode.mtime * 1000) : null,
                            accessedAt: childInode?.atime ? new Date(childInode.atime * 1000) : null,
                            mftChangedAt: childInode?.ctime ? new Date(childInode.ctime * 1000) : null,
                            parentPath,
                            permissions: modeStr,
                            uid: childInode?.uid ?? null,
                            gid: childInode?.gid ?? null,
                            inode: dirInodeNum,
                            fileType: isDir ? 'directory' : guessFileType(name),
                            attributes: { ext4: true, flags: childInode?.flags },
                        });

                        // Recurse into subdirectories (with safety limit)
                        if (isDir && !isDeleted && entries.length < 50000) {
                            readDirectoryEntries(childInode, fullPath + '/');
                        }
                    }
                }

                pos += recLen;
            }
        }
    }

    // Start from root inode (inode 2)
    const rootInode = readInode(2);
    if (rootInode) {
        readDirectoryEntries(rootInode, '/');
    }

    return entries;
}

// ────────────────────────────────────────────────────────────────────
// Unified Parser
// ────────────────────────────────────────────────────────────────────

export function parseFileSystem(
    buffer: Buffer,
    partitionOffset = 0,
): FileSystemInfo | null {
    const fsType = detectFileSystemType(buffer, partitionOffset);

    let entries: FileSystemEntry[] = [];
    let label = '';

    switch (fsType) {
        case 'NTFS':
            entries = parseNTFS(buffer, partitionOffset);
            label = 'NTFS Volume';
            break;
        case 'FAT32':
            entries = parseFAT32(buffer, partitionOffset);
            label = 'FAT32 Volume';
            break;
        case 'EXT4':
        case 'EXT3':
        case 'EXT2':
            entries = parseEXT4(buffer, partitionOffset);
            label = `${fsType} Volume`;
            break;
        default:
            return null;
    }

    const deletedEntries = entries.filter(e => e.isDeleted).length;

    return {
        type: fsType,
        label,
        totalSizeBytes: buffer.length - partitionOffset,
        freeSizeBytes: 0, // would require FAT/bitmap analysis
        clusterSize: 4096, // simplified
        totalEntries: entries.length,
        deletedEntries,
        entries,
    };
}

// ────────────────────────────────────────────────────────────────────
// File Type Guessing by Extension
// ────────────────────────────────────────────────────────────────────

function guessFileType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
        bmp: 'image/bmp', tiff: 'image/tiff', svg: 'image/svg+xml',
        pdf: 'application/pdf', doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        txt: 'text/plain', csv: 'text/csv', html: 'text/html', xml: 'application/xml',
        json: 'application/json', js: 'application/javascript',
        zip: 'application/zip', rar: 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed', tar: 'application/x-tar',
        gz: 'application/gzip',
        mp4: 'video/mp4', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
        mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
        exe: 'application/x-msdownload', dll: 'application/x-msdownload',
        sys: 'application/octet-stream', dat: 'application/octet-stream',
        log: 'text/plain', ini: 'text/plain', cfg: 'text/plain',
        reg: 'text/plain', bat: 'text/plain', cmd: 'text/plain',
        lnk: 'application/x-ms-shortcut',
        sqlite: 'application/x-sqlite3', db: 'application/x-sqlite3',
        evtx: 'application/octet-stream', pf: 'application/octet-stream',
    };
    return mimeMap[ext] ?? 'application/octet-stream';
}

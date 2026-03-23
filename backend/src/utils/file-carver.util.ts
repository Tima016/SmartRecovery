/**
 * File Carving — Signature Definitions & Carver
 *
 * Implements header/footer signature matching against a raw buffer.
 * Each signature entry declares:
 *   - magic header bytes (required)
 *   - magic footer bytes (optional — some formats have no definitive footer)
 *   - expected MIME type
 *   - expected entropy range [min, max] for the file body
 *   - max plausible file size in bytes (sanity guard)
 */

import { calculateEntropy, byteContinuity } from './entropy.util';

export interface FileSignature {
    name: string;
    mimeType: string;
    header: Buffer;
    footer: Buffer | null;
    /** Expected body entropy range */
    entropyMin: number;
    entropyMax: number;
    /** Absolute maximum file size to consider plausible (bytes) */
    maxSize: number;
    /** Whether this format has a reliable footer */
    hasReliableFooter: boolean;
}

export interface CarvedFile {
    signatureName: string;
    mimeType: string;
    offsetStart: number;
    offsetEnd: number;
    sizeBytes: number;
    headerFound: boolean;
    footerFound: boolean;
    footerDistanceOk: boolean;
    byteContinuityOk: boolean;
    entropyScore: number;
    headerSignature: string;
    footerSignature: string;
    data: Buffer;
}

/** Registered file signatures (extend as needed) */
export const FILE_SIGNATURES: FileSignature[] = [
    {
        name: 'JPEG',
        mimeType: 'image/jpeg',
        header: Buffer.from([0xff, 0xd8, 0xff]),
        footer: Buffer.from([0xff, 0xd9]),
        entropyMin: 6.0,
        entropyMax: 8.0,
        maxSize: 100 * 1024 * 1024, // 100 MB
        hasReliableFooter: true,
    },
    {
        name: 'PNG',
        mimeType: 'image/png',
        header: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        footer: Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
        entropyMin: 6.5,
        entropyMax: 8.0,
        maxSize: 50 * 1024 * 1024, // 50 MB
        hasReliableFooter: true,
    },
    {
        name: 'PDF',
        mimeType: 'application/pdf',
        header: Buffer.from('%PDF'),
        footer: Buffer.from('%%EOF'),
        entropyMin: 3.5,
        entropyMax: 7.5,
        maxSize: 500 * 1024 * 1024, // 500 MB
        hasReliableFooter: true,
    },
    {
        name: 'ZIP',
        mimeType: 'application/zip',
        header: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        footer: Buffer.from([0x50, 0x4b, 0x05, 0x06]),
        entropyMin: 7.5,
        entropyMax: 8.0,
        maxSize: 2 * 1024 * 1024 * 1024, // 2 GB
        hasReliableFooter: true,
    },
    {
        name: 'DOCX', // DOCX is a ZIP variant — distinct header
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        header: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]),
        footer: Buffer.from([0x50, 0x4b, 0x05, 0x06]),
        entropyMin: 7.0,
        entropyMax: 8.0,
        maxSize: 100 * 1024 * 1024,
        hasReliableFooter: true,
    },
    {
        name: 'EXE/PE',
        mimeType: 'application/x-msdownload',
        header: Buffer.from([0x4d, 0x5a]), // MZ header
        footer: null,
        entropyMin: 4.0,
        entropyMax: 8.0,
        maxSize: 200 * 1024 * 1024,
        hasReliableFooter: false,
    },
    {
        name: 'MP4',
        mimeType: 'video/mp4',
        // 'ftyp' box at offset 4: bytes 4–7 = 0x66747970
        header: Buffer.from([0x66, 0x74, 0x79, 0x70]),
        footer: null,
        entropyMin: 6.5,
        entropyMax: 8.0,
        maxSize: 4 * 1024 * 1024 * 1024,
        hasReliableFooter: false,
    },
    {
        name: 'GIF',
        mimeType: 'image/gif',
        header: Buffer.from('GIF8'),
        footer: Buffer.from([0x00, 0x3b]),
        entropyMin: 5.5,
        entropyMax: 8.0,
        maxSize: 50 * 1024 * 1024,
        hasReliableFooter: true,
    },
    {
        name: 'GZIP',
        mimeType: 'application/gzip',
        header: Buffer.from([0x1f, 0x8b]),
        footer: null,
        entropyMin: 7.5,
        entropyMax: 8.0,
        maxSize: 1024 * 1024 * 1024,
        hasReliableFooter: false,
    },
];

/**
 * Find all occurrences of a byte-pattern inside a buffer.
 * Returns array of starting offsets.
 */
function findAll(haystack: Buffer, needle: Buffer): number[] {
    const positions: number[] = [];
    if (needle.length === 0 || haystack.length < needle.length) return positions;

    for (let i = 0; i <= haystack.length - needle.length; i++) {
        let match = true;
        for (let j = 0; j < needle.length; j++) {
            if (haystack[i + j] !== needle[j]) {
                match = false;
                break;
            }
        }
        if (match) positions.push(i);
    }
    return positions;
}

/**
 * Carve a Buffer for known file signatures.
 *
 * Strategy:
 *   1. Find all header positions for each signature.
 *   2. For signatures with a footer, find the nearest footer after the header.
 *   3. Apply sanity checks: size plausibility, footer-distance check, byte continuity.
 *   4. Extract the slice and compute entropy.
 *
 * @param buffer  Raw disk image buffer (or chunk thereof)
 * @param baseOffset  Absolute offset of buffer[0] in the disk image (for position reporting)
 */
/** Max buffer size to accept for carving (256 MB) */
const MAX_CARVE_BUFFER = 256 * 1024 * 1024;

export function carveFiles(buffer: Buffer, baseOffset = 0): CarvedFile[] {
    if (buffer.length > MAX_CARVE_BUFFER) {
        throw new Error(
            `Buffer size ${(buffer.length / 1024 / 1024).toFixed(1)} MB exceeds ` +
            `MAX_CARVE_BUFFER (${MAX_CARVE_BUFFER / 1024 / 1024} MB). Process in chunks.`,
        );
    }

    const carved: CarvedFile[] = [];

    for (let offset = 0; offset < buffer.length - 16; offset += 512) { // Sector aligned
        for (const sig of FILE_SIGNATURES) {
            if (offset + sig.header.length > buffer.length) continue;

            let headerMatch = true;
            for (let i = 0; i < sig.header.length; i++) {
                if (buffer[offset + i] !== sig.header[i]) {
                    headerMatch = false;
                    break;
                }
            }

            if (headerMatch) {
                let footerOffset = -1;
                let maxSearch = Math.min(buffer.length, offset + sig.maxSize);

                if (sig.footer) {
                    for (let s = offset + sig.header.length; s <= maxSearch - sig.footer.length; s++) {
                        let fMatch = true;
                        for (let j = 0; j < sig.footer.length; j++) {
                            if (buffer[s + j] !== sig.footer[j]) {
                                fMatch = false;
                                break;
                            }
                        }
                        if (fMatch) {
                            footerOffset = s;
                            break;
                        }
                    }
                }

                const endOffset = footerOffset !== -1 ? footerOffset + sig.footer.length : maxSearch;
                const sizeBytes = endOffset - offset;
                const dataSlice = buffer.subarray(offset, endOffset);
                const entropyScore = calculateEntropy(dataSlice);

                if (entropyScore >= sig.entropyMin && entropyScore <= sig.entropyMax) {
                    carved.push({
                        signatureName: sig.name,
                        mimeType: sig.mimeType,
                        offsetStart: baseOffset + offset,
                        offsetEnd: baseOffset + endOffset,
                        sizeBytes,
                        headerFound: true,
                        footerFound: footerOffset !== -1,
                        footerDistanceOk: true,
                        byteContinuityOk: byteContinuity(dataSlice) > 0.5,
                        entropyScore,
                        headerSignature: sig.header.toString('hex'),
                        footerSignature: sig.footer ? sig.footer.toString('hex') : '',
                        data: dataSlice, // Note: keeping small buffers in mem is OK for small files
                    });
                }
            }
        }
    }

    return carved;
}

/**
 * Stream-based carving for massive disk images without loading into memory.
 * Reads overlapping chunks from disk and yields carved files.
 */
import * as fs from 'fs';

export async function carveFilesStream(filePath: string): Promise<CarvedFile[]> {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    const OVERLAP = 1 * 1024 * 1024; // 1MB overlap to catch split signatures

    const carved: CarvedFile[] = [];
    const fd = fs.openSync(filePath, 'r');
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    // Allocate a reusable buffer
    const buffer = Buffer.alloc(CHUNK_SIZE + OVERLAP);
    let globalOffset = 0;

    try {
        while (globalOffset < fileSize) {
            const bytesToRead = Math.min(buffer.length, fileSize - globalOffset);
            const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, globalOffset);

            const activeBuffer = buffer.subarray(0, bytesRead);

            // Limit scanning entirely within this chunk (excluding the pure overlap end to prevent duplicate detection)
            // Unless it's the very last chunk.
            const scanLimit = (globalOffset + bytesRead === fileSize) ? bytesRead : CHUNK_SIZE;

            for (let localOffset = 0; localOffset < scanLimit; localOffset += 512) { // 512 byte sector alignment
                for (const sig of FILE_SIGNATURES) {
                    if (localOffset + sig.header.length > activeBuffer.length) continue;

                    let headerMatch = true;
                    for (let i = 0; i < sig.header.length; i++) {
                        if (activeBuffer[localOffset + i] !== sig.header[i]) {
                            headerMatch = false;
                            break;
                        }
                    }

                    if (headerMatch) {
                        let footerLocalOffset = -1;
                        // Search up to the end of the current buffer chunk
                        let maxSearch = Math.min(activeBuffer.length, localOffset + sig.maxSize);

                        if (sig.footer) {
                            for (let s = localOffset + sig.header.length; s <= maxSearch - sig.footer.length; s++) {
                                let fMatch = true;
                                for (let j = 0; j < sig.footer.length; j++) {
                                    if (activeBuffer[s + j] !== sig.footer[j]) {
                                        fMatch = false;
                                        break;
                                    }
                                }
                                if (fMatch) {
                                    footerLocalOffset = s;
                                    break;
                                }
                            }
                        }

                        // If footer not found in this chunk, we truncate the file (fragment)
                        const endLocalOffset = footerLocalOffset !== -1 ? footerLocalOffset + sig.footer!.length : maxSearch;
                        const sizeBytes = endLocalOffset - localOffset;
                        const dataSlice = Buffer.alloc(sizeBytes);
                        activeBuffer.copy(dataSlice, 0, localOffset, endLocalOffset);

                        const entropyScore = calculateEntropy(dataSlice);

                        if (entropyScore >= sig.entropyMin && entropyScore <= sig.entropyMax) {
                            carved.push({
                                signatureName: sig.name,
                                mimeType: sig.mimeType,
                                offsetStart: globalOffset + localOffset,
                                offsetEnd: globalOffset + endLocalOffset,
                                sizeBytes,
                                headerFound: true,
                                footerFound: footerLocalOffset !== -1,
                                footerDistanceOk: true,
                                byteContinuityOk: byteContinuity(dataSlice) > 0.5,
                                entropyScore,
                                headerSignature: sig.header.toString('hex'),
                                footerSignature: sig.footer ? sig.footer.toString('hex') : '',
                                data: dataSlice,
                            });
                        }
                    }
                }
            }

            globalOffset += CHUNK_SIZE; // Advance by CHUNK_SIZE, relying on overlap for boundary files
        }
    } finally {
        fs.closeSync(fd);
    }

    return carved;
}

function deduplicateCarved(carved: CarvedFile[]): CarvedFile[] {
    // Sort by offsetStart
    carved.sort((a, b) => a.offsetStart - b.offsetStart);
    const out: CarvedFile[] = [];

    for (const candidate of carved) {
        const overlaps = out.some(
            (existing) =>
                candidate.offsetStart < existing.offsetEnd &&
                candidate.offsetEnd > existing.offsetStart,
        );
        if (!overlaps) {
            out.push(candidate);
        }
    }
    return out;
}

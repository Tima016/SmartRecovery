/**
 * Disk Image Format Handler
 *
 * Provides a unified interface for reading disk image files in various formats:
 *   - RAW / DD / IMG — Direct byte access (no container format)
 *   - E01 (EnCase Evidence File) — Compressed/chunked forensic container
 *
 * Usage:
 *   const image = DiskImageReader.fromBuffer(buffer);
 *   const sectors = image.readSectors(offset, length);
 *   const info = image.getImageInfo();
 */

import * as zlib from 'zlib';

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface DiskImageInfo {
    format: 'RAW' | 'E01' | 'DD' | 'IMG';
    totalSizeBytes: number;
    sectorSize: number;
    totalSectors: number;
    /** E01-specific metadata extracted from header section */
    ewfMetadata?: Record<string, string>;
}

export interface DiskImageReader {
    getImageInfo(): DiskImageInfo;
    /** Read bytes from the logical disk at the given offset */
    readBytes(offset: number, length: number): Buffer;
    /** Read a range of sectors */
    readSectors(sectorStart: number, sectorCount: number): Buffer;
    /** Get the full underlying disk data buffer (for small images) */
    getFullBuffer(): Buffer;
    /** Total logical size of the disk */
    readonly totalSize: number;
}

// ────────────────────────────────────────────────────────────────────
// Format Detection
// ────────────────────────────────────────────────────────────────────

/** EWF (E01) magic: "EVF\x09\x0d\x0a\xff\x00" */
const EWF_MAGIC = Buffer.from([0x45, 0x56, 0x46, 0x09, 0x0d, 0x0a, 0xff, 0x00]);

export type DiskImageFormat = 'RAW' | 'E01' | 'UNKNOWN';

export function detectImageFormat(buffer: Buffer): DiskImageFormat {
    if (buffer.length < 8) return 'RAW'; // too small to have a container header

    // Check for EWF/E01 magic
    if (buffer.subarray(0, 8).equals(EWF_MAGIC)) {
        return 'E01';
    }

    // RAW images have no container signature — they start directly with
    // disk content (MBR at byte 0, or GPT protective MBR)
    return 'RAW';
}

// ────────────────────────────────────────────────────────────────────
// RAW Image Reader
// ────────────────────────────────────────────────────────────────────

export class RawImageReader implements DiskImageReader {
    private readonly buffer: Buffer;
    private readonly sectorSize: number;

    constructor(buffer: Buffer, sectorSize = 512) {
        this.buffer = buffer;
        this.sectorSize = sectorSize;
    }

    get totalSize(): number {
        return this.buffer.length;
    }

    getImageInfo(): DiskImageInfo {
        return {
            format: 'RAW',
            totalSizeBytes: this.buffer.length,
            sectorSize: this.sectorSize,
            totalSectors: Math.ceil(this.buffer.length / this.sectorSize),
        };
    }

    readBytes(offset: number, length: number): Buffer {
        const end = Math.min(offset + length, this.buffer.length);
        if (offset >= this.buffer.length) return Buffer.alloc(0);
        return this.buffer.subarray(offset, end);
    }

    readSectors(sectorStart: number, sectorCount: number): Buffer {
        const offset = sectorStart * this.sectorSize;
        const length = sectorCount * this.sectorSize;
        return this.readBytes(offset, length);
    }

    getFullBuffer(): Buffer {
        return this.buffer;
    }
}

// ────────────────────────────────────────────────────────────────────
// E01 (EWF) Image Reader
// ────────────────────────────────────────────────────────────────────

/**
 * Simplified E01 reader that:
 * 1. Parses the EWF segment header to extract metadata
 * 2. Decompresses zlib-compressed chunks to reconstruct the raw disk data
 *
 * EWF format overview:
 *   - File starts with 13-byte segment header (magic + segment number)
 *   - Followed by sections: "header", "volume", "table", "sectors", "done"
 *   - Each section has a 76-byte section descriptor
 *   - "sectors" sections contain zlib-compressed chunk data
 *   - "table" sections contain chunk offsets for random access
 */

interface EwfSection {
    type: string;
    offset: number;
    size: number;
    nextOffset: number;
}

export class E01ImageReader implements DiskImageReader {
    private readonly rawBuffer: Buffer;
    private decompressedBuffer: Buffer | null = null;
    private readonly sectorSize: number;
    private readonly metadata: Record<string, string> = {};
    private sections: EwfSection[] = [];

    constructor(buffer: Buffer, sectorSize = 512) {
        this.rawBuffer = buffer;
        this.sectorSize = sectorSize;
        this.parseSections();
    }

    get totalSize(): number {
        return this.getDecompressed().length;
    }

    private parseSections(): void {
        // EWF segment header is 13 bytes: magic(8) + fields_start(1) + segment_number(2) + padding(2)
        let offset = 13;

        while (offset + 76 <= this.rawBuffer.length) {
            const typeBytes = this.rawBuffer.subarray(offset, offset + 16);
            const typeStr = typeBytes.toString('ascii').replace(/\0/g, '').trim();

            // Section size is at offset+16 as uint64 LE
            const sizeBytes = this.rawBuffer.readUInt32LE(offset + 16);
            // Next section offset at offset+24 as uint64 LE
            const nextOffset = this.rawBuffer.readUInt32LE(offset + 24);

            this.sections.push({
                type: typeStr,
                offset,
                size: sizeBytes,
                nextOffset,
            });

            // Try to extract header metadata
            if (typeStr === 'header' || typeStr === 'header2') {
                this.extractHeaderMetadata(offset + 76, sizeBytes);
            }

            if (typeStr === 'done' || nextOffset === 0 || nextOffset <= offset) break;
            offset = nextOffset;
        }
    }

    private extractHeaderMetadata(dataOffset: number, size: number): void {
        try {
            const raw = this.rawBuffer.subarray(dataOffset, Math.min(dataOffset + size, this.rawBuffer.length));
            // Header section is zlib-compressed text
            const decompressed = zlib.inflateSync(raw);
            const text = decompressed.toString('utf8');

            // Parse key=value pairs from header
            const lines = text.split(/[\r\n]+/);
            for (const line of lines) {
                const eqIdx = line.indexOf('=') !== -1 ? line.indexOf('=') : line.indexOf('\t');
                if (eqIdx > 0) {
                    const key = line.substring(0, eqIdx).trim();
                    const value = line.substring(eqIdx + 1).trim();
                    if (key && value) this.metadata[key] = value;
                }
            }
        } catch {
            // Header parsing is best-effort; corrupted headers are common in partial images
        }
    }

    private getDecompressed(): Buffer {
        if (this.decompressedBuffer) return this.decompressedBuffer;

        // Find "sectors" sections and decompress them
        const chunks: Buffer[] = [];

        for (const section of this.sections) {
            if (section.type === 'sectors') {
                const dataStart = section.offset + 76; // skip section descriptor
                const dataEnd = Math.min(dataStart + section.size, this.rawBuffer.length);
                const compressedData = this.rawBuffer.subarray(dataStart, dataEnd);

                try {
                    const decompressed = zlib.inflateSync(compressedData);
                    chunks.push(decompressed);
                } catch {
                    // If decompression fails, data might be uncompressed
                    chunks.push(compressedData);
                }
            }
        }

        if (chunks.length === 0) {
            // Fallback: if no sections found, strip header and treat rest as raw
            this.decompressedBuffer = this.rawBuffer.subarray(13);
        } else {
            this.decompressedBuffer = Buffer.concat(chunks);
        }

        return this.decompressedBuffer;
    }

    getImageInfo(): DiskImageInfo {
        const buf = this.getDecompressed();
        return {
            format: 'E01',
            totalSizeBytes: buf.length,
            sectorSize: this.sectorSize,
            totalSectors: Math.ceil(buf.length / this.sectorSize),
            ewfMetadata: { ...this.metadata },
        };
    }

    readBytes(offset: number, length: number): Buffer {
        const buf = this.getDecompressed();
        const end = Math.min(offset + length, buf.length);
        if (offset >= buf.length) return Buffer.alloc(0);
        return buf.subarray(offset, end);
    }

    readSectors(sectorStart: number, sectorCount: number): Buffer {
        const offset = sectorStart * this.sectorSize;
        const length = sectorCount * this.sectorSize;
        return this.readBytes(offset, length);
    }

    getFullBuffer(): Buffer {
        return this.getDecompressed();
    }
}

// ────────────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────────────

/**
 * Create a DiskImageReader from a raw file buffer.
 * Automatically detects format and returns the appropriate reader.
 */
export function createImageReader(buffer: Buffer, sectorSize = 512): DiskImageReader {
    const format = detectImageFormat(buffer);

    switch (format) {
        case 'E01':
            return new E01ImageReader(buffer, sectorSize);
        case 'RAW':
        default:
            return new RawImageReader(buffer, sectorSize);
    }
}

/**
 * Validate that a buffer looks like a valid disk image.
 * Returns format info or null if unrecognizable.
 */
export function validateDiskImage(buffer: Buffer): { format: DiskImageFormat; valid: boolean; reason?: string } {
    if (buffer.length < 512) {
        return { format: 'UNKNOWN', valid: false, reason: 'File too small to be a disk image (< 512 bytes)' };
    }

    const format = detectImageFormat(buffer);

    if (format === 'E01') {
        return { format: 'E01', valid: true };
    }

    // For RAW images, check for MBR signature (0x55AA at offset 510)
    // or GPT protective MBR
    if (buffer.length >= 512) {
        const mbrSig = buffer.readUInt16LE(510);
        if (mbrSig === 0xAA55) {
            return { format: 'RAW', valid: true };
        }
    }

    // Even without MBR signature, a RAW buffer is still valid — it could be
    // a partition image or raw unpartitioned media
    return { format: 'RAW', valid: true, reason: 'No MBR signature found; treating as raw partition image' };
}

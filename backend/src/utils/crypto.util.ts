import * as crypto from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const ALGORITHM = 'aes-256-gcm';

/**
 * Derive a 32-byte key from the ENCRYPTION_KEY env var (must be 64 hex chars).
 */
function getEncryptionKey(): Buffer {
    const hexKey = process.env.ENCRYPTION_KEY;
    if (!hexKey || hexKey.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
    }
    return Buffer.from(hexKey, 'hex');
}

export interface EncryptedResult {
    ivHex: string;
    authTagHex: string;
    encryptedBuffer: Buffer;
}

/**
 * Encrypt a buffer using AES-256-GCM.
 * Returns IV, auth tag, and ciphertext as a combined buffer.
 */
export function encryptBuffer(plainBuffer: Buffer): EncryptedResult {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        ivHex: iv.toString('hex'),
        authTagHex: authTag.toString('hex'),
        encryptedBuffer: encrypted,
    };
}

/**
 * Decrypt AES-256-GCM encrypted buffer.
 */
export function decryptBuffer(
    encryptedBuffer: Buffer,
    ivHex: string,
    authTagHex: string,
): Buffer {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
}

export interface FileHashes {
    md5: string;
    sha1: string;
    sha256: string;
    sha512: string;
}

/**
 * Compute MD5, SHA1, SHA256, SHA512 of a buffer simultaneously.
 */
export function computeHashes(buffer: Buffer): FileHashes {
    return {
        md5: crypto.createHash('md5').update(buffer).digest('hex'),
        sha1: crypto.createHash('sha1').update(buffer).digest('hex'),
        sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
        sha512: crypto.createHash('sha512').update(buffer).digest('hex'),
    };
}

/**
 * Compute hashes from a readable stream (for large files).
 */
export async function computeHashesFromStream(stream: Readable): Promise<FileHashes> {
    const md5 = crypto.createHash('md5');
    const sha1 = crypto.createHash('sha1');
    const sha256 = crypto.createHash('sha256');
    const sha512 = crypto.createHash('sha512');

    for await (const chunk of stream) {
        md5.update(chunk);
        sha1.update(chunk);
        sha256.update(chunk);
        sha512.update(chunk);
    }

    return {
        md5: md5.digest('hex'),
        sha1: sha1.digest('hex'),
        sha256: sha256.digest('hex'),
        sha512: sha512.digest('hex'),
    };
}

/**
 * Compute a generic SHA-256 hash of arbitrary string data.
 */
export function sha256(data: string): string {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Generate a cryptographically secure random hex string.
 */
export function randomHex(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
}

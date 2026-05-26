import { FileValidator, Injectable } from '@nestjs/common';

/**
 * Custom file validator for MIME type checking on evidence uploads.
 * Enforces forensic disk image extensions and rejects executable payload types.
 */

// Strict allow-list for forensic container uploads
const ALLOWED_FORENSIC_EXTENSIONS = new Set([
    '.img',
    '.dd',
    '.raw',
    '.iso',
    '.e01',
    '.001',
]);

// Deny-list approach: block known dangerous types
const BLOCKED_MIME_TYPES = new Set([
    'application/x-msdownload',     // .exe
    'application/x-msdos-program',  // .com
    'application/x-sh',             // .sh
    'application/x-bat',            // .bat
    'application/x-powershell',     // .ps1
    'text/x-shellscript',           // shell scripts
]);

// Blocked extensions (secondary check for spoofed MIME types)
const BLOCKED_EXTENSIONS = new Set([
    '.exe', '.bat', '.cmd', '.com', '.ps1', '.vbs', '.js',
    '.msi', '.scr', '.pif', '.hta', '.cpl', '.inf', '.reg',
]);

export interface MimeTypeValidatorOptions {
    /** If true, uses the built-in block list. Default: true */
    useBlockList?: boolean;
    /** Optional allow-list override — if provided, ONLY these types are allowed */
    allowedMimeTypes?: string[];
}

@Injectable()
export class MimeTypeValidator extends FileValidator<MimeTypeValidatorOptions> {
    constructor(options?: MimeTypeValidatorOptions) {
        super(options ?? { useBlockList: true });
    }

    isValid(file?: Express.Multer.File): boolean {
        if (!file) return false;

        // Primary gate: extension must be a supported forensic disk image/container.
        const ext = this.getExtension(file.originalname);
        if (!ALLOWED_FORENSIC_EXTENSIONS.has(ext)) {
            return false;
        }

        // Check MIME type against allow-list (if provided)
        if (this.validationOptions?.allowedMimeTypes?.length) {
            return this.validationOptions.allowedMimeTypes.includes(file.mimetype);
        }

        // Default: block-list approach
        if (BLOCKED_MIME_TYPES.has(file.mimetype)) {
            return false;
        }

        // Secondary check: validate extension
        if (BLOCKED_EXTENSIONS.has(ext)) {
            return false;
        }

        return true;
    }

    buildErrorMessage(): string {
        if (this.validationOptions?.allowedMimeTypes?.length) {
            return `File type not allowed. Accepted types: ${this.validationOptions.allowedMimeTypes.join(', ')}`;
        }
        return 'Only forensic image formats are allowed: .img, .dd, .raw, .iso, .E01, .001';
    }

    private getExtension(filename: string): string {
        const lastDot = filename.lastIndexOf('.');
        if (lastDot < 0) return '';
        return filename.slice(lastDot).toLowerCase();
    }
}

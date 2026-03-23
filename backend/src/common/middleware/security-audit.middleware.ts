import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// Patterns that look like attack probes
const SUSPICIOUS_PATTERNS = [
    /\.\.\//,                          // Path traversal
    /<script/i,                        // XSS
    /union\s+select/i,                 // SQLi
    /exec\s*\(/i,                      // Command injection
    /;.*drop\s+table/i,                // SQLi – DROP TABLE
    /\$\{.*\}/,                        // Template injection
    /`.*`/,                            // Backtick injection
];

// Routes that are always logged (high-value actions)
const ALWAYS_LOG_PATHS = [
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/2fa',
    '/api/v1/cases',
    '/api/v1/evidence',
    '/api/v1/imaging',
    '/api/v1/audit',
];

@Injectable()
export class SecurityAuditMiddleware implements NestMiddleware {
    private readonly logger = new Logger('SecurityAudit');

    use(req: Request, res: Response, next: NextFunction): void {
        const startTime = Date.now();
        const ip =
            (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
            req.socket?.remoteAddress ||
            'unknown';

        // ── Suspicious pattern detection ─────────────────────────────
        const urlAndBody = req.url + JSON.stringify(req.body ?? {});
        const isSuspicious = SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(urlAndBody));

        if (isSuspicious) {
            this.logger.warn({
                msg: 'Suspicious request pattern detected',
                method: req.method,
                url: req.url,
                ip,
                userAgent: req.headers['user-agent'],
                correlationId: (req as any).correlationId,
            });
        }

        // ── Log high-value request paths ──────────────────────────────
        const shouldLog =
            isSuspicious ||
            ALWAYS_LOG_PATHS.some((path) => req.url.startsWith(path));

        // ── Response hook for timing + status ─────────────────────────
        if (shouldLog) {
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                const logFn =
                    res.statusCode >= 500
                        ? 'error'
                        : res.statusCode >= 400
                            ? 'warn'
                            : 'log';

                this.logger[logFn]({
                    msg: 'Security audit log',
                    method: req.method,
                    url: req.url,
                    status: res.statusCode,
                    duration,
                    ip,
                    userAgent: req.headers['user-agent'],
                    correlationId: (req as any).correlationId,
                    userId: (req as any).user?.id,
                    suspicious: isSuspicious,
                });
            });
        }

        next();
    }
}

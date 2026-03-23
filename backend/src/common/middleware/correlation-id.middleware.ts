import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction): void {
        const correlationId =
            (req.headers['x-correlation-id'] as string) ||
            (req.headers['x-request-id'] as string) ||
            randomUUID();

        // Normalise to our header name
        req.headers['x-correlation-id'] = correlationId;

        // Echo back on response so clients can trace their request
        res.setHeader('X-Correlation-ID', correlationId);

        // Attach to req for downstream use (guards, services)
        (req as any).correlationId = correlationId;

        next();
    }
}

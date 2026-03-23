import {
    Injectable,
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Logger,
    Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { Request } from 'express';

export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';
export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
    windowMs: number;
    max: number;
}

/**
 * Per-user distributed rate limiter backed by Redis INCR / EXPIRE.
 * Falls back to IP-based limiting for unauthenticated requests.
 */
@Injectable()
export class UserRateLimitGuard implements CanActivate {
    private readonly logger = new Logger(UserRateLimitGuard.name);

    constructor(
        private readonly reflector: Reflector,
        @Inject('REDIS_CLIENT') private readonly redis: Redis,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Allow opt-out via @SkipRateLimit()
        const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (skip) return true;

        const request = context.switchToHttp().getRequest<Request>();
        const response = context.switchToHttp().getResponse();

        // Route-level override or global defaults
        const routeLimit = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        const windowMs = routeLimit?.windowMs ?? parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10);
        const max = routeLimit?.max ?? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '200', 10);
        const windowSecs = Math.ceil(windowMs / 1000);

        // Prefer authenticated userId, fall back to IP
        const identifier =
            (request as any).user?.id ??
            (request.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
            request.socket?.remoteAddress ??
            'unknown';

        const key = `rl:${identifier}`;

        const current = await this.redis.incr(key);
        if (current === 1) {
            await this.redis.expire(key, windowSecs);
        }

        const ttl = await this.redis.ttl(key);
        const resetAt = Date.now() + ttl * 1000;

        // Set standard rate-limit headers
        response.setHeader('X-RateLimit-Limit', max);
        response.setHeader('X-RateLimit-Remaining', Math.max(0, max - current));
        response.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

        if (current > max) {
            this.logger.warn({
                msg: 'Rate limit exceeded',
                identifier,
                current,
                max,
                url: request.url,
                correlationId: (request as any).correlationId,
            });
            response.setHeader('Retry-After', ttl);
            throw new HttpException(
                {
                    statusCode: 429,
                    error: 'Too Many Requests',
                    message: `Rate limit exceeded. Try again in ${ttl} seconds.`,
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        return true;
    }
}

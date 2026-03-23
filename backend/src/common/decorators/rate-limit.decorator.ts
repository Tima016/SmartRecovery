import { SetMetadata } from '@nestjs/common';
import { SKIP_RATE_LIMIT_KEY, RATE_LIMIT_KEY, RateLimitOptions } from '../guards/rate-limit.guard';

/**
 * Skip rate limiting entirely for a route or controller.
 * Use only for internal/health endpoints.
 */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);

/**
 * Override rate limit for a specific route.
 * @example @RateLimit({ windowMs: 60_000, max: 5 }) — 5 req/min
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
const Redlock = require('redlock');
import type { Lock } from 'redlock';
import type { Redis } from 'ioredis';

export { Lock };

@Injectable()
export class RedlockService implements OnModuleDestroy {
    private readonly logger = new Logger(RedlockService.name);
    private readonly redlock: any;

    constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {
        this.redlock = new Redlock([this.redis], {
            // The expected clock drift; for details see:
            // http://redis.io/topics/distlock
            driftFactor: 0.01,
            // The max number of times Redlock will attempt to lock a resource before erroring
            retryCount: 10,
            retryDelay: 200, // ms between attempts
            retryJitter: 100, // random jitter added to delay
            automaticExtensionThreshold: 500, // ms before TTL expiration to auto-extend
        });

        this.redlock.on('error', (err) => {
            // Redlock keeps retrying internally; log but don't crash
            this.logger.warn(`Redlock error (non-fatal): ${err.message}`);
        });
    }

    /**
     * Acquires a distributed lock.
     * @param resource  Unique lock key (e.g. `imaging:job:${caseId}`)
     * @param ttlMs     Lock TTL in milliseconds
     */
    async acquire(resource: string, ttlMs: number): Promise<Lock> {
        this.logger.debug(`Acquiring lock: ${resource} (TTL=${ttlMs}ms)`);
        return this.redlock.acquire([resource], ttlMs);
    }

    /**
     * Safely releases a lock, logging any release errors as warnings.
     */
    async release(lock: Lock): Promise<void> {
        try {
            await lock.release();
            this.logger.debug(`Released lock: ${lock.resources.join(', ')}`);
        } catch (err) {
            // Lock may have expired — not a critical failure
            this.logger.warn(`Failed to release lock (may have expired): ${(err as Error).message}`);
        }
    }

    /**
     * Execute a callback while holding a distributed lock.
     * Automatically releases the lock after callback completes or throws.
     */
    async using<T>(resource: string, ttlMs: number, callback: () => Promise<T>): Promise<T> {
        const lock = await this.acquire(resource, ttlMs);
        try {
            return await callback();
        } finally {
            await this.release(lock);
        }
    }

    onModuleDestroy() {
        this.redlock.quit().catch((e) =>
            this.logger.warn(`Redlock quit error: ${(e as Error).message}`)
        );
    }
}

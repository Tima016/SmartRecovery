import { Injectable, Inject, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

@Injectable()
export class RedisService {
    private readonly logger = new Logger(RedisService.name);

    constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) { }

    async get(key: string): Promise<string | null> {
        return this.redis.get(key);
    }

    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds) {
            await this.redis.setex(key, ttlSeconds, value);
        } else {
            await this.redis.set(key, value);
        }
    }

    async del(key: string): Promise<void> {
        await this.redis.del(key);
    }

    async exists(key: string): Promise<boolean> {
        const result = await this.redis.exists(key);
        return result === 1;
    }

    async hset(key: string, field: string, value: string): Promise<void> {
        await this.redis.hset(key, field, value);
    }

    async hget(key: string, field: string): Promise<string | null> {
        return this.redis.hget(key, field);
    }

    async hdel(key: string, field: string): Promise<void> {
        await this.redis.hdel(key, field);
    }

    async publish(channel: string, message: string): Promise<void> {
        await this.redis.publish(channel, message);
    }

    getClient(): Redis {
        return this.redis;
    }
}

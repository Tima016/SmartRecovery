import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MinioService } from '../minio/minio.service';
import { v4 as uuidv4 } from 'uuid';

export interface HealthCheckResult {
    status: 'ok' | 'degraded' | 'error';
    timestamp: string;
    uptime: number;
    version: string;
    checks: Record<string, CheckDetail>;
}

export interface CheckDetail {
    status: 'ok' | 'error';
    responseTimeMs: number;
    detail?: string;
}

@Injectable()
export class HealthService {
    private readonly logger = new Logger(HealthService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly minio: MinioService,
    ) { }

    async deepCheck(): Promise<HealthCheckResult> {
        const checks: Record<string, CheckDetail> = {};

        // ── 1. Database READ + WRITE round-trip ────────────────────────
        const dbStart = Date.now();
        try {
            // Read check
            await this.prisma.$queryRaw`SELECT 1`;

            // Write check — insert and immediately delete a sentinel row
            const sentinelKey = `__health_${uuidv4()}`;
            await this.prisma.$executeRawUnsafe(
                `CREATE TABLE IF NOT EXISTS _health_sentinel (key TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())`,
            );
            await this.prisma.$executeRawUnsafe(
                `INSERT INTO _health_sentinel (key) VALUES ($1) ON CONFLICT DO NOTHING`,
                sentinelKey,
            );
            await this.prisma.$executeRawUnsafe(
                `DELETE FROM _health_sentinel WHERE key = $1`,
                sentinelKey,
            );

            checks['database'] = { status: 'ok', responseTimeMs: Date.now() - dbStart };
        } catch (err) {
            this.logger.error(`Health DB check failed: ${(err as Error).message}`);
            checks['database'] = {
                status: 'error',
                responseTimeMs: Date.now() - dbStart,
                detail: (err as Error).message,
            };
        }

        // ── 2. Redis PING + SET/GET round-trip ────────────────────────
        const redisStart = Date.now();
        try {
            const client = this.redis.getClient();
            await client.ping();
            const key = `__health:${uuidv4()}`;
            await client.setex(key, 5, 'ok');
            const val = await client.get(key);
            if (val !== 'ok') throw new Error('Redis SET/GET mismatch');
            await client.del(key);
            checks['redis'] = { status: 'ok', responseTimeMs: Date.now() - redisStart };
        } catch (err) {
            this.logger.error(`Health Redis check failed: ${(err as Error).message}`);
            checks['redis'] = {
                status: 'error',
                responseTimeMs: Date.now() - redisStart,
                detail: (err as Error).message,
            };
        }

        // ── 3. MinIO bucket accessibility check ───────────────────────
        const minioStart = Date.now();
        try {
            await this.minio.ensureBuckets();
            checks['minio'] = { status: 'ok', responseTimeMs: Date.now() - minioStart };
        } catch (err) {
            this.logger.error(`Health MinIO check failed: ${(err as Error).message}`);
            checks['minio'] = {
                status: 'error',
                responseTimeMs: Date.now() - minioStart,
                detail: (err as Error).message,
            };
        }

        const allOk = Object.values(checks).every((c) => c.status === 'ok');
        const anyError = Object.values(checks).some((c) => c.status === 'error');

        return {
            status: allOk ? 'ok' : anyError ? 'error' : 'degraded',
            timestamp: new Date().toISOString(),
            uptime: Math.floor(process.uptime()),
            version: process.env.npm_package_version ?? '1.0.0',
            checks,
        };
    }
}

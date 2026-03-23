import { z } from 'zod';

const envSchema = z.object({
    // ── Server ────────────────────────────────────────────────────────
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().regex(/^\d+$/).transform(Number).default('5000'),

    // ── Database ──────────────────────────────────────────────────────
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),

    // ── Redis ─────────────────────────────────────────────────────────
    REDIS_HOST: z.string().min(1),
    REDIS_PORT: z.string().regex(/^\d+$/).transform(Number).default('6379'),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_URL: z.string().optional(),

    // ── JWT ───────────────────────────────────────────────────────────
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    // ── Encryption ────────────────────────────────────────────────────
    ENCRYPTION_KEY: z
        .string()
        .length(64, 'ENCRYPTION_KEY must be a 64-char hex string (32 raw bytes)'),

    // ── MinIO ─────────────────────────────────────────────────────────
    MINIO_ENDPOINT: z.string().min(1),
    MINIO_PORT: z.string().regex(/^\d+$/).transform(Number).default('9000'),
    MINIO_USE_SSL: z
        .string()
        .transform((v) => v === 'true')
        .default('false'),
    MINIO_ACCESS_KEY: z.string().min(1),
    MINIO_SECRET_KEY: z.string().min(1),
    MINIO_EVIDENCE_BUCKET: z.string().default('dfip-evidence'),
    MINIO_REPORTS_BUCKET: z.string().default('dfip-reports'),

    // ── Auth security ─────────────────────────────────────────────────
    BCRYPT_ROUNDS: z.string().regex(/^\d+$/).transform(Number).default('12'),
    MAX_FAILED_LOGINS: z.string().regex(/^\d+$/).transform(Number).default('5'),
    LOCKOUT_DURATION_MINUTES: z.string().regex(/^\d+$/).transform(Number).default('15'),

    // ── Rate limiting ─────────────────────────────────────────────────
    RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).transform(Number).default('60000'),
    RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).transform(Number).default('200'),

    // ── CORS ──────────────────────────────────────────────────────────
    CORS_ORIGINS: z.string().default(''),

    // ── File upload ───────────────────────────────────────────────────
    MAX_FILE_SIZE_MB: z.string().regex(/^\d+$/).transform(Number).default('2048'),

    // ── Session ───────────────────────────────────────────────────────
    SESSION_TIMEOUT_MINUTES: z.string().regex(/^\d+$/).transform(Number).default('480'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates process.env at application boot.
 * Throws a descriptive error and exits if validation fails.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
    const result = envSchema.safeParse(config);

    if (!result.success) {
        const formatted = result.error.errors
            .map((e) => `  • ${e.path.join('.')}: ${e.message}`)
            .join('\n');
        throw new Error('\n❌ Environment validation failed:\n' + formatted + '\n');
    }

    return result.data;
}

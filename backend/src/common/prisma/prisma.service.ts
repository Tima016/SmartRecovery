import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Evidence fields that must NEVER be overwritten after initial creation (write-once policy)
const IMMUTABLE_EVIDENCE_FIELDS = [
    'md5', 'sha1', 'sha256', 'sha512',
    'encryptedKey', 'ivHex', 'authTagHex',
];

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    constructor() {
        super({
            log: [
                { emit: 'event', level: 'error' },
                { emit: 'event', level: 'warn' },
            ],
        });

        // ── Immutable evidence write-once guard ──────────────────────────────
        // Intercepts every `evidence.update` and `evidence.updateMany` call at
        // the Prisma middleware layer and strips out hash/crypto fields.
        (this as any).$use(async (params: any, next: (p: any) => Promise<any>) => {
            if (params.model === 'Evidence') {
                if (params.action === 'update' || params.action === 'updateMany') {
                    const data = params.args?.data ?? {};
                    let blocked = false;
                    for (const field of IMMUTABLE_EVIDENCE_FIELDS) {
                        if (field in data) {
                            delete data[field];
                            blocked = true;
                        }
                    }
                    if (blocked) {
                        this.logger.warn(
                            `[ImmutablePolicy] Blocked attempt to mutate immutable evidence fields (action=${params.action})`,
                        );
                    }
                }
            }
            return next(params);
        });

        // ── Slow query detection ──────────────────────────────────────────────
        (this as any).$on('query', (e: any) => {
            if (e.duration > 500) {
                this.logger.warn(`Slow query detected (${e.duration}ms): ${e.query}`);
            }
        });

        (this as any).$on('error', (e: any) => {
            this.logger.error(`Prisma error event: ${e.message}`);
        });
    }

    async onModuleInit() {
        await this.$connect();
        this.logger.log('Prisma connected to PostgreSQL');
    }

    async onModuleDestroy() {
        await this.$disconnect();
        this.logger.log('Prisma disconnected');
    }

    /** For integration tests only — never allowed in production */
    async cleanDatabase() {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('cleanDatabase() is not allowed in production');
        }
        const models = Object.keys(this).filter(
            (key) => !key.startsWith('_') && !key.startsWith('$'),
        );
        for (const model of models) {
            await (this as any)[model].deleteMany();
        }
    }
}

import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { validateEnv } from './config/env.validation';

import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { MinioModule } from './common/minio/minio.module';
import { HealthModule } from './common/health/health.module';
import { AppLoggerModule } from './common/logger/logger.module';
import { RedlockModule } from './common/redlock/redlock.module';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CasesModule } from './modules/cases/cases.module';
import { EvidenceModule } from './modules/evidence/evidence.module';
import { CustodyModule } from './modules/custody/custody.module';
import { ImagingModule } from './modules/imaging/imaging.module';
import { ArtifactsModule } from './modules/artifacts/artifacts.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AuditModule } from './modules/audit/audit.module';
import { EventsModule } from './modules/events/events.module';

import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { SecurityAuditMiddleware } from './common/middleware/security-audit.middleware';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { UserRateLimitGuard } from './common/guards/rate-limit.guard';
import { RecoveryModule } from './modules/recovery/recovery.module';
import { CorrelationModule } from './modules/correlation/correlation.module';
import { VisualizationModule } from './modules/visualization/visualization.module';
import { FileSystemModule } from './modules/filesystem/filesystem.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { QueueDashboardModule } from './common/queue-dashboard/queue-dashboard.module';
import { TagsModule } from './modules/tags/tags.module';
import { NotesModule } from './modules/notes/notes.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';

@Module({
    imports: [
        // ── Config + Env validation ────────────────────
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
            validate: validateEnv,
        }),

        // ── Structured logging ─────────────────────────
        AppLoggerModule,

        // ── NestJS throttler (fallback / ingress-level only — Redis-backed guard is primary) ──
        ThrottlerModule.forRoot([
            { name: 'short', ttl: 1000, limit: 10 },
            { name: 'medium', ttl: 10000, limit: 50 },
            { name: 'long', ttl: 60000, limit: 200 },
        ]),

        // ── Scheduled tasks ────────────────────────────
        ScheduleModule.forRoot(),

        // ── Core infrastructure ────────────────────────
        PrismaModule,
        RedisModule,
        MinioModule,
        HealthModule,
        RedlockModule,
        MetricsModule,

        // ── Feature modules ────────────────────────────
        AuthModule,
        UsersModule,
        CasesModule,
        EvidenceModule,
        CustodyModule,
        ImagingModule,
        ArtifactsModule,
        TimelineModule,
        ReportsModule,
        AuditModule,
        RecoveryModule,
        CorrelationModule,
        VisualizationModule,
        FileSystemModule,
        EventsModule,
        QueueDashboardModule,
        TagsModule,
        NotesModule,
        WorkspaceModule,
    ],
    providers: [
        // Global exception filter — structured JSON error responses with correlationId
        { provide: APP_FILTER, useClass: GlobalHttpExceptionFilter },
        // Global per-user Redis-backed rate limit guard
        { provide: APP_GUARD, useClass: UserRateLimitGuard },
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply(CorrelationIdMiddleware, SecurityAuditMiddleware)
            .forRoutes('*');
    }
}

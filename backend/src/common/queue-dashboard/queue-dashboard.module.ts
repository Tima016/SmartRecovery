import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';

/**
 * Bull Board Queue Dashboard Module
 *
 * Exposes an admin-only queue monitoring UI at /admin/queues.
 * Protected by basic auth middleware — only ADMIN users can access.
 */
@Module({})
export class QueueDashboardModule implements NestModule {
    private serverAdapter: ExpressAdapter;

    constructor(private configService: ConfigService) {
        const connection = {
            host: configService.get<string>('REDIS_HOST', 'localhost'),
            port: configService.get<number>('REDIS_PORT', 6379),
            password: configService.get<string>('REDIS_PASSWORD'),
        };

        // Register all platform queues
        const imagingQueue = new Queue('imaging-queue', { connection });
        const recoveryQueue = new Queue('recovery-jobs', { connection });

        this.serverAdapter = new ExpressAdapter();
        this.serverAdapter.setBasePath('/admin/queues');

        createBullBoard({
            queues: [
                new BullMQAdapter(imagingQueue),
                new BullMQAdapter(recoveryQueue),
            ],
            serverAdapter: this.serverAdapter,
        });
    }

    configure(consumer: MiddlewareConsumer) {
        // Mount Bull Board Express router at /admin/queues
        consumer
            .apply(this.serverAdapter.getRouter())
            .forRoutes('/admin/queues');
    }
}

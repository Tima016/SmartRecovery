import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

@Global()
@Module({
    imports: [ConfigModule],
    providers: [
        {
            provide: 'REDIS_CLIENT',
            useFactory: async (configService: ConfigService) => {
                const { default: Redis } = await import('ioredis');
                const client = new Redis({
                    host: configService.get<string>('REDIS_HOST', 'localhost'),
                    port: configService.get<number>('REDIS_PORT', 6379),
                    password: configService.get<string>('REDIS_PASSWORD'),
                    maxRetriesPerRequest: null,
                    retryStrategy: (times) => Math.min(times * 50, 2000),
                });
                return client;
            },
            inject: [ConfigService],
        },
        RedisService,
    ],
    exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule { }

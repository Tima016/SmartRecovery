import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class RedisIoAdapter extends IoAdapter {
    private adapterConstructor: ReturnType<typeof createAdapter>;

    constructor(private app: INestApplicationContext) {
        super(app);
    }

    async connectToRedis(): Promise<void> {
        const configService = this.app.get(ConfigService);
        const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');

        const pubClient = new Redis(redisUrl);
        const subClient = pubClient.duplicate();

        await Promise.all([
            new Promise<void>((resolve) => pubClient.on('ready', resolve)),
            new Promise<void>((resolve) => subClient.on('ready', resolve)),
        ]);

        this.adapterConstructor = createAdapter(pubClient, subClient);
    }

    createIOServer(port: number, options?: ServerOptions): any {
        const server = super.createIOServer(port, {
            ...options,
            cors: {
                origin: '*', // We handle CORS primarily at Nginx layer or main.ts layer, but ensure WebSockets pass
                methods: ['GET', 'POST'],
                credentials: true,
            },
        });
        server.adapter(this.adapterConstructor);
        return server;
    }
}

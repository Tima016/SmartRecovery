import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { verifyAccessToken } from '../../utils/jwt.util';

// UUID v4 regex for validating caseId parameters
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
@WebSocketGateway({
    cors: {
        origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
            // Allow configured origins, or localhost in development
            const allowed = (process.env.CORS_ORIGINS || 'http://localhost:7000,http://localhost:5173')
                .split(',')
                .map(s => s.trim());
            if (!origin || allowed.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`WebSocket origin ${origin} not allowed`));
            }
        },
        credentials: true,
    },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(EventsGateway.name);
    private subscriberClient: Redis;

    constructor(private configService: ConfigService) {
        this.subscriberClient = new Redis({
            host: this.configService.get<string>('REDIS_HOST', 'localhost'),
            port: this.configService.get<number>('REDIS_PORT', 6379),
            password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
            maxRetriesPerRequest: null,
        });

        this.subscriberClient.subscribe('case-events', (err) => {
            if (err) this.logger.error('Failed to subscribe to case-events', err);
            else this.logger.log('Subscribed to Redis case-events channel');
        });

        this.subscriberClient.on('message', (channel, message) => {
            if (channel === 'case-events') {
                try {
                    const payload = JSON.parse(message);
                    if (payload.caseId) {
                        // Broadcast only to clients subscribed to this case
                        this.server.to(`case_${payload.caseId}`).emit(payload.event, payload);
                    } else {
                        // Global broadcast
                        this.server.emit(payload.event, payload);
                    }
                } catch (e) {
                    this.logger.error('Failed to parse Redis message', e);
                }
            }
        });
    }

    // ─── Graceful shutdown ──────────────────────────────────────────────
    async onModuleDestroy() {
        await this.subscriberClient.unsubscribe('case-events');
        await this.subscriberClient.quit();
        this.logger.log('Redis subscriber disconnected gracefully');
    }

    // ─── JWT Authentication on connection ──────────────────────────────
    handleConnection(client: Socket) {
        try {
            const token =
                client.handshake.auth?.token ||
                client.handshake.headers?.authorization?.replace('Bearer ', '');

            if (!token) {
                this.logger.warn(`Client ${client.id} rejected — no auth token`);
                client.emit('auth_error', { message: 'Authentication required' });
                client.disconnect(true);
                return;
            }

            const payload = verifyAccessToken(token);
            // Attach user info to socket for later authorization checks
            (client as any).user = {
                id: payload.sub,
                email: payload.email,
                role: payload.role,
            };

            this.logger.log(`Client ${client.id} authenticated as ${payload.email}`);
        } catch (err: any) {
            this.logger.warn(`Client ${client.id} rejected — invalid token: ${err.message}`);
            client.emit('auth_error', { message: 'Invalid or expired token' });
            client.disconnect(true);
        }
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    // ─── Case room management (with validation) ────────────────────────
    @SubscribeMessage('join_case')
    handleJoinCase(client: Socket, caseId: string) {
        // Validate caseId is a proper UUID
        if (!caseId || typeof caseId !== 'string' || !UUID_REGEX.test(caseId)) {
            return { event: 'error', data: 'Invalid case ID format' };
        }

        // Verify client is authenticated (belt-and-suspenders check)
        if (!(client as any).user) {
            return { event: 'error', data: 'Not authenticated' };
        }

        client.join(`case_${caseId}`);
        this.logger.log(`Client ${client.id} (${(client as any).user.email}) joined case_${caseId}`);
        return { event: 'joined', data: caseId };
    }

    @SubscribeMessage('leave_case')
    handleLeaveCase(client: Socket, caseId: string) {
        if (!caseId || typeof caseId !== 'string' || !UUID_REGEX.test(caseId)) {
            return { event: 'error', data: 'Invalid case ID format' };
        }

        client.leave(`case_${caseId}`);
        this.logger.log(`Client ${client.id} left case_${caseId}`);
        return { event: 'left', data: caseId };
    }
}

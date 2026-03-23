import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

@Module({
    imports: [
        PinoLoggerModule.forRootAsync({
            useFactory: () => {
                const isDev = process.env.NODE_ENV !== 'production';
                return {
                    pinoHttp: {
                        level: isDev ? 'debug' : 'info',
                        transport: isDev
                            ? {
                                target: 'pino-pretty',
                                options: {
                                    colorize: true,
                                    translateTime: 'SYS:standard',
                                    ignore: 'pid,hostname',
                                    singleLine: false,
                                },
                            }
                            : undefined,
                        // Redact sensitive fields from all log entries
                        redact: {
                            paths: [
                                'req.headers.authorization',
                                'req.headers.cookie',
                                'req.body.password',
                                'req.body.currentPassword',
                                'req.body.newPassword',
                                'req.body.totpCode',
                                'req.body.refreshToken',
                            ],
                            remove: true,
                        },
                        // Attach correlationId to every log line
                        customProps: (req: any) => ({
                            correlationId: req.headers['x-correlation-id'] ?? req.id,
                        }),
                        // Custom log levels for HTTP responses
                        customLogLevel: (_req: any, res: any, err: any) => {
                            if (err || res.statusCode >= 500) return 'error';
                            if (res.statusCode >= 400) return 'warn';
                            return 'info';
                        },
                        // Serializers: trim verbose request/response objects
                        serializers: {
                            req(req: any) {
                                return {
                                    id: req.id,
                                    method: req.method,
                                    url: req.url,
                                    ip: req.remoteAddress,
                                    'user-agent': req.headers?.['user-agent'],
                                    correlationId: req.headers?.['x-correlation-id'],
                                };
                            },
                            res(res: any) {
                                return { statusCode: res.statusCode };
                            },
                        },
                    },
                };
            },
        }),
    ],
    exports: [PinoLoggerModule],
})
export class AppLoggerModule { }

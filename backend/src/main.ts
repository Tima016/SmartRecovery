import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import * as compression from 'compression';
import helmet from 'helmet';
import 'reflect-metadata';

// Global BigInt → JSON serialization (Prisma returns BigInt for large numeric fields)
// Without this, JSON.stringify throws: "Do not know how to serialize a BigInt"
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        // Use Pino for all NestJS internal logs
        bufferLogs: true,
    });

    // ─── Replace NestJS logger with Pino ─────────────────────────────────
    app.useLogger(app.get(Logger));

    // ─── Security headers (hardened Helmet) ──────────────────────────────
    app.use(
        helmet({
            // Strict Content-Security-Policy
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", 'data:'],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"],
                },
            },
            // HTTP Strict Transport Security — 1 year, include subdomains
            hsts: {
                maxAge: 31_536_000,
                includeSubDomains: true,
                preload: true,
            },
            // Prevent MIME type sniffing
            noSniff: true,
            // Deny framing (clickjacking)
            frameguard: { action: 'deny' },
            // Prevent IE from opening downloads in site context
            ieNoOpen: true,
            // Don't send Referer header cross-origin
            referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
            // Remove X-Powered-By
            hidePoweredBy: true,
            // Enable XSS filter in older browsers
            xssFilter: true,
            // Cross-Origin policies
            crossOriginEmbedderPolicy: false,     // relaxed: allows MinIO signed URLs
            crossOriginOpenerPolicy: { policy: 'same-origin' },
            crossOriginResourcePolicy: { policy: 'cross-origin' },
            // Permissions-Policy
            permittedCrossDomainPolicies: { permittedPolicies: 'none' },
        }),
    );

    // ─── Response compression ─────────────────────────────────────────────
    app.use(compression());

    // ─── CORS ─────────────────────────────────────────────────────────────
    const rawOrigins = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
    app.enableCors({
        origin: rawOrigins.length ? rawOrigins : false,   // false = reject all cross-origin in prod if unset
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Correlation-ID',
            'X-Request-ID',
        ],
        exposedHeaders: ['X-Correlation-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    });

    // ─── Global API prefix ────────────────────────────────────────────────
    app.setGlobalPrefix('api/v1');

    // ─── Strict validation ────────────────────────────────────────────────
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,                 // Strip unknown properties
            forbidNonWhitelisted: true,      // Throw on unknown properties
            transform: true,                 // Auto-transform to DTO types
            transformOptions: { enableImplicitConversion: true },
            stopAtFirstError: false,         // Return ALL validation errors
            disableErrorMessages: process.env.NODE_ENV === 'production',  // No field hints in prod
        }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    // ─── Graceful shutdown hooks ──────────────────────────────────────────
    app.enableShutdownHooks();

    // ─── Swagger / OpenAPI ────────────────────────────────────────────────
    if (process.env.NODE_ENV !== 'production') {
        const config = new DocumentBuilder()
            .setTitle('DFIP — Digital Forensic Investigation Platform')
            .setDescription(
                'Enterprise forensic platform: evidence management, chain of custody, disk imaging, artifact extraction, and reporting.',
            )
            .setVersion('1.0.0')
            .addBearerAuth(
                { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
                'access-token',
            )
            .addTag('Auth', 'Authentication & 2FA')
            .addTag('Cases', 'Case management')
            .addTag('Evidence', 'Evidence upload and management')
            .addTag('Custody', 'Chain of custody records')
            .addTag('Imaging', 'Disk imaging jobs')
            .addTag('Artifacts', 'Digital artifact extraction')
            .addTag('Timeline', 'Forensic timeline')
            .addTag('Reports', 'Report generation')
            .addTag('Audit', 'Immutable audit logs')
            .addTag('Health', 'System health & readiness')
            .build();

        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('api/docs', app, document, {
            swaggerOptions: { persistAuthorization: true },
        });
    }

    // ─── Start listening ──────────────────────────────────────────────────
    const port = parseInt(process.env.PORT ?? '5000', 10);
    await app.listen(port, '0.0.0.0');

    const pinoLogger = app.get(Logger);
    pinoLogger.log(
        `🚀 DFIP Backend listening on 0.0.0.0:${port} [NODE_ENV=${process.env.NODE_ENV ?? 'development'}]`,
        'Bootstrap',
    );
}

bootstrap().catch((err) => {
    console.error('Fatal error during bootstrap:', err);
    process.exit(1);
});

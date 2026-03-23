import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

export interface ErrorResponse {
    statusCode: number;
    error: string;
    message: string | string[];
    correlationId: string;
    path: string;
    timestamp: string;
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger('ExceptionFilter');

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const request = ctx.getRequest<Request>();
        const response = ctx.getResponse<Response>();

        let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        let message: string | string[] = 'Internal server error';
        let error = 'InternalServerError';

        if (exception instanceof HttpException) {
            statusCode = exception.getStatus();
            const exceptionResponse = exception.getResponse();

            if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
                const resp = exceptionResponse as any;
                message = resp.message ?? exception.message;
                error = resp.error ?? exception.name;
            } else {
                message = exception.message;
                error = exception.name;
            }
        } else if (exception instanceof Error) {
            // Non-HTTP errors: log full stack, return generic 500
            this.logger.error({
                msg: 'Unhandled exception',
                error: exception.message,
                stack: exception.stack,
                correlationId: (request as any).correlationId,
                url: request.url,
                method: request.method,
            });
        }

        // Never leak internal details in production
        if (process.env.NODE_ENV === 'production' && statusCode === 500) {
            message = 'An unexpected error occurred. Please try again later.';
        }

        const body: ErrorResponse = {
            statusCode,
            error,
            message,
            correlationId: (request as any).correlationId ?? 'unknown',
            path: request.url,
            timestamp: new Date().toISOString(),
        };

        if (statusCode >= 500) {
            this.logger.error(`[${statusCode}] ${request.method} ${request.url} — ${message}`);
        } else if (statusCode >= 400) {
            this.logger.warn(`[${statusCode}] ${request.method} ${request.url} — ${message}`);
        }

        response.status(statusCode).json(body);
    }
}

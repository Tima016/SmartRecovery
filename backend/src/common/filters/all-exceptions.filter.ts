import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let stack = undefined;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse();
            message = typeof res === 'string' ? res : (res as any).message || res;
        } else if (exception instanceof Error) {
            message = exception.message;
            stack = exception.stack;
        }

        // Always log the error details explicitly on the backend
        this.logger.error(
            `[${request.method}] ${request.url} - Status: ${status} - Error: ${message}`,
            stack || exception,
        );

        // Standardize the JSON error response sent to the frontend
        response.status(status).json({
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            message: Array.isArray(message) ? message[0] : message, // Flatten class-validator arrays
        });
    }
}

import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { SkipRateLimit } from '../decorators/rate-limit.decorator';
import { Public } from '../decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
    constructor(private readonly healthService: HealthService) { }

    /** Lightweight liveness probe — always returns 200 if the process is running */
    @Get()
    @Public()
    @SkipRateLimit()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Liveness probe' })
    liveness() {
        return { status: 'ok', timestamp: new Date().toISOString(), uptime: Math.floor(process.uptime()) };
    }

    /** Deep readiness probe — tests DB write, Redis SET/GET, MinIO bucket */
    @Get('ready')
    @Public()
    @SkipRateLimit()
    @ApiOperation({ summary: 'Deep readiness probe (DB + Redis + MinIO)' })
    @ApiResponse({ status: 200, description: 'All dependencies healthy' })
    @ApiResponse({ status: 503, description: 'One or more dependencies unhealthy' })
    async readiness() {
        return this.healthService.deepCheck();
    }
}


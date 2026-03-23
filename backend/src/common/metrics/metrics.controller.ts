/**
 * Prometheus Metrics Controller
 *
 * Exposes GET /metrics endpoint for Prometheus scraping.
 * Unguarded — Prometheus scraper does not send JWT tokens.
 * In production, protect with network-level access control (e.g., Kubernetes NetworkPolicy).
 */

import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { MetricsService } from './metrics.service';
import { Public } from '../decorators/public.decorator';

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
    constructor(private readonly metricsService: MetricsService) { }

    @Get()
    @Public()
    @ApiOperation({ summary: 'Prometheus metrics endpoint' })
    async getMetrics(@Res() res: Response): Promise<void> {
        const metrics = await this.metricsService.getMetrics();
        res.set('Content-Type', this.metricsService.getContentType());
        res.end(metrics);
    }
}

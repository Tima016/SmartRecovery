/**
 * Prometheus Metrics Service
 *
 * Centralizes all application metrics. Provides:
 *   - Histograms: recovery_duration_seconds, fragment_linking_seconds, correlation_compute_seconds
 *   - Gauges: worker_memory_bytes, active_recovery_jobs
 *   - Counters: recovery_errors_total, carved_files_total, correlations_computed_total
 *
 * Usage: inject MetricsService, call observe/inc/set methods.
 */

import { Injectable } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService {
    private readonly registry: client.Registry;

    // ── Histograms ──────────────────────────────────────────────────
    readonly recoveryDuration: client.Histogram;
    readonly fragmentLinkingDuration: client.Histogram;
    readonly correlationComputeDuration: client.Histogram;
    readonly httpRequestDuration: client.Histogram;

    // ── Gauges ──────────────────────────────────────────────────────
    readonly workerMemoryBytes: client.Gauge;
    readonly activeRecoveryJobs: client.Gauge;

    // ── Counters ────────────────────────────────────────────────────
    readonly recoveryErrorsTotal: client.Counter;
    readonly carvedFilesTotal: client.Counter;
    readonly correlationsComputedTotal: client.Counter;
    readonly fragmentsLinkedTotal: client.Counter;

    constructor() {
        this.registry = new client.Registry();

        // Collect default Node.js metrics (GC, event loop, heap, etc.)
        client.collectDefaultMetrics({ register: this.registry });

        this.recoveryDuration = new client.Histogram({
            name: 'dfip_recovery_duration_seconds',
            help: 'Time to complete a recovery job',
            labelNames: ['method', 'status'],
            buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
            registers: [this.registry],
        });

        this.fragmentLinkingDuration = new client.Histogram({
            name: 'dfip_fragment_linking_seconds',
            help: 'Time to link fragments into groups',
            labelNames: ['fragment_count_bucket'],
            buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
            registers: [this.registry],
        });

        this.correlationComputeDuration = new client.Histogram({
            name: 'dfip_correlation_compute_seconds',
            help: 'Time to compute correlations for a case',
            labelNames: ['event_count_bucket'],
            buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
            registers: [this.registry],
        });

        this.httpRequestDuration = new client.Histogram({
            name: 'dfip_http_request_duration_seconds',
            help: 'HTTP request duration',
            labelNames: ['method', 'route', 'status_code'],
            buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
            registers: [this.registry],
        });

        this.workerMemoryBytes = new client.Gauge({
            name: 'dfip_worker_memory_bytes',
            help: 'Worker process heap used bytes',
            registers: [this.registry],
        });

        this.activeRecoveryJobs = new client.Gauge({
            name: 'dfip_active_recovery_jobs',
            help: 'Currently running recovery jobs',
            registers: [this.registry],
        });

        this.recoveryErrorsTotal = new client.Counter({
            name: 'dfip_recovery_errors_total',
            help: 'Total recovery job errors',
            labelNames: ['method'],
            registers: [this.registry],
        });

        this.carvedFilesTotal = new client.Counter({
            name: 'dfip_carved_files_total',
            help: 'Total files carved from evidence',
            labelNames: ['signature'],
            registers: [this.registry],
        });

        this.correlationsComputedTotal = new client.Counter({
            name: 'dfip_correlations_computed_total',
            help: 'Total correlations computed',
            registers: [this.registry],
        });

        this.fragmentsLinkedTotal = new client.Counter({
            name: 'dfip_fragments_linked_total',
            help: 'Total fragments linked into groups',
            registers: [this.registry],
        });
    }

    /** Get Prometheus text format metrics */
    async getMetrics(): Promise<string> {
        // Update memory gauge on each scrape
        const mem = process.memoryUsage();
        this.workerMemoryBytes.set(mem.heapUsed);
        return this.registry.metrics();
    }

    /** Get content type for Prometheus scrape */
    getContentType(): string {
        return this.registry.contentType;
    }
}

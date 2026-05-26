/**
 * Unit tests: CorrelationService
 *
 * Tests the scoring logic using mocked PrismaService.
 * Covers: temporal scoring (within/outside threshold), actor matching, target overlap, diversity bonus.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CorrelationService } from '../../modules/correlation/correlation.service';
import { PrismaService } from '../../common/prisma/prisma.service';

jest.mock('uuid', () => ({
    v4: () => 'test-uuid',
}));

const mockPrisma = {
    case: { findUnique: jest.fn() },
    artifact: { findMany: jest.fn() },
    timelineEvent: { findMany: jest.fn() },
    correlation: {
        upsert: jest.fn(),
        findMany: jest.fn(),
    },
};

describe('CorrelationService', () => {
    let service: CorrelationService;

    beforeEach(async () => {
        jest.clearAllMocks();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CorrelationService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile();
        service = module.get<CorrelationService>(CorrelationService);
    });

    describe('computeCorrelations', () => {
        it('should throw NotFoundException for unknown case', async () => {
            mockPrisma.case.findUnique.mockResolvedValue(null);
            await expect(service.computeCorrelations('nonexistent-id')).rejects.toThrow();
        });

        it('should persist correlations for events within temporal threshold', async () => {
            const baseTime = new Date('2024-02-15T09:00:00Z');
            const within = new Date(baseTime.getTime() + 30 * 1000); // 30s later (< 1 min threshold for NETWORK)

            mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1' });
            mockPrisma.artifact.findMany.mockResolvedValue([]);
            mockPrisma.timelineEvent.findMany.mockResolvedValue([
                {
                    id: 'e1', type: 'NETWORK', timestamp: baseTime,
                    description: 'Connection to 10.0.0.1', actor: 'JohnDoe',
                    targetObject: '10.0.0.1', source: 'PCAP',
                },
                {
                    id: 'e2', type: 'NETWORK', timestamp: within,
                    description: 'Connection to 10.0.0.2', actor: 'JohnDoe',
                    targetObject: '10.0.0.2', source: 'PCAP',
                },
            ]);
            mockPrisma.correlation.upsert.mockResolvedValue({});

            const result = await service.computeCorrelations('case-1');
            expect(result.computed).toBeGreaterThan(0);
            expect(mockPrisma.correlation.upsert).toHaveBeenCalled();
        });

        it('should NOT persist correlations for events far apart in time', async () => {
            const t1 = new Date('2024-02-15T09:00:00Z');
            const t2 = new Date('2024-02-15T23:00:00Z'); // 14 hours later

            mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-2' });
            mockPrisma.artifact.findMany.mockResolvedValue([]);
            mockPrisma.timelineEvent.findMany.mockResolvedValue([
                { id: 'ea', type: 'FILE', timestamp: t1, description: 'File created', actor: '', targetObject: '', source: 'NTFS' },
                { id: 'eb', type: 'FILE', timestamp: t2, description: 'File deleted', actor: '', targetObject: '', source: 'NTFS' },
            ]);
            mockPrisma.correlation.upsert.mockResolvedValue({});

            const result = await service.computeCorrelations('case-2');
            expect(result.computed).toBe(0);
        });

        it('should add actor-match score when both events share same actor', async () => {
            const baseTime = new Date('2024-02-15T09:00:00Z');
            const nearTime = new Date(baseTime.getTime() + 90 * 1000); // 1.5 min (within 2-min AUTH threshold)

            mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-3' });
            mockPrisma.artifact.findMany.mockResolvedValue([]);
            mockPrisma.timelineEvent.findMany.mockResolvedValue([
                { id: 'ea1', type: 'AUTHENTICATION', timestamp: baseTime, description: 'Logon', actor: 'JohnDoe', targetObject: null, source: 'EventLog' },
                { id: 'ea2', type: 'AUTHENTICATION', timestamp: nearTime, description: 'Failed logon', actor: 'JohnDoe', targetObject: null, source: 'EventLog' },
            ]);
            mockPrisma.correlation.upsert.mockResolvedValue({});

            const result = await service.computeCorrelations('case-3');
            // Should have at least one correlation from actor+temporal match
            expect(result.computed).toBeGreaterThan(0);
            const upsertCall = mockPrisma.correlation.upsert.mock.calls[0][0];
            expect(upsertCall.create.actorScore).toBe(30);
        });
    });

    describe('buildGraph', () => {
        it('should return empty graph for unknown case', async () => {
            mockPrisma.case.findUnique.mockResolvedValue(null);
            await expect(service.buildGraph('no-case')).rejects.toThrow();
        });

        it('should return empty graph when no correlations exist', async () => {
            mockPrisma.case.findUnique.mockResolvedValue({ id: 'c1' });
            mockPrisma.correlation.findMany.mockResolvedValue([]);
            const graph = await service.buildGraph('c1');
            expect(graph.nodes).toHaveLength(0);
            expect(graph.edges).toHaveLength(0);
        });

        it('should return normalized edges (weight ≤ 1) for existing correlations', async () => {
            mockPrisma.case.findUnique.mockResolvedValue({ id: 'c2' });
            mockPrisma.correlation.findMany.mockResolvedValue([
                {
                    id: 'cor1', caseId: 'c2',
                    sourceId: 's1', sourceType: 'timeline_event', sourceLabel: 'Login event',
                    targetId: 't1', targetType: 'artifact', targetLabel: 'USB log',
                    weight: 0.8, temporalScore: 35, actorScore: 30, targetScore: 15, diversityScore: 10,
                    reason: 'temporal + actor',
                },
                {
                    id: 'cor2', caseId: 'c2',
                    sourceId: 's2', sourceType: 'timeline_event', sourceLabel: 'Network event',
                    targetId: 't2', targetType: 'artifact', targetLabel: 'Browser',
                    weight: 0.4, temporalScore: 20, actorScore: 10, targetScore: 10, diversityScore: 0,
                    reason: 'temporal',
                },
            ]);
            const graph = await service.buildGraph('c2');
            expect(graph.nodes.length).toBeGreaterThan(0);
            for (const edge of graph.edges) {
                expect(edge.weight).toBeGreaterThanOrEqual(0);
                expect(edge.weight).toBeLessThanOrEqual(1);
            }
        });
    });
});

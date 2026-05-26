/**
 * Unit tests: TimelineService
 *
 * Tests timeline synthesis from artifacts, sorting, and type mapping.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TimelineService } from '../../modules/timeline/timeline.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TimelineEventType } from '@prisma/client';

jest.mock('uuid', () => ({
    v4: () => 'test-uuid',
}));

const mockPrisma = {
    case: { findUnique: jest.fn() },
    timelineEvent: {
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
    },
    artifact: { findMany: jest.fn() },
};

describe('TimelineService', () => {
    let service: TimelineService;

    beforeEach(async () => {
        jest.clearAllMocks();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TimelineService,
                { provide: PrismaService, useValue: mockPrisma },
            ],
        }).compile();
        service = module.get<TimelineService>(TimelineService);
    });

    describe('getTimeline', () => {
        it('should throw NotFoundException for unknown case', async () => {
            mockPrisma.case.findUnique.mockResolvedValue(null);
            await expect(service.getTimeline('nonexistent')).rejects.toThrow();
        });

        it('should return sorted timeline events', async () => {
            const events = [
                { id: 'e3', timestamp: new Date('2024-02-15T10:00:00Z'), type: TimelineEventType.FILE },
                { id: 'e1', timestamp: new Date('2024-02-15T08:00:00Z'), type: TimelineEventType.AUTHENTICATION },
                { id: 'e2', timestamp: new Date('2024-02-15T09:00:00Z'), type: TimelineEventType.USB },
            ];
            mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1' });
            // Simulate Prisma returning ordered results (our query uses orderBy timestamp asc)
            mockPrisma.timelineEvent.findMany.mockResolvedValue([...events].sort(
                (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
            ));

            const result = await service.getTimeline('case-1');
            expect(result.events[0].id).toBe('e1');
            expect(result.events[1].id).toBe('e2');
            expect(result.events[2].id).toBe('e3');
        });

        it('should include typeSummary for returned events', async () => {
            mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-2' });
            mockPrisma.timelineEvent.findMany.mockResolvedValue([
                { id: 'x1', timestamp: new Date(), type: TimelineEventType.FILE },
                { id: 'x2', timestamp: new Date(), type: TimelineEventType.FILE },
                { id: 'x3', timestamp: new Date(), type: TimelineEventType.NETWORK },
            ]);

            const result = await service.getTimeline('case-2');
            expect(result.typeSummary[TimelineEventType.FILE]).toBe(2);
            expect(result.typeSummary[TimelineEventType.NETWORK]).toBe(1);
        });
    });

    describe('synthesizeFromArtifacts', () => {
        it('should synthesize BROWSER_HISTORY entries into NETWORK events', async () => {
            mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-3' });
            mockPrisma.artifact.findMany.mockResolvedValue([
                {
                    id: 'art1', type: 'BROWSER_HISTORY', source: 'Chrome',
                    data: {
                        entries: [
                            { url: 'https://mega.nz/file/test', title: 'MEGA', visitTime: '2024-02-15T09:45:00Z', visitCount: 1 },
                            { url: 'https://google.com', title: 'Google', visitTime: '2024-02-15T10:00:00Z', visitCount: 5 },
                        ],
                    },
                },
            ]);
            mockPrisma.timelineEvent.create.mockResolvedValue({});

            const result = await service.synthesizeFromArtifacts('case-3', 'user-1');
            expect(result.created).toBe(2);
            // Mega URL should get high correlation score
            const megaCall = mockPrisma.timelineEvent.create.mock.calls.find(
                (call) => call[0].data.targetObject?.includes('mega'),
            );
            expect(megaCall[0].data.correlationScore).toBeGreaterThanOrEqual(80);
        });

        it('should synthesize USB_LOG entries into USB events', async () => {
            mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-4' });
            mockPrisma.artifact.findMany.mockResolvedValue([
                {
                    id: 'art2', type: 'USB_LOG', source: 'Registry',
                    data: {
                        entries: [
                            { deviceId: 'SanDisk_Ultra', serial: 'ABC123', firstConnected: '2024-02-15T08:00:00Z', driveLetter: 'E:' },
                        ],
                    },
                },
            ]);
            mockPrisma.timelineEvent.create.mockResolvedValue({});

            const result = await service.synthesizeFromArtifacts('case-4', 'user-1');
            expect(result.created).toBe(1);
            const usbCall = mockPrisma.timelineEvent.create.mock.calls[0];
            expect(usbCall[0].data.type).toBe(TimelineEventType.USB);
        });

        it('should assign high correlation score to suspicious PREFETCH files', async () => {
            mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-5' });
            mockPrisma.artifact.findMany.mockResolvedValue([
                {
                    id: 'art3', type: 'PREFETCH', source: 'C:\\Windows\\Prefetch',
                    data: {
                        entries: [
                            { filename: 'RSHELL.EXE-1A2B3C4D.pf', runCount: 3, lastRun: '2024-02-15T09:10:00Z' },
                            { filename: 'NOTEPAD.EXE-12345678.pf', runCount: 20, lastRun: '2024-02-15T10:00:00Z' },
                        ],
                    },
                },
            ]);
            mockPrisma.timelineEvent.create.mockResolvedValue({});

            await service.synthesizeFromArtifacts('case-5', 'user-1');
            const rshellCall = mockPrisma.timelineEvent.create.mock.calls.find(
                (call) => call[0].data.targetObject?.includes('RSHELL'),
            );
            const notepadCall = mockPrisma.timelineEvent.create.mock.calls.find(
                (call) => call[0].data.targetObject?.includes('NOTEPAD'),
            );
            expect(rshellCall[0].data.correlationScore).toBeGreaterThanOrEqual(85);
            expect(notepadCall[0].data.correlationScore).toBeLessThan(50);
        });
    });
});

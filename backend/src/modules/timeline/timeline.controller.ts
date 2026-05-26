import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TimelineEventType, UserRole } from '@prisma/client';
import { TimelineService } from './timeline.service';
import { DetectionService } from './detection.service';
import { TimelineFilterDto, CreateTimelineEventDto } from './dto/timeline.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Timeline')
@Controller('cases/:caseId/timeline')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class TimelineController {
    constructor(
        private readonly timelineService: TimelineService,
        private readonly detectionService: DetectionService,
    ) { }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Get forensic timeline for a case' })
    @ApiQuery({ name: 'type', required: false, enum: TimelineEventType })
    @ApiQuery({ name: 'from', required: false })
    @ApiQuery({ name: 'to', required: false })
    @ApiQuery({ name: 'source', required: false })
    @ApiQuery({ name: 'minCorrelation', required: false, type: Number })
    getTimeline(@Param('caseId') caseId: string, @Query() filters: TimelineFilterDto) {
        return this.timelineService.getTimeline(caseId, filters);
    }

    @Get('clusters')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Get activity clusters for timeline visualisation' })
    getClusters(@Param('caseId') caseId: string) {
        return this.timelineService.getClusters(caseId);
    }

    @Get('suspicious-events')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Get suspicious events detected for a case' })
    getSuspiciousEvents(@Param('caseId') caseId: string) {
        return this.detectionService.getSuspiciousEvents(caseId);
    }

    @Post('event')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Manually add a timeline event to a case' })
    addEvent(
        @Param('caseId') caseId: string,
        @Body() dto: CreateTimelineEventDto,
        @GetUser('id') userId: string,
    ) {
        return this.timelineService.addEvent(caseId, dto, userId);
    }

    @Post('synthesize')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Auto-synthesize timeline events from extracted artifacts' })
    synthesize(@Param('caseId') caseId: string, @GetUser('id') userId: string) {
        return this.timelineService.synthesizeFromArtifacts(caseId, userId);
    }

    @Post('cluster')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Run timeline clustering and persist results' })
    clusterTimeline(@Param('caseId') caseId: string) {
        return this.timelineService.clusterTimeline(caseId);
    }

    @Post('detect')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Run anomaly detection rules on case timeline' })
    detect(@Param('caseId') caseId: string) {
        return this.detectionService.runDetection(caseId);
    }

    @Post(':eventId/notes')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Add or update investigator note on a timeline event' })
    updateNote(
        @Param('caseId') caseId: string,
        @Param('eventId') eventId: string,
        @Body('notes') notes: string,
    ) {
        return this.timelineService.updateNote(caseId, eventId, notes);
    }
}

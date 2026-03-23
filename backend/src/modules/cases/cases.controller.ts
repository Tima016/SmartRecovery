import {
    Controller, Get, Post, Patch, Body, Param, Query,
    UseGuards, Req, HttpCode, HttpStatus, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CaseStatus, UserRole } from '@prisma/client';
import { Request } from 'express';
import { CasesService } from './cases.service';
import { CreateCaseDto, UpdateCaseDto, AssignCaseDto, AddCaseMemberDto } from './dto/cases.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { HeatmapService } from '../visualization/heatmap.service';
import { GlobalSearchService } from './global-search.service';

@ApiTags('Cases')
@Controller('cases')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class CasesController {
    constructor(
        private readonly casesService: CasesService,
        private readonly heatmapService: HeatmapService,
        private readonly globalSearchService: GlobalSearchService,
    ) { }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR)
    @ApiOperation({ summary: 'Create a new forensic case' })
    create(@Body() dto: CreateCaseDto, @GetUser('id') userId: string, @Req() req: Request) {
        return this.casesService.create(dto, userId, req.ip);
    }

    @Get()
    @ApiOperation({ summary: 'List all cases (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'status', required: false, enum: CaseStatus })
    @ApiQuery({ name: 'assignedToId', required: false })
    findAll(
        @Query('page') page = 1,
        @Query('limit') limit = 20,
        @Query('status') status?: CaseStatus,
        @Query('assignedToId') assignedToId?: string,
    ) {
        return this.casesService.findAll(+page, +limit, { status, assignedToId });
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get case details' })
    findOne(@Param('id') id: string) {
        return this.casesService.findOne(id);
    }

    @Get(':id/summary')
    @ApiOperation({ summary: 'Get case summary with statistics' })
    getSummary(@Param('id') id: string) {
        return this.casesService.getSummary(id);
    }

    @Patch(':id')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR)
    @ApiOperation({ summary: 'Update case details' })
    update(
        @Param('id') id: string,
        @Body() dto: UpdateCaseDto,
        @GetUser('id') userId: string,
        @Req() req: Request,
    ) {
        return this.casesService.update(id, dto, userId, req.ip);
    }

    @Patch(':id/close')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Close a case' })
    close(@Param('id') id: string, @GetUser('id') userId: string, @Req() req: Request) {
        return this.casesService.close(id, userId, req.ip);
    }

    @Post(':id/assign')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Assign an investigator to the case' })
    assign(
        @Param('id') id: string,
        @Body() dto: AssignCaseDto,
        @GetUser('id') userId: string,
        @Req() req: Request,
    ) {
        return this.casesService.assign(id, dto, userId, req.ip);
    }

    @Post(':id/members')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR)
    @ApiOperation({ summary: 'Add a member to the case with permissions' })
    addMember(
        @Param('id') id: string,
        @Body() dto: AddCaseMemberDto,
        @GetUser('id') userId: string,
    ) {
        return this.casesService.addMember(id, dto, userId);
    }

    @Get(':id/heatmap')
    @ApiOperation({ summary: 'Get disk entropy heatmap (2D grid) for case visualizer' })
    @ApiQuery({ name: 'resolution', required: false, type: Number, description: 'Max cells (default 1024)' })
    getHeatmap(
        @Param('id', ParseUUIDPipe) id: string,
        @Query('resolution') resolution?: number,
    ) {
        return this.heatmapService.buildHeatmap(id, resolution ? +resolution : 1024);
    }

    @Get(':id/filesystem')
    @ApiOperation({ summary: 'Lazy-loaded directory listing for Investigator File Explorer' })
    @ApiQuery({ name: 'parentId', required: false, type: String, description: 'Parent path to list, defaults to root "/"' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    getFileSystem(
        @Param('id') id: string,
        @Query('parentId') parentId?: string,
        @Query('page') page = 1,
        @Query('limit') limit = 100,
    ) {
        return this.casesService.getFileSystem(id, parentId || '/', +page, +limit);
    }

    @Get(':id/filesystem/deleted')
    @ApiOperation({ summary: 'Paginated deleted files listing for Investigator File Explorer' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    getDeletedFileSystem(
        @Param('id') id: string,
        @Query('page') page = 1,
        @Query('limit') limit = 100,
    ) {
        return this.casesService.getDeletedFileSystem(id, +page, +limit);
    }

    @Get(':id/audit')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.AUDITOR)
    @ApiOperation({ summary: 'Paginated Chain of Custody and Audit Trail' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    getAuditLogs(
        @Param('id') id: string,
        @Query('page') page = 1,
        @Query('limit') limit = 100,
    ) {
        return this.casesService.getAuditLogs(id, +page, +limit);
    }

    @Get(':id/global-search')
    @ApiOperation({ summary: 'Global investigation search across files, artifacts, timeline, notes, tags' })
    @ApiQuery({ name: 'q', required: true, type: String })
    globalSearch(
        @Param('id') id: string,
        @Query('q') q: string,
    ) {
        return this.globalSearchService.search(id, q || '');
    }
}

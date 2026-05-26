import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { ImagingService } from './imaging.service';
import { CreateImagingJobDto } from './dto/imaging.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Imaging')
@Controller('imaging')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class ImagingController {
    constructor(private readonly imagingService: ImagingService) { }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Create a new disk imaging job' })
    create(@Body() dto: CreateImagingJobDto, @GetUser('id') userId: string, @Req() req: Request) {
        return this.imagingService.createJob(dto, userId, req.ip);
    }

    @Post('start')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Start a new disk imaging job (alias for POST /imaging)' })
    start(@Body() dto: CreateImagingJobDto, @GetUser('id') userId: string, @Req() req: Request) {
        return this.imagingService.createJob(dto, userId, req.ip);
    }

    @Get()
    @ApiOperation({ summary: 'List imaging jobs' })
    @ApiQuery({ name: 'caseId', required: false })
    findAll(@Query('caseId') caseId?: string) {
        return this.imagingService.findAll(caseId);
    }

    @Get('sources')
    @ApiOperation({ summary: 'List available local disk sources (fixed + removable)' })
    @ApiQuery({ name: 'usbOnly', required: false })
    listSources(@Query('usbOnly') usbOnly?: string) {
        const onlyUsb = String(usbOnly ?? '').toLowerCase() === 'true';
        return this.imagingService.listSources(onlyUsb);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get imaging job details' })
    findOne(@Param('id') id: string) {
        return this.imagingService.findOne(id);
    }

    @Get(':id/progress')
    @ApiOperation({ summary: 'Get real-time imaging job progress' })
    getProgress(@Param('id') id: string) {
        return this.imagingService.getProgress(id);
    }

    @Patch(':id/pause')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Pause a running imaging job' })
    pause(@Param('id') id: string, @GetUser('id') userId: string, @Req() req: Request) {
        return this.imagingService.pause(id, userId, req.ip);
    }

    @Patch(':id/resume')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Resume a paused imaging job' })
    resume(@Param('id') id: string, @GetUser('id') userId: string, @Req() req: Request) {
        return this.imagingService.resume(id, userId, req.ip);
    }
}

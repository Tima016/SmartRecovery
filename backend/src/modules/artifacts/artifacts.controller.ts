import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ArtifactType, UserRole } from '@prisma/client';
import { Request } from 'express';
import { ArtifactsService } from './artifacts.service';
import { ExtractArtifactsDto } from './dto/artifacts.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Artifacts')
@Controller('cases/:caseId/artifacts')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class ArtifactsController {
    constructor(private readonly artifactsService: ArtifactsService) { }

    @Post('extract')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR)
    @ApiOperation({ summary: 'Extract digital artifacts from evidence (browser, USB, registry, event logs)' })
    extract(
        @Param('caseId') caseId: string,
        @Body() dto: ExtractArtifactsDto,
        @GetUser('id') userId: string,
        @Req() req: Request,
    ) {
        return this.artifactsService.extract(caseId, dto, userId, req.ip);
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.ANALYST, UserRole.AUDITOR)
    @ApiOperation({ summary: 'List artifacts for a case' })
    @ApiQuery({ name: 'type', required: false, enum: ArtifactType })
    findAll(@Param('caseId') caseId: string, @Query('type') type?: ArtifactType) {
        return this.artifactsService.findAll(caseId, type);
    }

    @Get(':id')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.ANALYST, UserRole.AUDITOR)
    @ApiOperation({ summary: 'Get artifact details with extracted data' })
    findOne(@Param('id') id: string) {
        return this.artifactsService.findOne(id);
    }
}

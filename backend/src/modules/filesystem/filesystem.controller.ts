import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { FileSystemService } from './filesystem.service';
import { ParseFileSystemDto, FileSystemQueryDto } from './dto/filesystem.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('cases/:caseId/filesystem')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FileSystemController {
    constructor(private readonly filesystemService: FileSystemService) { }

    @Post('parse')
    @Roles(UserRole.ADMIN, UserRole.USER)
    async parse(
        @Param('caseId') caseId: string,
        @Body() dto: ParseFileSystemDto,
    ) {
        return this.filesystemService.parseEvidence(caseId, dto.evidenceId);
    }

    @Get('search')
    @Roles(UserRole.ADMIN, UserRole.USER)
    async advancedSearch(
        @Param('caseId') caseId: string,
        @Query() query: any,
    ) {
        return this.filesystemService.advancedSearch(caseId, query);
    }

    @Get(':id/preview')
    @Roles(UserRole.ADMIN, UserRole.USER)
    async previewFile(
        @Param('caseId') caseId: string,
        @Param('id') fileId: string,
    ) {
        return this.filesystemService.previewFile(caseId, fileId);
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.USER)
    async getEntries(
        @Param('caseId') caseId: string,
        @Query() query: FileSystemQueryDto,
    ) {
        return this.filesystemService.getEntries(caseId, query);
    }

    @Get('deleted')
    @Roles(UserRole.ADMIN, UserRole.USER)
    async getDeleted(@Param('caseId') caseId: string) {
        return this.filesystemService.getDeletedEntries(caseId);
    }

    @Get('disk-info')
    @Roles(UserRole.ADMIN, UserRole.USER)
    async getDiskInfo(@Param('caseId') caseId: string) {
        return this.filesystemService.getDiskImageInfo(caseId);
    }
}

import { Controller, Post, Get, Delete, Body, Param, UseGuards, Req, Query } from '@nestjs/common';
import { TagsService } from './tags.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, EntityType } from '@prisma/client';

@Controller('tags')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TagsController {
    constructor(private readonly tagsService: TagsService) { }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.USER)
    async createTag(@Body() body: { caseId: string; name: string; color?: string }, @Req() req: any) {
        return this.tagsService.createTag(
            body.caseId,
            body.name,
            body.color || '#3b82f6',
            req.user.id,
            req.ip
        );
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.USER)
    async getTagsByCase(@Query('caseId') caseId: string) {
        if (!caseId) return [];
        return this.tagsService.getTagsByCase(caseId);
    }

    @Post('assign')
    @Roles(UserRole.ADMIN, UserRole.USER)
    async assignTag(@Body() body: { tagId: string; entityType: string; entityId: string }, @Req() req: any) {
        return this.tagsService.assignTag(
            body.tagId,
            body.entityType as EntityType,
            body.entityId,
            req.user.id,
            req.ip
        );
    }

    @Get('assigned/:entityType/:entityId')
    @Roles(UserRole.ADMIN, UserRole.USER)
    async getAssignedTags(
        @Param('entityType') entityType: string,
        @Param('entityId') entityId: string
    ) {
        return this.tagsService.getAssignedTags(entityType as EntityType, entityId);
    }

    @Delete('assign/:id')
    @Roles(UserRole.ADMIN, UserRole.USER)
    async removeAssignment(@Param('id') id: string, @Req() req: any) {
        return this.tagsService.removeAssignment(id, req.user.id, req.ip);
    }
}

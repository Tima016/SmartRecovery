import { Controller, Post, Get, Delete, Body, Param, Patch, UseGuards, Req } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, EntityType } from '@prisma/client';

@Controller('workspace/bookmarks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkspaceController {
    constructor(private readonly workspaceService: WorkspaceService) { }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.USER)
    async getBookmarks(@Req() req: any) {
        return this.workspaceService.getBookmarks(req.user.id);
    }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.USER)
    async addBookmark(
        @Body() body: { entityType: string; entityId: string; note?: string },
        @Req() req: any,
    ) {
        return this.workspaceService.addBookmark(
            body.entityType as EntityType,
            body.entityId,
            req.user.id,
            body.note,
            req.ip,
        );
    }

    @Patch(':id')
    @Roles(UserRole.ADMIN, UserRole.USER)
    async updateNote(
        @Param('id') id: string,
        @Body() body: { note: string },
        @Req() req: any,
    ) {
        return this.workspaceService.updateBookmarkNote(id, body.note, req.user.id);
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN, UserRole.USER)
    async removeBookmark(@Param('id') id: string, @Req() req: any) {
        return this.workspaceService.removeBookmark(id, req.user.id, req.ip);
    }
}

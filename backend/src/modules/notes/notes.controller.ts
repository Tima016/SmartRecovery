import { Controller, Post, Get, Put, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, EntityType } from '@prisma/client';

@Controller('notes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotesController {
    constructor(private readonly notesService: NotesService) { }

    @Post()
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.ANALYST)
    async createNote(
        @Body() body: { entityType: string; entityId: string; content: string; isPinned?: boolean },
        @Req() req: any,
    ) {
        return this.notesService.createNote(
            body.entityType as EntityType,
            body.entityId,
            body.content,
            req.user.id,
            req.ip,
            body.isPinned ?? false,
        );
    }

    @Get(':entityType/:entityId')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.ANALYST, UserRole.AUDITOR)
    async getNotes(
        @Param('entityType') entityType: string,
        @Param('entityId') entityId: string,
    ) {
        return this.notesService.getNotes(entityType as EntityType, entityId);
    }

    @Put(':id')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.ANALYST)
    async updateNote(
        @Param('id') id: string,
        @Body() body: { content: string },
        @Req() req: any,
    ) {
        return this.notesService.updateNote(id, body.content, req.user.id, req.ip);
    }

    @Patch(':id/pin')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.ANALYST)
    async pinNote(@Param('id') id: string, @Req() req: any) {
        return this.notesService.pinNote(id, req.user.id, true);
    }

    @Patch(':id/unpin')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.ANALYST)
    async unpinNote(@Param('id') id: string, @Req() req: any) {
        return this.notesService.pinNote(id, req.user.id, false);
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.ANALYST)
    async deleteNote(@Param('id') id: string, @Req() req: any) {
        return this.notesService.deleteNote(id, req.user.id, req.user.role, req.ip);
    }
}

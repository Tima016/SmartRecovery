import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntityType } from '@prisma/client';

@Injectable()
export class NotesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: AuditService,
    ) { }

    async createNote(
        entityType: EntityType,
        entityId: string,
        content: string,
        authorId: string,
        ipAddress?: string,
        isPinned = false,
    ) {
        const note = await this.prisma.note.create({
            data: { entityType, entityId, content, authorId, isPinned },
            include: { author: { select: { firstName: true, lastName: true, email: true } } },
        });

        await this.auditService.log({
            userId: authorId,
            action: 'CASE_UPDATE' as any,
            entityType,
            entityId,
            details: { action: 'CREATED_NOTE', noteId: note.id },
            ipAddress,
        });

        return note;
    }

    async getNotes(entityType: EntityType, entityId: string) {
        return this.prisma.note.findMany({
            where: { entityType, entityId },
            include: { author: { select: { firstName: true, lastName: true, email: true } } },
            orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        });
    }

    async updateNote(id: string, content: string, authorId: string, ipAddress?: string) {
        const note = await this.prisma.note.findUnique({ where: { id } });
        if (!note) throw new NotFoundException('Note not found');
        if (note.authorId !== authorId) throw new ForbiddenException('You can only edit your own notes');

        const updated = await this.prisma.note.update({
            where: { id },
            data: { content },
            include: { author: { select: { firstName: true, lastName: true, email: true } } },
        });

        await this.auditService.log({
            userId: authorId,
            action: 'CASE_UPDATE' as any,
            entityType: note.entityType,
            entityId: note.entityId,
            details: { action: 'UPDATED_NOTE', noteId: note.id },
            ipAddress,
        });

        return updated;
    }

    async pinNote(id: string, authorId: string, pinned: boolean) {
        const note = await this.prisma.note.findUnique({ where: { id } });
        if (!note) throw new NotFoundException('Note not found');
        if (note.authorId !== authorId) throw new ForbiddenException('You can only pin your own notes');

        return this.prisma.note.update({
            where: { id },
            data: { isPinned: pinned },
            include: { author: { select: { firstName: true, lastName: true, email: true } } },
        });
    }

    async deleteNote(id: string, authorId: string, userRole: string, ipAddress?: string) {
        const note = await this.prisma.note.findUnique({ where: { id } });
        if (!note) throw new NotFoundException('Note not found');

        if (note.authorId !== authorId && userRole !== 'ADMIN') {
            throw new ForbiddenException('You do not have permission to delete this note');
        }

        await this.prisma.note.delete({ where: { id } });

        await this.auditService.log({
            userId: authorId,
            action: 'CASE_UPDATE' as any,
            entityType: note.entityType,
            entityId: note.entityId,
            details: { action: 'DELETED_NOTE', noteId: id },
            ipAddress,
        });

        return { success: true };
    }
}

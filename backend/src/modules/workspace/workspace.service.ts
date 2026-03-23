import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntityType } from '@prisma/client';

@Injectable()
export class WorkspaceService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: AuditService,
    ) { }

    async getBookmarks(userId: string) {
        return this.prisma.bookmark.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async addBookmark(
        entityType: EntityType,
        entityId: string,
        userId: string,
        note?: string,
        ipAddress?: string,
    ) {
        const existing = await this.prisma.bookmark.findUnique({
            where: { userId_entityType_entityId: { userId, entityType, entityId } },
        });

        if (existing) return existing;

        const bookmark = await this.prisma.bookmark.create({
            data: { entityType, entityId, userId, note },
        });

        await this.auditService.log({
            userId,
            action: 'SYSTEM_CONFIG_CHANGE' as any,
            entityType: 'Bookmark',
            entityId: bookmark.id,
            details: { action: 'ADDED_BOOKMARK', targetType: entityType, targetId: entityId },
            ipAddress,
        });

        return bookmark;
    }

    async updateBookmarkNote(id: string, note: string, userId: string) {
        const bookmark = await this.prisma.bookmark.findUnique({ where: { id } });
        if (!bookmark || bookmark.userId !== userId) {
            throw new NotFoundException('Bookmark not found');
        }
        return this.prisma.bookmark.update({ where: { id }, data: { note } });
    }

    async removeBookmark(id: string, userId: string, ipAddress?: string) {
        const bookmark = await this.prisma.bookmark.findUnique({ where: { id } });

        if (!bookmark || bookmark.userId !== userId) {
            throw new NotFoundException('Bookmark not found');
        }

        await this.prisma.bookmark.delete({ where: { id } });

        await this.auditService.log({
            userId,
            action: 'SYSTEM_CONFIG_CHANGE' as any,
            entityType: 'Bookmark',
            entityId: id,
            details: { action: 'REMOVED_BOOKMARK', targetType: bookmark.entityType, targetId: bookmark.entityId },
            ipAddress,
        });

        return { success: true };
    }
}

import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntityType, AuditAction } from '@prisma/client';

@Injectable()
export class TagsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: AuditService,
    ) { }

    async createTag(caseId: string, name: string, color: string, userId: string, ipAddress?: string) {
        // Validation check
        const existing = await this.prisma.tag.findUnique({
            where: { caseId_name: { caseId, name } },
        });
        if (existing) {
            throw new ConflictException(`Tag '${name}' already exists in this case.`);
        }

        const tag = await this.prisma.tag.create({
            data: {
                caseId,
                name,
                color,
                createdById: userId,
            },
        });

        await this.auditService.log({
            userId,
            action: 'CASE_UPDATE' as any,
            entityType: 'Tag',
            entityId: tag.id,
            caseId,
            details: { action: 'CREATED_TAG', name, color },
            ipAddress,
        });

        return tag;
    }

    async assignTag(tagId: string, entityType: EntityType, entityId: string, userId: string, ipAddress?: string) {
        const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
        if (!tag) throw new NotFoundException('Tag not found');

        const existing = await this.prisma.tagRelation.findUnique({
            where: { tagId_entityType_entityId: { tagId, entityType, entityId } },
        });

        if (existing) {
            return existing; // Idempotent 
        }

        const relation = await this.prisma.tagRelation.create({
            data: {
                tagId,
                entityType,
                entityId,
                createdById: userId,
            },
            include: { tag: true }
        });

        await this.auditService.log({
            userId,
            action: 'CASE_UPDATE' as any,
            entityType,
            entityId,
            caseId: tag.caseId,
            details: { action: 'ASSIGNED_TAG', tagname: tag.name },
            ipAddress,
        });

        return relation;
    }

    async getTagsByCase(caseId: string) {
        return this.prisma.tag.findMany({
            where: { caseId },
            orderBy: { name: 'asc' },
        });
    }

    async getAssignedTags(entityType: EntityType, entityId: string) {
        return this.prisma.tagRelation.findMany({
            where: { entityType, entityId },
            include: { tag: true },
        });
    }

    async removeAssignment(relationId: string, userId: string, ipAddress?: string) {
        const relation = await this.prisma.tagRelation.findUnique({
            where: { id: relationId },
            include: { tag: true },
        });

        if (!relation) throw new NotFoundException('Tag assignment not found');

        await this.prisma.tagRelation.delete({ where: { id: relationId } });

        await this.auditService.log({
            userId,
            action: 'CASE_UPDATE' as any,
            entityType: relation.entityType,
            entityId: relation.entityId,
            caseId: relation.tag.caseId,
            details: { action: 'REMOVED_TAG', tagname: relation.tag.name },
            ipAddress,
        });

        return { success: true };
    }
}

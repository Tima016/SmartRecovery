import {
    Controller, Get, Delete, Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { EvidenceService } from './evidence.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';

/**
 * Top-level evidence routes so the Acquisition page can call
 *   GET  /api/v1/evidence          → all evidence across cases
 *   GET  /api/v1/evidence/:id      → single evidence item
 *   DELETE /api/v1/evidence/:id    → delete evidence + MinIO object
 *
 * File upload remains under /cases/:caseId/evidence/upload (multi-hash, encrypted).
 */
@ApiTags('Evidence')
@Controller('evidence')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class EvidenceListController {
    constructor(private readonly evidenceService: EvidenceService) { }

    @Get()
    @ApiOperation({ summary: 'List all evidence items across all cases' })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
    findAll(@Query('limit') limit?: number) {
        return this.evidenceService.findAllGlobal(limit ? +limit : 100);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get evidence item by ID' })
    findOne(@Param('id') id: string) {
        return this.evidenceService.findOne(id);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete evidence item and remove from MinIO' })
    async remove(
        @Param('id') id: string,
        @GetUser('id') userId: string,
        @Req() req: Request,
    ) {
        return this.evidenceService.deleteEvidence(id, userId, req.ip);
    }
}

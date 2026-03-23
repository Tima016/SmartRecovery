import { Controller, Post, Get, Param, ParseUUIDPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CorrelationService } from './correlation.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Correlation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cases/:caseId/correlation')
export class CorrelationController {
    constructor(private readonly correlationService: CorrelationService) { }

    @Post('compute')
    @HttpCode(HttpStatus.OK)
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR)
    @ApiOperation({ summary: 'Run correlation engine for a case (persists results)' })
    @ApiResponse({ status: 200, description: 'Correlation computation result' })
    computeCorrelations(@Param('caseId', ParseUUIDPipe) caseId: string) {
        return this.correlationService.computeCorrelations(caseId);
    }

    @Get('graph')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.ANALYST, UserRole.AUDITOR)
    @ApiOperation({ summary: 'Get normalized correlation graph (nodes + edges)' })
    @ApiResponse({
        status: 200,
        description: 'Graph model: { nodes: [{id, type, label, weight}], edges: [{source, target, weight, reason}] }',
    })
    getGraph(@Param('caseId', ParseUUIDPipe) caseId: string) {
        return this.correlationService.buildGraph(caseId);
    }
}

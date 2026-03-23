import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class AuditController {
    constructor(private readonly auditService: AuditService) { }

    @Get('logs')
    @Roles(UserRole.ADMIN, UserRole.AUDITOR)
    @ApiOperation({ summary: 'Get audit logs (paginated)' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'userId', required: false })
    @ApiQuery({ name: 'action', required: false, enum: AuditAction })
    getLogs(
        @Query('page') page = 1,
        @Query('limit') limit = 50,
        @Query('userId') userId?: string,
        @Query('action') action?: AuditAction,
    ) {
        return this.auditService.getLogs(+page, +limit, { userId, action });
    }

    @Get('verify-chain')
    @Roles(UserRole.ADMIN, UserRole.AUDITOR)
    @ApiOperation({ summary: 'Verify audit log hash chain integrity' })
    verifyChain() {
        return this.auditService.verifyChainIntegrity();
    }
}

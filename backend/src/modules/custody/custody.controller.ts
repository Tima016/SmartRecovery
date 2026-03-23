import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustodyService } from './custody.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Custody')
@Controller('evidence')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class CustodyController {
    constructor(private readonly custodyService: CustodyService) { }

    @Get(':evidenceId/custody')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.AUDITOR)
    @ApiOperation({ summary: 'Get full chain of custody for evidence' })
    getChain(@Param('evidenceId') evidenceId: string) {
        return this.custodyService.getChain(evidenceId);
    }

    @Get(':evidenceId/custody/verify')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.AUDITOR)
    @ApiOperation({ summary: 'Verify chain of custody integrity (tamper detection)' })
    verifyChain(@Param('evidenceId') evidenceId: string) {
        return this.custodyService.verifyChain(evidenceId);
    }
}

import {
    Controller,
    Post,
    Get,
    Param,
    Query,
    Body,
    ParseUUIDPipe,
    UseGuards,
    Req,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { RecoveryService } from './recovery.service';
import { TriggerRecoveryDto, RecoveredFilesQueryDto } from './dto/recovery.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Recovery')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cases/:caseId/recovery')
export class RecoveryController {
    constructor(private readonly recoveryService: RecoveryService) { }

    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR)
    @ApiOperation({ summary: 'Trigger recovery job for a case' })
    @ApiResponse({ status: 202, description: 'Recovery job queued' })
    triggerRecovery(
        @Param('caseId', ParseUUIDPipe) caseId: string,
        @Body() dto: TriggerRecoveryDto,
        @GetUser('id') userId: string,
        @Req() req: any,
    ) {
        return this.recoveryService.triggerRecovery(
            caseId,
            dto,
            userId,
            req.ip,
        );
    }

    @Get('files')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.ANALYST, UserRole.AUDITOR)
    @ApiOperation({ summary: 'List recovered files for a case (paginated, sortable)' })
    @ApiResponse({ status: 200, description: 'Paginated list of recovered files with confidence scores' })
    getRecoveredFiles(
        @Param('caseId', ParseUUIDPipe) caseId: string,
        @Query() query: RecoveredFilesQueryDto,
    ) {
        return this.recoveryService.findRecoveredFiles(caseId, query);
    }

    @Get('fragments')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.ANALYST, UserRole.AUDITOR)
    @ApiOperation({ summary: 'Get fragment groups detected for a case' })
    @ApiResponse({ status: 200, description: 'Fragment groups with linking probability' })
    getFragments(
        @Param('caseId', ParseUUIDPipe) caseId: string,
    ) {
        return this.recoveryService.getFragments(caseId);
    }
}

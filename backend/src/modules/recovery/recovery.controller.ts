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
    ParseBoolPipe,
    Res,
    StreamableFile,
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
import { Response } from 'express';

@ApiTags('Recovery')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cases/:caseId/recovery')
export class RecoveryController {
    constructor(private readonly recoveryService: RecoveryService) { }

    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    @Roles(UserRole.ADMIN, UserRole.USER)
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
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'List recovered files for a case (paginated, sortable)' })
    @ApiResponse({ status: 200, description: 'Paginated list of recovered files with confidence scores' })
    getRecoveredFiles(
        @Param('caseId', ParseUUIDPipe) caseId: string,
        @Query() query: RecoveredFilesQueryDto,
    ) {
        return this.recoveryService.findRecoveredFiles(caseId, query);
    }

    @Get('fragments')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Get fragment groups detected for a case' })
    @ApiResponse({ status: 200, description: 'Fragment groups with linking probability' })
    getFragments(
        @Param('caseId', ParseUUIDPipe) caseId: string,
    ) {
        return this.recoveryService.getFragments(caseId);
    }

    @Get('files/:fileId/preview')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Preview recovered file content' })
    @ApiResponse({ status: 200, description: 'Recovered file preview stream' })
    async previewRecoveredFile(
        @Param('caseId', ParseUUIDPipe) caseId: string,
        @Param('fileId', ParseUUIDPipe) fileId: string,
        @Query('raw', new ParseBoolPipe({ optional: true })) raw?: boolean,
        @Res({ passthrough: true }) res?: Response,
    ) {
        const payload = await this.recoveryService.getRecoveredFilePayload(caseId, fileId, raw ? undefined : 512 * 1024);
        if (res) {
            res.setHeader('Content-Type', payload.contentType);
            res.setHeader('Content-Disposition', `inline; filename="${payload.filename}"`);
            if (payload.truncated) {
                res.setHeader('X-Preview-Truncated', 'true');
            }
            if (payload.warning) {
                res.setHeader('X-Recovery-Warning', payload.warning);
            }
        }
        return new StreamableFile(payload.buffer);
    }

    @Get('files/:fileId/download')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Download recovered file content' })
    @ApiResponse({ status: 200, description: 'Recovered file download stream' })
    async downloadRecoveredFile(
        @Param('caseId', ParseUUIDPipe) caseId: string,
        @Param('fileId', ParseUUIDPipe) fileId: string,
        @Res({ passthrough: true }) res?: Response,
    ) {
        const payload = await this.recoveryService.getRecoveredFilePayload(caseId, fileId);
        if (res) {
            res.setHeader('Content-Type', payload.contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
            if (payload.warning) {
                res.setHeader('X-Recovery-Warning', payload.warning);
            }
        }
        return new StreamableFile(payload.buffer);
    }
}

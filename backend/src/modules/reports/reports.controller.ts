import {
    Controller, Get, Param, UseGuards, Req, Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Reports')
@Controller('cases/:id')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) { }

    @Get('export')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.AUDITOR)
    @ApiOperation({ summary: 'Export case forensic report as PDF (default)' })
    async exportPdf(
        @Param('id') id: string,
        @GetUser('id') userId: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const buffer = await this.reportsService.exportPdf(id, userId, req.ip);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="forensic-report-${id}.pdf"`,
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }

    @Get('export/json')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.AUDITOR)
    @ApiOperation({ summary: 'Export case forensic report as JSON' })
    exportJson(
        @Param('id') id: string,
        @GetUser('id') userId: string,
        @Req() req: Request,
    ) {
        return this.reportsService.exportJson(id, userId, req.ip);
    }

    @Get('export/csv')
    @Roles(UserRole.ADMIN, UserRole.INVESTIGATOR, UserRole.AUDITOR)
    @ApiOperation({ summary: 'Export timeline events as CSV' })
    async exportCsv(
        @Param('id') id: string,
        @GetUser('id') userId: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const csv = await this.reportsService.exportCsv(id, userId, req.ip);
        res.set({
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="timeline-${id}.csv"`,
        });
        res.end(csv);
    }
}

import {
    Controller, Get, Post, Patch, Body, Param, UploadedFile,
    UseGuards, UseInterceptors, Req, MaxFileSizeValidator,
    ParseFilePipe, Query, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Request, Response } from 'express';
import { EvidenceService } from './evidence.service';
import { VerifyEvidenceDto } from './dto/evidence.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { MimeTypeValidator } from '../../common/validators/mime-type.validator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';

const MAX_FILE_BYTES = (parseInt(process.env.MAX_FILE_SIZE_MB ?? '2048') || 2048) * 1024 * 1024;

@ApiTags('Evidence')
@Controller('cases/:caseId/evidence')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class EvidenceController {
    constructor(private readonly evidenceService: EvidenceService) { }

    @Post('upload')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @RateLimit({ windowMs: 60_000, max: 5 })
    @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                description: { type: 'string' },
            },
        },
    })
    @ApiOperation({ summary: 'Upload evidence file (encrypted, multi-hash)' })
    upload(
        @Param('caseId') caseId: string,
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: MAX_FILE_BYTES }),
                    new MimeTypeValidator({ useBlockList: true }),
                ]
            }),
        )
        file: Express.Multer.File,
        @Query('description') description: string,
        @GetUser('id') userId: string,
        @Req() req: Request,
    ) {
        return this.evidenceService.upload(caseId, file, description, userId, req.ip);
    }

    @Post('ingest-local')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Ingest evidence from a server-local file path (disk image)' })
    @ApiBody({ schema: { type: 'object', properties: { filePath: { type: 'string' } } } })
    async ingestLocal(
        @Param('caseId') caseId: string,
        @Body('filePath') filePath: string,
        @GetUser('id') userId: string,
        @Req() req: Request,
    ) {
        return this.evidenceService.ingestLocalPath(caseId, filePath, userId, req.ip);
    }

    @Get()
    @ApiOperation({ summary: 'List all evidence for a case' })
    findAll(@Param('caseId') caseId: string) {
        return this.evidenceService.findAll(caseId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get evidence details with hash values and custody chain' })
    findOne(@Param('id') id: string) {
        return this.evidenceService.findOne(id);
    }

    @Get(':id/hashes')
    @ApiOperation({ summary: 'Get evidence hash values for verification' })
    getHashes(@Param('id') id: string) {
        return this.evidenceService.getHashVerification(id);
    }

    @Patch(':id/verify')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Mark evidence as verified' })
    verify(
        @Param('id') id: string,
        @Body() dto: VerifyEvidenceDto,
        @GetUser('id') userId: string,
        @Req() req: Request,
    ) {
        return this.evidenceService.verify(id, userId, dto.notes, req.ip);
    }

    @Get(':id/hex')
    @ApiOperation({ summary: 'Get decoded hex payload at an offset for Hex Viewer' })
    getHex(
        @Param('id') id: string,
        @Query('offset') offset: string,
        @Query('length') length: string,
    ) {
        const parsedOffset = parseInt(offset ?? '0', 10);
        const parsedLength = parseInt(length ?? '512', 10);
        return this.evidenceService.getHexData(
            id,
            Number.isFinite(parsedOffset) ? parsedOffset : 0,
            Number.isFinite(parsedLength) ? parsedLength : 512,
        );
    }

    @Get(':id/sectors')
    @ApiOperation({ summary: 'Stream binary slices from raw disk image for Hex Viewer' })
    @ApiQuery({ name: 'offset', required: true, type: Number })
    @ApiQuery({ name: 'length', required: true, type: Number })
    async getSectors(
        @Param('id') id: string,
        @Query('offset') offset: number,
        @Query('length') length: number,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const buffer = await this.evidenceService.getSectors(id, +offset, +length);
        res.set({
            'Content-Type': 'application/octet-stream',
            'Content-Length': buffer.length,
            'Accept-Ranges': 'bytes',
        });
        res.send(buffer);
    }

    @Get(':id/download')
    @Roles(UserRole.ADMIN, UserRole.USER)
    @ApiOperation({ summary: 'Download decrypted evidence file securely' })
    async download(
        @Param('id') id: string,
        @Res() res: Response,
        @GetUser('id') userId: string,
        @Req() req: Request,
    ) {
        const { stream, filename, mimeType, size } = await this.evidenceService.download(id, userId, req.ip);
        res.set({
            'Content-Type': mimeType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': size,
        });

        // Typescript issues with res and stream types often arise here, simple .pipe is valid Express flow
        stream.pipe(res as any);
    }
}

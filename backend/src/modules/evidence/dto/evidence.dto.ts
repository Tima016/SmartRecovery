import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceStatus } from '@prisma/client';

export class VerifyEvidenceDto {
    @ApiPropertyOptional({ example: 'File hash matches reference value' })
    @IsOptional()
    @IsString()
    notes?: string;
}

export class UpdateEvidenceStatusDto {
    @ApiPropertyOptional({ enum: EvidenceStatus })
    @IsOptional()
    @IsEnum(EvidenceStatus)
    status?: EvidenceStatus;
}

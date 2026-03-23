import { IsEnum, IsOptional, IsString, IsUUID, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArtifactType } from '@prisma/client';

export class ExtractArtifactsDto {
    @ApiPropertyOptional({ enum: ArtifactType })
    @IsOptional()
    @IsEnum(ArtifactType)
    type?: ArtifactType;

    @ApiPropertyOptional({ enum: ArtifactType, isArray: true, description: 'Multiple artifact types to extract' })
    @IsOptional()
    @IsArray()
    @IsEnum(ArtifactType, { each: true })
    types?: ArtifactType[];

    @ApiPropertyOptional({ description: 'Source tool or location identifier' })
    @IsOptional()
    @IsString()
    source?: string;

    @ApiPropertyOptional({ description: 'Linked evidence UUID' })
    @IsOptional()
    @IsUUID()
    evidenceId?: string;
}


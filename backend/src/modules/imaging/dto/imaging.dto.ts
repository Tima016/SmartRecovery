import {
    IsString,
    IsEnum,
    IsOptional,
    IsUUID,
    IsNumber,
    Min,
    Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateImagingJobDto {
    @ApiProperty({ description: 'UUID of the case' })
    @IsUUID()
    caseId: string;

    @ApiProperty({ example: '/dev/sda', description: 'Source drive path or identifier' })
    @IsString()
    sourceDrive: string;

    @ApiPropertyOptional({ example: 8589934592, description: 'Source drive size in bytes' })
    @IsOptional()
    @IsNumber()
    sourceSizeBytes?: number;

    @ApiPropertyOptional({ example: 'E01', description: 'Image format: E01, DD, RAW' })
    @IsOptional()
    @IsString()
    imageFormat?: string;
}

export class ResumeImagingJobDto {
    @ApiPropertyOptional({ example: 1073741824, description: 'Byte offset to resume from' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    resumeOffset?: number;
}

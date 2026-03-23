import { IsEnum, IsOptional, IsString, IsUUID, IsInt, Min, Max, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecoveryMethod } from '@prisma/client';

export class TriggerRecoveryDto {
    @ApiPropertyOptional({ description: 'Evidence item to recover from (optional — recovers from all evidence if omitted)' })
    @IsOptional()
    @IsUUID()
    evidenceId?: string;

    @ApiPropertyOptional({
        enum: RecoveryMethod,
        description: 'Recovery method to apply. Omit to apply all methods.',
    })
    @IsOptional()
    @IsEnum(RecoveryMethod)
    method?: RecoveryMethod;
}

export class RecoveredFilesQueryDto {
    @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
    @IsOptional()
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ description: 'Results per page', default: 20 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 20;

    @ApiPropertyOptional({ enum: RecoveryMethod })
    @IsOptional()
    @IsEnum(RecoveryMethod)
    method?: RecoveryMethod;

    @ApiPropertyOptional({ description: 'Minimum confidence score (0–100)', default: 0 })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    minConfidence?: number = 0;

    @ApiPropertyOptional({
        enum: ['confidence', 'sizeBytes', 'recoveredAt'],
        description: 'Sort field',
        default: 'confidence',
    })
    @IsOptional()
    @IsIn(['confidence', 'sizeBytes', 'recoveredAt', 'method', 'entropyScore'])
    sortBy?: 'confidence' | 'sizeBytes' | 'recoveredAt' | 'method' | 'entropyScore' = 'confidence';

    @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
    @IsOptional()
    @IsString()
    sortOrder?: 'asc' | 'desc' = 'desc';
}

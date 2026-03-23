import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TimelineEventType } from '@prisma/client';

export class TimelineFilterDto {
    @ApiPropertyOptional({ enum: TimelineEventType })
    @IsOptional()
    @IsEnum(TimelineEventType)
    type?: TimelineEventType;

    @ApiPropertyOptional({ description: 'Filter from timestamp (ISO 8601)' })
    @IsOptional()
    @IsDateString()
    from?: string;

    @ApiPropertyOptional({ description: 'Filter to timestamp (ISO 8601)' })
    @IsOptional()
    @IsDateString()
    to?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    source?: string;

    @ApiPropertyOptional({ description: 'Minimum correlation score (0-100)' })
    @IsOptional()
    minCorrelation?: number;
}

export class CreateTimelineEventDto {
    @ApiPropertyOptional({ enum: TimelineEventType })
    @IsEnum(TimelineEventType)
    type: TimelineEventType;

    @ApiPropertyOptional()
    @IsDateString()
    timestamp: string;

    @ApiPropertyOptional()
    @IsString()
    description: string;

    @ApiPropertyOptional()
    @IsString()
    source: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    actor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    targetObject?: string;
}

import {
    IsString,
    IsEnum,
    IsOptional,
    IsArray,
    MinLength,
    IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    CaseStatus,
    CasePriority,
    CaseClassification,
} from '@prisma/client';

export class CreateCaseDto {
    @ApiProperty({ example: 'Case-2024-001: Corporate Data Breach' })
    @IsString()
    @MinLength(3)
    title: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: CasePriority, default: CasePriority.MEDIUM })
    @IsOptional()
    @IsEnum(CasePriority)
    priority?: CasePriority;

    @ApiPropertyOptional({ enum: CaseClassification, default: CaseClassification.UNCLASSIFIED })
    @IsOptional()
    @IsEnum(CaseClassification)
    classification?: CaseClassification;

    @ApiPropertyOptional({ type: [String], example: ['ransomware', 'insider-threat'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @ApiPropertyOptional({ description: 'UUID of investigator to assign' })
    @IsOptional()
    @IsUUID()
    assignedToId?: string;
}

export class UpdateCaseDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    title?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: CaseStatus })
    @IsOptional()
    @IsEnum(CaseStatus)
    status?: CaseStatus;

    @ApiPropertyOptional({ enum: CasePriority })
    @IsOptional()
    @IsEnum(CasePriority)
    priority?: CasePriority;

    @ApiPropertyOptional({ enum: CaseClassification })
    @IsOptional()
    @IsEnum(CaseClassification)
    classification?: CaseClassification;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];
}

export class AssignCaseDto {
    @ApiProperty({ description: 'UUID of investigator' })
    @IsUUID()
    investigatorId: string;
}

export class AddCaseMemberDto {
    @ApiProperty()
    @IsUUID()
    userId: string;

    @ApiPropertyOptional({ type: [String], example: ['READ', 'WRITE'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    permissions?: string[];
}

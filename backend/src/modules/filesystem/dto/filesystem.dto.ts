import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class ParseFileSystemDto {
    @IsOptional()
    @IsString()
    evidenceId?: string;

    @IsOptional()
    @IsBoolean()
    includeDeleted?: boolean;
}

export class FileSystemQueryDto {
    @IsOptional()
    @IsString()
    parentPath?: string;

    @IsOptional()
    @IsBoolean()
    deletedOnly?: boolean;

    @IsOptional()
    @IsString()
    search?: string;
}

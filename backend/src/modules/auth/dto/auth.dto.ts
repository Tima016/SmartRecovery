import {
    IsEmail,
    IsString,
    MinLength,
    IsEnum,
    IsOptional,
    IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class RegisterDto {
    @ApiProperty({ example: 'john.doe@forensics.io' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'StrongP@ss123', minLength: 8 })
    @IsString()
    @MinLength(8)
    password: string;

    @ApiProperty({ example: 'John' })
    @IsString()
    firstName: string;

    @ApiProperty({ example: 'Doe' })
    @IsString()
    lastName: string;

    @ApiPropertyOptional({ enum: UserRole, default: UserRole.ANALYST })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @ApiPropertyOptional({ example: ['192.168.1.1'], description: 'IP whitelist' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    allowedIps?: string[];
}

export class LoginDto {
    @ApiProperty({ example: 'john.doe@forensics.io' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'StrongP@ss123' })
    @IsString()
    password: string;

    @ApiPropertyOptional({ example: '123456', description: 'TOTP code if 2FA is enabled' })
    @IsOptional()
    @IsString()
    totpCode?: string;
}

export class RefreshTokenDto {
    @ApiProperty()
    @IsString()
    refreshToken: string;
}

export class Enable2FADto {
    @ApiProperty({ example: '123456', description: 'TOTP code from authenticator app' })
    @IsString()
    totpCode: string;
}

export class ChangePasswordDto {
    @ApiProperty()
    @IsString()
    currentPassword: string;

    @ApiProperty({ minLength: 8 })
    @IsString()
    @MinLength(8)
    newPassword: string;
}

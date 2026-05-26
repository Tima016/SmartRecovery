import {
    IsEmail,
    IsString,
    MinLength,
    IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

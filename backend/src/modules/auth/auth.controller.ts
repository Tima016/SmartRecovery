import {
    Controller,
    Post,
    Body,
    Get,
    Req,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

import { AuthService } from './auth.service';
import {
    RegisterDto,
    LoginDto,
    RefreshTokenDto,
    Enable2FADto,
    ChangePasswordDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    @Public()
    @RateLimit({ windowMs: 60_000, max: 10 })
    @ApiOperation({ summary: 'Register a new user account' })
    async register(@Body() dto: RegisterDto, @Req() req: Request) {
        return this.authService.register(dto, req.ip);
    }

    @Post('login')
    @Public()
    @RateLimit({ windowMs: 60_000, max: 10 })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Login with email/password (+ optional TOTP)' })
    async login(@Body() dto: LoginDto, @Req() req: Request) {
        return this.authService.login(dto, req.ip);
    }

    @Post('refresh')
    @Public()
    @RateLimit({ windowMs: 60_000, max: 10 })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Refresh access token using refresh token' })
    async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
        return this.authService.refreshTokens(dto, req.ip);
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('access-token')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Logout and revoke refresh token' })
    async logout(@GetUser('id') userId: string, @Req() req: Request) {
        return this.authService.logout(userId, req.ip);
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('access-token')
    @ApiOperation({ summary: 'Get current authenticated user profile' })
    async me(@GetUser() user: any) {
        return { user };
    }

    @Post('2fa/generate')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('access-token')
    @ApiOperation({ summary: 'Generate 2FA secret and QR code' })
    async generate2FA(@GetUser('id') userId: string) {
        return this.authService.generate2FASecret(userId);
    }

    @Post('2fa/enable')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('access-token')
    @ApiOperation({ summary: 'Enable 2FA after verifying TOTP code' })
    async enable2FA(
        @GetUser('id') userId: string,
        @Body() dto: Enable2FADto,
        @Req() req: Request,
    ) {
        return this.authService.enable2FA(userId, dto, req.ip);
    }

    @Post('change-password')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('access-token')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Change current user password' })
    async changePassword(
        @GetUser('id') userId: string,
        @Body() dto: ChangePasswordDto,
        @Req() req: Request,
    ) {
        return this.authService.changePassword(userId, dto, req.ip);
    }
}

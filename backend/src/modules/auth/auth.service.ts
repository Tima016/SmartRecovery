import {
    Injectable,
    UnauthorizedException,
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt.util';
import { randomHex, sha256 } from '../../utils/crypto.util';
import { RegisterDto, LoginDto, RefreshTokenDto, ChangePasswordDto, Enable2FADto } from './dto/auth.dto';
import { AuditAction, UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
        private auditService: AuditService,
    ) { }

    // ─── Register ──────────────────────────────────────────────────────
    async register(dto: RegisterDto, ipAddress?: string) {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing) throw new ConflictException('Email already registered');

        const userCount = await this.prisma.user.count();
        const role = userCount === 0 ? UserRole.ADMIN : UserRole.USER;

        const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
        const passwordHash = await bcrypt.hash(dto.password, rounds);

        const user = await this.prisma.user.create({
            data: {
                id: uuidv4(),
                email: dto.email,
                passwordHash,
                firstName: dto.firstName,
                lastName: dto.lastName,
                role,
            },
        });

        await this.auditService.log({
            userId: user.id,
            action: AuditAction.USER_REGISTER,
            entityType: 'User',
            entityId: user.id,
            details: { email: user.email, role: user.role },
            ipAddress,
        });

        return this.buildTokenResponse(user);
    }

    // ─── Login ────────────────────────────────────────────────────────
    async login(dto: LoginDto, ipAddress?: string) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

        if (!user || !user.isActive) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Check account lockout
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            throw new ForbiddenException(
                `Account locked until ${user.lockedUntil.toISOString()}`,
            );
        }

        // IP restriction
        if (user.allowedIps.length > 0 && ipAddress && !user.allowedIps.includes(ipAddress)) {
            await this.auditService.log({
                userId: user.id,
                action: AuditAction.USER_FAILED_LOGIN,
                details: { reason: 'IP_RESTRICTED', ip: ipAddress },
                ipAddress,
            });
            throw new ForbiddenException('Access denied from this IP address');
        }

        // Password check
        const valid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!valid) {
            const maxFails = this.configService.get<number>('MAX_FAILED_LOGINS', 5);
            const lockoutMinutes = this.configService.get<number>('LOCKOUT_DURATION_MINUTES', 15);
            const newCount = user.failedLoginCount + 1;
            const shouldLock = newCount >= maxFails;

            await this.prisma.user.update({
                where: { id: user.id },
                data: {
                    failedLoginCount: newCount,
                    lockedUntil: shouldLock
                        ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
                        : undefined,
                },
            });

            await this.auditService.log({
                userId: user.id,
                action: AuditAction.USER_FAILED_LOGIN,
                details: { attempt: newCount },
                ipAddress,
            });

            throw new UnauthorizedException('Invalid credentials');
        }

        // 2FA check
        if (user.isTwoFactorEnabled) {
            if (!dto.totpCode) {
                throw new UnauthorizedException('2FA code required');
            }
            if (!user.twoFactorSecret) {
                throw new UnauthorizedException('2FA not properly configured');
            }
            const isValidTotp = authenticator.verify({ token: dto.totpCode, secret: user.twoFactorSecret });
            if (!isValidTotp) {
                throw new UnauthorizedException('Invalid 2FA code');
            }
        }

        // Reset failed login count
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                failedLoginCount: 0,
                lockedUntil: null,
                lastLoginAt: new Date(),
                lastLoginIp: ipAddress,
            },
        });

        await this.auditService.log({
            userId: user.id,
            action: AuditAction.USER_LOGIN,
            details: { email: user.email },
            ipAddress,
        });

        return this.buildTokenResponse(user);
    }

    // ─── Refresh tokens ───────────────────────────────────────────────
    async refreshTokens(dto: RefreshTokenDto, ipAddress?: string) {
        const payload = verifyRefreshToken(dto.refreshToken);
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

        if (!user || !user.isActive || !user.refreshTokenHash) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const isTokenValid = await bcrypt.compare(dto.refreshToken, user.refreshTokenHash);
        if (!isTokenValid) {
            throw new UnauthorizedException('Refresh token mismatch — possible token theft');
        }

        if (user.tokenVersion !== payload.tokenVersion) {
            throw new UnauthorizedException('Token version mismatch');
        }

        return this.buildTokenResponse(user);
    }

    // ─── Logout ──────────────────────────────────────────────────────
    async logout(userId: string, ipAddress?: string) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { refreshTokenHash: null, tokenVersion: { increment: 1 } },
        });

        await this.auditService.log({
            userId,
            action: AuditAction.USER_LOGOUT,
            ipAddress,
        });

        return { message: 'Logged out successfully' };
    }

    // ─── 2FA — Generate secret & QR ──────────────────────────────────
    async generate2FASecret(userId: string) {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        if (user.isTwoFactorEnabled) {
            throw new BadRequestException('2FA is already enabled');
        }

        const secret = authenticator.generateSecret();
        const otpAuthUrl = authenticator.keyuri(user.email, 'DFIP-Platform', secret);
        const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

        // Store secret temporarily (not yet confirmed)
        await this.prisma.user.update({
            where: { id: userId },
            data: { twoFactorSecret: secret },
        });

        return { secret, qrCodeDataUrl, otpAuthUrl };
    }

    // ─── 2FA — Verify and enable ──────────────────────────────────────
    async enable2FA(userId: string, dto: Enable2FADto, ipAddress?: string) {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        if (!user.twoFactorSecret) throw new BadRequestException('Generate 2FA secret first');
        if (user.isTwoFactorEnabled) throw new BadRequestException('2FA already enabled');

        const isValid = authenticator.verify({ token: dto.totpCode, secret: user.twoFactorSecret });
        if (!isValid) throw new UnauthorizedException('Invalid TOTP code');

        await this.prisma.user.update({
            where: { id: userId },
            data: { isTwoFactorEnabled: true, tokenVersion: { increment: 1 } },
        });

        await this.auditService.log({
            userId,
            action: AuditAction.USER_2FA_ENABLE,
            ipAddress,
        });

        return { message: '2FA enabled successfully' };
    }

    // ─── Change password ──────────────────────────────────────────────
    async changePassword(userId: string, dto: ChangePasswordDto, ipAddress?: string) {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
        if (!valid) throw new UnauthorizedException('Current password is incorrect');

        const rounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
        const newHash = await bcrypt.hash(dto.newPassword, rounds);

        await this.prisma.user.update({
            where: { id: userId },
            data: {
                passwordHash: newHash,
                tokenVersion: { increment: 1 },
                refreshTokenHash: null,
            },
        });

        await this.auditService.log({
            userId,
            action: AuditAction.USER_PASSWORD_CHANGE,
            ipAddress,
        });

        return { message: 'Password changed successfully. Please login again.' };
    }

    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
                isTwoFactorEnabled: true,
                allowedIps: true,
                lastLoginAt: true,
                lastLoginIp: true,
                createdAt: true,
            },
        });
        if (!user) {
            throw new UnauthorizedException('User not found');
        }
        return user;
    }

    // ─── Private helpers ──────────────────────────────────────────────
    private async buildTokenResponse(user: any) {
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            tokenVersion: user.tokenVersion,
        };

        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken(payload);

        // Hash refresh token before storing
        const rounds = 6; // lighter hash for refresh token
        const refreshTokenHash = await bcrypt.hash(refreshToken, rounds);

        await this.prisma.user.update({
            where: { id: user.id },
            data: { refreshTokenHash },
        });

        return {
            accessToken,
            refreshToken,
            tokenType: 'Bearer',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                isTwoFactorEnabled: user.isTwoFactorEnabled,
            },
        };
    }
}

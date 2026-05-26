import { Controller, Get, Patch, Body, Param, UseGuards, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsString, IsEnum, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';

class UpdateUserDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    firstName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    lastName?: string;

    @ApiPropertyOptional({ enum: UserRole })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    allowedIps?: string[];
}

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class UsersController {
    constructor(private readonly prisma: PrismaService) { }

    @Get()
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'List all users (Admin only)' })
    async findAll() {
        return this.prisma.user.findMany({
            select: {
                id: true, email: true, firstName: true, lastName: true,
                role: true, isActive: true, isTwoFactorEnabled: true,
                lastLoginAt: true, lastLoginIp: true, createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    @Get('me')
    @ApiOperation({ summary: 'Get current user profile' })
    async getMe(@GetUser('id') userId: string) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, email: true, firstName: true, lastName: true,
                role: true, isActive: true, isTwoFactorEnabled: true,
                allowedIps: true, lastLoginAt: true, lastLoginIp: true, createdAt: true,
            },
        });
    }

    @Get(':id')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Get user by ID (Admin only)' })
    async findOne(@Param('id') id: string) {
        return this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true, email: true, firstName: true, lastName: true,
                role: true, isActive: true, isTwoFactorEnabled: true,
                allowedIps: true, lastLoginAt: true, lastLoginIp: true, createdAt: true,
                _count: { select: { createdCases: true, assignedCases: true, uploads: true } },
            },
        });
    }

    @Patch(':id')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Update user (Admin only)' })
    async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
        return this.prisma.user.update({
            where: { id },
            data: dto,
            select: {
                id: true, email: true, firstName: true, lastName: true, role: true, isActive: true,
            },
        });
    }

    @Patch(':id/deactivate')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Deactivate user account (Admin only)' })
    async deactivate(@Param('id') id: string) {
        return this.prisma.user.update({
            where: { id },
            data: { isActive: false, tokenVersion: { increment: 1 }, refreshTokenHash: null },
            select: { id: true, email: true, isActive: true },
        });
    }

    @Patch(':id/activate')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Activate user account (Admin only)' })
    async activate(@Param('id') id: string) {
        return this.prisma.user.update({
            where: { id },
            data: { isActive: true },
            select: { id: true, email: true, isActive: true },
        });
    }
}

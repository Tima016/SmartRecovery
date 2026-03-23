import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { verifyAccessToken } from '../../utils/jwt.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private prisma: PrismaService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) return true;

        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers['authorization'];

        if (!authHeader?.startsWith('Bearer ')) {
            throw new UnauthorizedException('Missing or malformed Authorization header');
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyAccessToken(token);

        // Verify user still exists and token version matches (handles logout)
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user || !user.isActive) {
            throw new UnauthorizedException('User not found or deactivated');
        }
        if (user.tokenVersion !== payload.tokenVersion) {
            throw new UnauthorizedException('Token has been revoked');
        }

        request.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            tokenVersion: user.tokenVersion,
            isTwoFactorEnabled: user.isTwoFactorEnabled,
        };
        return true;
    }
}

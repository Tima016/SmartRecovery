import * as jwt from 'jsonwebtoken';
import { UnauthorizedException } from '@nestjs/common';

export interface JwtPayload {
    sub: string;
    email: string;
    role: string;
    tokenVersion: number;
    iat?: number;
    exp?: number;
}

// ─── Safe env access (fails descriptively instead of undefined crash) ────
function getSecret(envKey: string): string {
    const val = process.env[envKey];
    if (!val) {
        throw new Error(`[FATAL] Environment variable ${envKey} is not set. Cannot sign/verify JWT tokens.`);
    }
    return val;
}

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, getSecret('JWT_ACCESS_SECRET'), {
        algorithm: 'HS256',
        expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as any,
    });
}

export function signRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, getSecret('JWT_REFRESH_SECRET'), {
        algorithm: 'HS256',
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
    });
}

export function verifyAccessToken(token: string): JwtPayload {
    try {
        return jwt.verify(token, getSecret('JWT_ACCESS_SECRET'), {
            algorithms: ['HS256'],
        }) as JwtPayload;
    } catch (e: any) {
        if (e.message?.startsWith('[FATAL]')) throw e; // re-throw config errors
        throw new UnauthorizedException('Invalid or expired access token');
    }
}

export function verifyRefreshToken(token: string): JwtPayload {
    try {
        return jwt.verify(token, getSecret('JWT_REFRESH_SECRET'), {
            algorithms: ['HS256'],
        }) as JwtPayload;
    } catch (e: any) {
        if (e.message?.startsWith('[FATAL]')) throw e;
        throw new UnauthorizedException('Invalid or expired refresh token');
    }
}

export function decodeToken(token: string): JwtPayload | null {
    try {
        return jwt.decode(token) as JwtPayload;
    } catch {
        return null;
    }
}

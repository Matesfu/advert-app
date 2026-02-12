import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { Response } from 'express';
import { env } from '../config/env';

// ============================================
// Types
// ============================================

export interface TokenPayload {
    userId: number;
    email: string;
    role: string;
    authProvider: string;
}

interface DecodedToken extends TokenPayload {
    iat: number;
    exp: number;
}

// ============================================
// Access Token
// ============================================

/**
 * Generate a short-lived JWT access token.
 * Sent in Authorization header by the client.
 */
export const generateAccessToken = (payload: TokenPayload): string => {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
        expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    });
};

/**
 * Verify and decode an access token.
 * @throws JsonWebTokenError | TokenExpiredError
 */
export const verifyAccessToken = (token: string): DecodedToken => {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as DecodedToken;
};

// ============================================
// Refresh Token
// ============================================

/**
 * Generate a long-lived JWT refresh token.
 * Stored in HttpOnly cookie + database.
 */
export const generateRefreshToken = (payload: TokenPayload): string => {
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
        expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
    });
};

/**
 * Verify and decode a refresh token.
 * @throws JsonWebTokenError | TokenExpiredError
 */
export const verifyRefreshToken = (token: string): DecodedToken => {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as DecodedToken;
};

/**
 * Parse the refresh token expiry duration string (e.g., "7d") into milliseconds.
 */
export const getRefreshTokenExpiryMs = (): number => {
    const duration = env.JWT_REFRESH_EXPIRES_IN;
    const match = duration.match(/^(\d+)([smhd])$/);

    if (!match) {
        // Default to 7 days if parsing fails
        return 7 * 24 * 60 * 60 * 1000;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return 7 * 24 * 60 * 60 * 1000;
    }
};

// ============================================
// CSRF Token
// ============================================

/**
 * Generate a CSRF token: random bytes + HMAC signature.
 * Format: <random>.<hmac>
 */
export const generateCsrfToken = (): string => {
    const random = crypto.randomBytes(32).toString('hex');
    const hmac = crypto.createHmac('sha256', env.CSRF_SECRET).update(random).digest('hex');
    return `${random}.${hmac}`;
};

/**
 * Verify a CSRF token by re-computing the HMAC.
 */
export const verifyCsrfToken = (token: string): boolean => {
    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [random, hmac] = parts;
    const expectedHmac = crypto.createHmac('sha256', env.CSRF_SECRET).update(random).digest('hex');

    // Timing-safe comparison to prevent timing attacks
    try {
        return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'));
    } catch {
        return false;
    }
};

// ============================================
// Cookie Helpers
// ============================================

const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * Set the refresh token as an HttpOnly, Secure, SameSite cookie.
 */
export const setRefreshTokenCookie = (res: Response, token: string): void => {
    const isProduction = env.NODE_ENV === 'production';

    res.cookie(REFRESH_COOKIE_NAME, token, {
        httpOnly: true,                          // Not accessible via JavaScript
        secure: isProduction,                    // HTTPS only in production
        sameSite: isProduction ? 'strict' : 'lax', // Strict in production, lax in dev
        path: '/api/v1/auth',                    // Only sent to auth routes
        maxAge: getRefreshTokenExpiryMs(),
        domain: env.COOKIE_DOMAIN || undefined,
    });
};

/**
 * Clear the refresh token cookie.
 */
export const clearRefreshTokenCookie = (res: Response): void => {
    const isProduction = env.NODE_ENV === 'production';

    res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        path: '/api/v1/auth',
        domain: env.COOKIE_DOMAIN || undefined,
    });
};

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { sendVerificationEmail } from '../../utils/mailer';
import {
    generateAccessToken,
    generateRefreshToken,
    generateCsrfToken,
    verifyRefreshToken,
    getRefreshTokenExpiryMs,
    type TokenPayload,
} from '../../utils/token';
import type {
    RegisterInput,
    LoginInput,
    ChangePasswordInput,
    ResendVerificationInput
} from './auth.schema';

/**
 * Google OAuth Client
 */
const googleClient = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URL
);

/**
 * Authentication response containing user data and tokens.
 */
interface AuthResponse {
    user: {
        id: number;
        email: string;
        displayName: string | null;
        avatarUrl: string | null;
        role: string;
        authProvider: string;
        isVerified: boolean;
    };
    accessToken: string;
    refreshToken: string;
    csrfToken: string;
    message?: string;
}

/**
 * Registration response (no tokens yet — user must verify email first).
 */
interface RegisterResponse {
    user: {
        id: number;
        email: string;
        displayName: string | null;
        avatarUrl: string | null;
        role: string;
        authProvider: string;
        isVerified: boolean;
    };
    message: string;
}

/**
 * Build the token payload from a user record.
 */
const buildTokenPayload = (user: {
    id: number;
    email: string;
    role: string;
    authProvider: string;
}): TokenPayload => ({
    userId: user.id,
    email: user.email,
    role: user.role,
    authProvider: user.authProvider,
});

/**
 * Auth Service - Handles authentication business logic.
 */
class AuthService {
    /**
     * Register a new user (Local Auth).
     * Does NOT issue tokens — user must verify email first.
     */
    async register(data: RegisterInput): Promise<RegisterResponse> {
        logger.info(`Auth Service: Attempting to register user with email: ${data.email}`);

        // 1. Check if email already exists
        const existingUser = await prisma.user.findUnique({ where: { email: data.email } });

        if (existingUser) {
            if (existingUser.authProvider === 'google') {
                throw new AppError(
                    'This email is registered via Google. Please log in using Google Sign-In, or use Google Sign-In first to enable both methods.',
                    400
                );
            }
            throw new AppError('Email already registered.', 400);
        }

        // 2. Hash password
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(data.password, salt);

        // 3. Create user
        const newUser = await prisma.user.create({
            data: {
                email: data.email,
                passwordHash,
                phone: data.phone,
                role: data.role || UserRole.CUSTOMER,
                authProvider: 'local',
                isVerified: false,
            },
        });

        // 4. Generate verification token
        const token = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await prisma.emailVerificationToken.create({
            data: {
                token,
                userId: newUser.id,
                expiresAt,
            },
        });

        // 5. Send verification email
        await sendVerificationEmail(newUser.email, token);

        // 6. Return user data (no tokens — must verify first)
        return {
            user: {
                id: newUser.id,
                email: newUser.email,
                displayName: newUser.displayName,
                avatarUrl: newUser.avatarUrl,
                role: newUser.role,
                authProvider: newUser.authProvider,
                isVerified: newUser.isVerified,
            },
            message: 'Registration successful. Please check your email to verify your account.',
        };
    }

    /**
     * Authenticate user credentials (Local Login).
     * Issues access token, refresh token (stored in DB), and CSRF token.
     */
    async login(
        data: LoginInput,
        userAgent?: string,
        ipAddress?: string
    ): Promise<AuthResponse> {
        logger.info(`Auth Service: Login attempt for email: ${data.email}`);

        // 1. Find user (exclude soft-deleted)
        const user = await prisma.user.findUnique({ where: { email: data.email } });

        if (!user || user.deletedAt) {
            throw new AppError('Invalid email or password.', 401);
        }

        // 2. Check auth provider
        if (user.authProvider === 'google') {
            throw new AppError(
                'This account was registered using Google. Please use Google Sign-In to log in.',
                403
            );
        }

        // 3. Check verification status
        if (user.authProvider === 'local' && !user.isVerified) {
            throw new AppError(
                'Please verify your email before logging in. Check your inbox or request a new verification email.',
                403
            );
        }

        // 4. Check password
        if (!user.passwordHash) {
            throw new AppError('Invalid email or password.', 401);
        }

        const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new AppError('Invalid email or password.', 401);
        }

        // 5. Generate tokens
        const tokenPayload = buildTokenPayload(user);
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);
        const csrfToken = generateCsrfToken();

        // 6. Store refresh token in database
        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                userAgent: userAgent || null,
                ipAddress: ipAddress || null,
                expiresAt: new Date(Date.now() + getRefreshTokenExpiryMs()),
            },
        });

        logger.info(`Auth Service: Login successful for user ${user.email}`);

        return {
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                role: user.role,
                authProvider: user.authProvider,
                isVerified: user.isVerified,
            },
            accessToken,
            refreshToken,
            csrfToken,
        };
    }

    /**
     * Verify email address using token.
     */
    async verifyEmail(token: string): Promise<void> {
        logger.info('Auth Service: Verifying email with token');

        const verificationToken = await prisma.emailVerificationToken.findUnique({
            where: { token },
            include: { user: true },
        });

        if (!verificationToken) {
            throw new AppError('Invalid or expired verification token.', 400);
        }

        if (verificationToken.expiresAt < new Date()) {
            await prisma.emailVerificationToken.delete({ where: { id: verificationToken.id } });
            throw new AppError('Verification token has expired. Please request a new one.', 400);
        }

        await prisma.user.update({
            where: { id: verificationToken.userId },
            data: { isVerified: true },
        });

        await prisma.emailVerificationToken.delete({ where: { id: verificationToken.id } });
    }

    /**
     * Resend verification email.
     */
    async resendVerification(data: ResendVerificationInput): Promise<void> {
        logger.info(`Auth Service: Resending verification to ${data.email}`);

        const user = await prisma.user.findUnique({ where: { email: data.email } });

        // Return silently for security
        if (!user) return;

        if (user.isVerified) {
            throw new AppError('Email is already verified.', 400);
        }

        if (user.authProvider !== 'local') {
            throw new AppError('This account uses Google Sign-In and does not require email verification.', 400);
        }

        // Delete existing tokens
        await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });

        // Generate new token
        const token = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await prisma.emailVerificationToken.create({
            data: {
                token,
                userId: user.id,
                expiresAt,
            },
        });

        await sendVerificationEmail(user.email, token);
    }

    /**
     * Get Google OAuth Consent URL.
     */
    getGoogleAuthUrl(): string {
        return googleClient.generateAuthUrl({
            access_type: 'offline',
            scope: ['openid', 'email', 'profile'],
        });
    }

    /**
     * Handle Google OAuth Callback.
     * Issues tokens just like login().
     */
    async googleCallback(
        code: string,
        userAgent?: string,
        ipAddress?: string
    ): Promise<AuthResponse> {
        logger.info('Auth Service: Handling Google Callback');

        // 1. Exchange code for tokens
        const { tokens } = await googleClient.getToken(code);

        // 2. Verify ID token
        const ticket = await googleClient.verifyIdToken({
            idToken: tokens.id_token!,
            audience: env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();

        if (!payload || !payload.email) {
            throw new AppError('Invalid Google token payload.', 400);
        }

        const { email, name, picture, email_verified } = payload;

        if (!email_verified) {
            throw new AppError('Google email must be verified.', 400);
        }

        // 3. Find or create user
        let user = await prisma.user.findUnique({ where: { email } });

        if (user) {
            if (user.deletedAt) {
                throw new AppError('This account has been deactivated.', 403);
            }

            if (user.authProvider === 'local') {
                // Upgrade local → both
                logger.info(`Auth Service: Upgrading user ${email} from local to both`);
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        authProvider: 'both',
                        isVerified: true,
                        displayName: user.displayName || name,
                        avatarUrl: user.avatarUrl || picture,
                    },
                });
            } else {
                // 'google' or 'both' — update profile info if changed
                if (user.displayName !== name || user.avatarUrl !== picture) {
                    user = await prisma.user.update({
                        where: { id: user.id },
                        data: {
                            displayName: name,
                            avatarUrl: picture,
                        },
                    });
                }
            }
        } else {
            // Create new Google user
            logger.info(`Auth Service: Creating new Google user ${email}`);
            user = await prisma.user.create({
                data: {
                    email,
                    displayName: name,
                    avatarUrl: picture,
                    authProvider: 'google',
                    isVerified: true,
                    role: UserRole.CUSTOMER,
                    passwordHash: null,
                },
            });
        }

        // 4. Generate tokens
        const tokenPayload = buildTokenPayload(user);
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);
        const csrfToken = generateCsrfToken();

        // 5. Store refresh token in database
        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                userAgent: userAgent || null,
                ipAddress: ipAddress || null,
                expiresAt: new Date(Date.now() + getRefreshTokenExpiryMs()),
            },
        });

        return {
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                role: user.role,
                authProvider: user.authProvider,
                isVerified: user.isVerified,
            },
            accessToken,
            refreshToken,
            csrfToken,
        };
    }

    /**
     * Refresh session — rotate tokens.
     * 1. Verify the refresh token JWT.
     * 2. Look up in database (ensures it hasn't been revoked).
     * 3. Delete old token, create new one (rotation).
     * 4. Return new access token, refresh token, and CSRF token.
     */
    async refreshSession(
        oldRefreshToken: string,
        userAgent?: string,
        ipAddress?: string
    ): Promise<AuthResponse> {
        logger.info('Auth Service: Refreshing session');

        // 1. Verify JWT signature & expiry
        let decoded: TokenPayload;
        try {
            decoded = verifyRefreshToken(oldRefreshToken);
        } catch {
            throw new AppError('Invalid or expired refresh token.', 401);
        }

        // 2. Lookup in database — if not found, token was revoked (logged out)
        const storedToken = await prisma.refreshToken.findUnique({
            where: { token: oldRefreshToken },
        });

        if (!storedToken) {
            // Possible token reuse attack — revoke ALL tokens for this user
            logger.warn(`Auth Service: Refresh token reuse detected for user ${decoded.userId}. Revoking all sessions.`);
            await prisma.refreshToken.deleteMany({ where: { userId: decoded.userId } });
            throw new AppError('Session expired. Please log in again.', 401);
        }

        // 3. Verify user still exists and is not deleted
        const user = await prisma.user.findUnique({ where: { id: storedToken.userId } });
        if (!user || user.deletedAt) {
            await prisma.refreshToken.deleteMany({ where: { userId: storedToken.userId } });
            throw new AppError('User account not found.', 401);
        }

        // 4. Delete old refresh token (rotation)
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });

        // 5. Generate new tokens
        const tokenPayload = buildTokenPayload(user);
        const accessToken = generateAccessToken(tokenPayload);
        const newRefreshToken = generateRefreshToken(tokenPayload);
        const csrfToken = generateCsrfToken();

        // 6. Store new refresh token
        await prisma.refreshToken.create({
            data: {
                token: newRefreshToken,
                userId: user.id,
                userAgent: userAgent || null,
                ipAddress: ipAddress || null,
                expiresAt: new Date(Date.now() + getRefreshTokenExpiryMs()),
            },
        });

        logger.info(`Auth Service: Session refreshed for user ${user.email}`);

        return {
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                role: user.role,
                authProvider: user.authProvider,
                isVerified: user.isVerified,
            },
            accessToken,
            refreshToken: newRefreshToken,
            csrfToken,
        };
    }

    /**
     * Logout — delete the refresh token from the database and invalidate the session.
     */
    async logout(refreshToken?: string): Promise<void> {
        if (!refreshToken) {
            logger.info('Auth Service: Logout called without refresh token');
            return;
        }

        logger.info('Auth Service: Logging out — deleting refresh token');

        // Delete the specific refresh token from the database
        const deleted = await prisma.refreshToken.deleteMany({
            where: { token: refreshToken },
        });

        if (deleted.count === 0) {
            logger.warn('Auth Service: Refresh token not found in DB (already expired or revoked)');
        }
    }

    /**
     * Logout from all devices — delete ALL refresh tokens for the user.
     */
    async logoutAll(userId: number): Promise<void> {
        logger.info(`Auth Service: Logging out all sessions for user ID: ${userId}`);

        await prisma.refreshToken.deleteMany({ where: { userId } });
    }

    /**
     * Get current user profile.
     */
    async getMe(userId: number): Promise<AuthResponse['user']> {
        logger.info(`Auth Service: Fetching profile for user ID: ${userId}`);

        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user || user.deletedAt) {
            throw new AppError('User not found.', 404);
        }

        return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            role: user.role,
            authProvider: user.authProvider,
            isVerified: user.isVerified,
        };
    }

    /**
     * Change user password.
     */
    async changePassword(userId: number, data: ChangePasswordInput): Promise<void> {
        logger.info(`Auth Service: Password change request for user ID: ${userId}`);

        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new AppError('User not found.', 404);
        }

        if (user.authProvider === 'google') {
            throw new AppError(
                'Cannot change password for Google-authenticated accounts. You can set a password by signing in with Google first.',
                400
            );
        }

        if (!user.passwordHash) {
            throw new AppError('You do not have a password set.', 400);
        }

        const isPasswordValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
        if (!isPasswordValid) {
            throw new AppError('Incorrect password.', 401);
        }

        const salt = await bcrypt.genSalt(12);
        const newPasswordHash = await bcrypt.hash(data.newPassword, salt);

        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: newPasswordHash },
        });

        // Invalidate all refresh tokens (force re-login on all devices)
        await prisma.refreshToken.deleteMany({ where: { userId } });

        logger.info(`Auth Service: Password changed for user ${userId}. All sessions invalidated.`);
    }
}

// Export singleton instance
export const authService = new AuthService();

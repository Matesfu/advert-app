import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { sendVerificationEmail } from '../../utils/mailer';
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
 * Authentication response containing user data.
 * Note: JWT token will be added in Phase 2.
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
    message?: string;
}

/**
 * Auth Service - Handles authentication business logic.
 */
class AuthService {
    /**
     * Register a new user (Local Auth).
     */
    async register(data: RegisterInput): Promise<AuthResponse> {
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
            // If authProvider is 'local' or 'both'
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

        // 6. Return user data (no token yet)
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
     */
    async login(data: LoginInput): Promise<AuthResponse> {
        logger.info(`Auth Service: Login attempt for email: ${data.email}`);

        // 1. Find user
        const user = await prisma.user.findUnique({ where: { email: data.email } });

        // 2. If user doesn't exist
        if (!user) {
            throw new AppError('Invalid email or password.', 401);
        }

        // 3. Check auth provider
        if (user.authProvider === 'google') {
            throw new AppError(
                'This account was registered using Google. Please use Google Sign-In to log in.',
                403
            );
        }

        // 4. Check verification status (authProvider is 'local' or 'both')
        if (user.authProvider === 'local' && !user.isVerified) {
            throw new AppError(
                'Please verify your email before logging in. Check your inbox or request a new verification email.',
                403
            );
        }

        // 5. Check password
        // Note: Google-only users have passwordHash=null, but we already blocked them in step 3
        if (!user.passwordHash) {
            throw new AppError('Invalid email or password.', 401); // Should theoretically be caught by step 3
        }

        const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

        if (!isPasswordValid) {
            throw new AppError('Invalid email or password.', 401);
        }

        // 6. Return user data
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
        };
    }

    /**
     * Verify email address using token.
     */
    async verifyEmail(token: string): Promise<void> {
        logger.info('Auth Service: Verifying email with token');

        // 1. Find token
        const verificationToken = await prisma.emailVerificationToken.findUnique({
            where: { token },
            include: { user: true },
        });

        if (!verificationToken) {
            throw new AppError('Invalid or expired verification token.', 400);
        }

        // 2. Check expiry
        if (verificationToken.expiresAt < new Date()) {
            await prisma.emailVerificationToken.delete({ where: { id: verificationToken.id } });
            throw new AppError('Verification token has expired. Please request a new one.', 400);
        }

        // 3. Update user
        await prisma.user.update({
            where: { id: verificationToken.userId },
            data: { isVerified: true },
        });

        // 4. Delete token
        await prisma.emailVerificationToken.delete({ where: { id: verificationToken.id } });
    }

    /**
     * Resend verification email.
     */
    async resendVerification(data: ResendVerificationInput): Promise<void> {
        logger.info(`Auth Service: Resending verification to ${data.email}`);

        // 2. Find user
        const user = await prisma.user.findUnique({ where: { email: data.email } });

        // 3. If not found, return silently (security)
        if (!user) return;

        // 4. If already verified
        if (user.isVerified) {
            throw new AppError('Email is already verified.', 400);
        }

        // 5. If Google user
        if (user.authProvider !== 'local') {
            throw new AppError('This account uses Google Sign-In and does not require email verification.', 400);
        }

        // 6. Delete existing tokens
        await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });

        // 7. Generate new token
        const token = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await prisma.emailVerificationToken.create({
            data: {
                token,
                userId: user.id,
                expiresAt,
            },
        });

        // 8. Send email
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
     */
    async googleCallback(code: string): Promise<AuthResponse> {
        logger.info('Auth Service: Handling Google Callback');

        // 2. Exchange code for tokens
        const { tokens } = await googleClient.getToken(code);

        // 3. Verify ID token
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

        // 4. Check if user exists
        let user = await prisma.user.findUnique({ where: { email } });

        if (user) {
            // Existing user logic
            if (user.authProvider === 'local') {
                // UPGRADE ACCOUNT: local -> both
                logger.info(`Auth Service: Upgrading user ${email} from local to both`);

                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        authProvider: 'both',
                        isVerified: true, // Google proved ownership
                        displayName: user.displayName || name,
                        avatarUrl: user.avatarUrl || picture,
                    },
                });
            } else {
                // 'google' or 'both' -> Update profile info if changed
                if (user.displayName !== name || user.avatarUrl !== picture) {
                    user = await prisma.user.update({
                        where: { id: user.id },
                        data: {
                            displayName: name, // Optional: might want to keep user's custom name
                            avatarUrl: picture,
                        },
                    });
                }
            }
        } else {
            // Create new user
            logger.info(`Auth Service: Creating new Google user ${email}`);

            user = await prisma.user.create({
                data: {
                    email,
                    displayName: name,
                    avatarUrl: picture,
                    authProvider: 'google',
                    isVerified: true,
                    role: UserRole.CUSTOMER,
                    passwordHash: null, // No password for Google users
                },
            });
        }

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
        };
    }

    /**
     * Logout (Placeholder).
     */
    async logout(userId: number): Promise<void> {
        logger.info(`Auth Service: Logout for user ID: ${userId}`);
        // Phase 2: Blacklist token
    }

    /**
     * Get current user profile.
     */
    async getMe(userId: number): Promise<AuthResponse['user']> {
        logger.info(`Auth Service: Fetching profile for user ID: ${userId}`);

        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
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

        // 1. Check if allowed
        if (user.authProvider === 'google') {
            throw new AppError(
                'Cannot change password for Google-authenticated accounts. You can set a password by signing in with Google first.',
                400
            );
        }

        // 2. Verify current password
        // "local" or "both" users MUST have a passwordHash
        if (!user.passwordHash) {
            // This edge case shouldn't theoretically happen for 'local'/'both', 
            // but 'both' could exist without password if upgraded differently? 
            // Logic above ensures 'both' comes from local upgrade (has password).
            // Be safe:
            throw new AppError('You do not have a password set.', 400);
        }

        const isPasswordValid = await bcrypt.compare(data.currentPassword, user.passwordHash);

        if (!isPasswordValid) {
            throw new AppError('Incorrect password.', 401);
        }

        // 3. Hash new password
        const salt = await bcrypt.genSalt(12);
        const newPasswordHash = await bcrypt.hash(data.newPassword, salt);

        // 4. Update
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: newPasswordHash },
        });
    }
}

// Export singleton instance
export const authService = new AuthService();

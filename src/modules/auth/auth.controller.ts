import { Request, Response } from 'express';
import { authService } from './auth.service';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { logger } from '../../utils/logger';
import type {
    RegisterInput,
    LoginInput,
    ChangePasswordInput,
    ResendVerificationInput,
    VerifyEmailQuery
} from './auth.schema';

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user (Local)
 * @access  Public
 */
export const register = async (req: Request, res: Response): Promise<void> => {
    const data = req.body as RegisterInput;

    logger.info(`[AuthController] Register request for email: ${data.email}`);

    const result = await authService.register(data);

    logger.info(`[AuthController] User registered successfully: ${result.user.email}`);

    // 201 Created
    sendCreated(res, result.user, result.message);
};

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user (Local)
 * @access  Public
 */
export const login = async (req: Request, res: Response): Promise<void> => {
    const data = req.body as LoginInput;

    logger.info(`[AuthController] Login request for email: ${data.email}`);

    const result = await authService.login(data);

    logger.info(`[AuthController] User logged in successfully: ${result.user.email}`);

    sendSuccess(res, result, 200, 'Login successful');
};

/**
 * @route   GET /api/v1/auth/verify-email
 * @desc    Verify email address using token
 * @access  Public
 */
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
    const { token } = req.query as unknown as VerifyEmailQuery;

    logger.info('[AuthController] Email verification request');

    await authService.verifyEmail(token);

    logger.info('[AuthController] Email verified successfully');

    sendSuccess(res, null, 200, 'Email verified successfully. You can now log in.');
};

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend verification email
 * @access  Public
 */
export const resendVerification = async (req: Request, res: Response): Promise<void> => {
    const data = req.body as ResendVerificationInput;

    logger.info(`[AuthController] Resend verification request for: ${data.email}`);

    await authService.resendVerification(data);

    // Generic response for security
    sendSuccess(res, null, 200, 'If an account with that email exists, a verification link has been sent.');
};

/**
 * @route   GET /api/v1/auth/google
 * @desc    Initiate Google OAuth flow
 * @access  Public
 */
export const googleAuth = (req: Request, res: Response): void => {
    const url = authService.getGoogleAuthUrl();
    res.redirect(url);
};

/**
 * @route   GET /api/v1/auth/google/callback
 * @desc    Handle Google OAuth callback
 * @access  Public
 */
export const googleCallback = async (req: Request, res: Response): Promise<void> => {
    const code = req.query.code as string;

    if (!code) {
        res.status(400).json({ status: 'fail', message: 'Authorization code missing' });
        return;
    }

    logger.info('[AuthController] Google callback received');

    const result = await authService.googleCallback(code);

    logger.info(`[AuthController] Google login successful for: ${result.user.email}`);

    sendSuccess(res, result, 200, 'Login successful');
};

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout current user
 * @access  Private
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;

    logger.info(`[AuthController] Logout request for user ID: ${userId}`);

    await authService.logout(userId);

    sendSuccess(res, null, 200, 'Logged out successfully');
};

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current authenticated user profile
 * @access  Private
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;

    logger.info(`[AuthController] Get profile request for user ID: ${userId}`);

    const user = await authService.getMe(userId);

    sendSuccess(res, { user });
};

/**
 * @route   PATCH /api/v1/auth/change-password
 * @desc    Change current user's password
 * @access  Private
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const data = req.body as ChangePasswordInput;

    logger.info(`[AuthController] Password change request for user ID: ${userId}`);

    await authService.changePassword(userId, data);

    logger.info(`[AuthController] Password changed successfully for user ID: ${userId}`);

    sendNoContent(res);
};

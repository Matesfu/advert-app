import { Request, Response } from 'express';
import { authService } from './auth.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import { setRefreshTokenCookie, clearRefreshTokenCookie } from '../../utils/token';
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

    sendCreated(res, result.user, result.message);
};

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user and get tokens
 * @access  Public
 */
export const login = async (req: Request, res: Response): Promise<void> => {
    const data = req.body as LoginInput;
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    logger.info(`[AuthController] Login request for email: ${data.email}`);

    const result = await authService.login(data, userAgent, ipAddress);

    // Set refresh token in HttpOnly cookie
    setRefreshTokenCookie(res, result.refreshToken);

    logger.info(`[AuthController] User logged in successfully: ${result.user.email}`);

    // Return access token and CSRF token in response body (NOT the refresh token)
    sendSuccess(res, {
        user: result.user,
        accessToken: result.accessToken,
        csrfToken: result.csrfToken,
    }, 200, 'Login successful');
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

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    logger.info('[AuthController] Google callback received');

    const result = await authService.googleCallback(code, userAgent, ipAddress);

    // Set refresh token in HttpOnly cookie
    setRefreshTokenCookie(res, result.refreshToken);

    logger.info(`[AuthController] Google login successful for: ${result.user.email}`);

    sendSuccess(res, {
        user: result.user,
        accessToken: result.accessToken,
        csrfToken: result.csrfToken,
    }, 200, 'Login successful');
};

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token using refresh token cookie
 * @access  Public (uses refresh token cookie for auth)
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
    const oldRefreshToken = req.cookies?.refreshToken;

    if (!oldRefreshToken) {
        res.status(401).json({ status: 'fail', message: 'No refresh token provided.' });
        return;
    }

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    logger.info('[AuthController] Token refresh request');

    const result = await authService.refreshSession(oldRefreshToken, userAgent, ipAddress);

    // Set new refresh token cookie (rotation)
    setRefreshTokenCookie(res, result.refreshToken);

    // Return new access token and new CSRF token
    sendSuccess(res, {
        user: result.user,
        accessToken: result.accessToken,
        csrfToken: result.csrfToken,
    }, 200, 'Token refreshed successfully');
};

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout current user — invalidate refresh token
 * @access  Private
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
    const refreshTokenValue = req.cookies?.refreshToken;

    logger.info(`[AuthController] Logout request for user ID: ${req.user!.id}`);

    // Delete refresh token from database
    await authService.logout(refreshTokenValue);

    // Clear the refresh token cookie
    clearRefreshTokenCookie(res);

    sendSuccess(res, null, 200, 'Logged out successfully');
};

/**
 * @route   POST /api/v1/auth/logout-all
 * @desc    Logout from all devices
 * @access  Private
 */
export const logoutAll = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;

    logger.info(`[AuthController] Logout all sessions for user ID: ${userId}`);

    await authService.logoutAll(userId);

    // Clear this device's cookie
    clearRefreshTokenCookie(res);

    sendSuccess(res, null, 200, 'Logged out from all devices successfully');
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
 * @desc    Change current user's password (invalidates all sessions)
 * @access  Private
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const data = req.body as ChangePasswordInput;

    logger.info(`[AuthController] Password change request for user ID: ${userId}`);

    await authService.changePassword(userId, data);

    // Clear this device's refresh cookie since all sessions are invalidated
    clearRefreshTokenCookie(res);

    logger.info(`[AuthController] Password changed for user ID: ${userId}`);

    sendSuccess(res, null, 200, 'Password changed successfully. Please log in again on all devices.');
};

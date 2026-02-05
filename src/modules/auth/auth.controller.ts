import { Request, Response } from 'express';
import { authService } from './auth.service';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { logger } from '../../utils/logger';
import type { RegisterInput, LoginInput, ChangePasswordInput } from './auth.schema';

/**
 * Auth Controller - Handles HTTP request/response for authentication.
 * 
 * Note: Uses express-async-errors, so no try/catch blocks are needed.
 * Errors thrown from services will be caught by the global error handler.
 */

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
export const register = async (req: Request, res: Response): Promise<void> => {
    const data = req.body as RegisterInput;

    logger.info(`[AuthController] Register request for email: ${data.email}`);

    const result = await authService.register(data);

    logger.info(`[AuthController] User registered successfully: ${result.user.email}`);

    sendCreated(res, result, 'User registered successfully');
};

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user and return token
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
 * @route   POST /api/v1/auth/logout
 * @desc    Logout current user (invalidate token if applicable)
 * @access  Private
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;

    logger.info(`[AuthController] Logout request for user ID: ${userId}`);

    await authService.logout(userId);

    logger.info(`[AuthController] User logged out successfully: ${userId}`);

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

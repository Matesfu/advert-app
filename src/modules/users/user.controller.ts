import { Request, Response } from 'express';
import { userService } from './user.service';
import { sendSuccess, sendNoContent } from '../../utils/response';
import { logger } from '../../utils/logger';
import type { UpdateUserInput, UserIdParam } from './user.schema';

/**
 * @route   GET /api/v1/users/me
 * @desc    Get current user profile
 * @access  Private
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    logger.info(`[UserController] Get profile for user ID: ${userId}`);
    const user = await userService.findById(userId);
    sendSuccess(res, { user });
};

/**
 * @route   PATCH /api/v1/users/me
 * @desc    Update current user profile
 * @access  Private
 */
export const updateMe = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const data = req.body as UpdateUserInput;
    logger.info(`[UserController] Update profile for user ID: ${userId}`);
    const user = await userService.updateMe(userId, data);
    sendSuccess(res, { user }, 200, 'Profile updated successfully');
};

/**
 * @route   DELETE /api/v1/users/me
 * @desc    Delete current user account
 * @access  Private
 */
export const deleteMe = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    logger.info(`[UserController] Delete account for user ID: ${userId}`);
    await userService.deleteMe(userId);
    sendNoContent(res);
};

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user by ID (Admin only)
 * @access  Private (Admin)
 */
export const getUserById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as UserIdParam;
    logger.info(`[UserController] Admin fetching user ID: ${id}`);
    const user = await userService.findById(id);
    sendSuccess(res, { user });
};

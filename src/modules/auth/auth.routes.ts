import { Router } from 'express';
import * as authController from './auth.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import { protect } from '../../middlewares/auth.middleware';
import {
    registerSchema,
    loginSchema,
    changePasswordSchema,
} from './auth.schema';

const router = Router();

/**
 * Auth Routes
 * Base path: /api/v1/auth
 */

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user account
 * @access  Public
 */
router.post(
    '/register',
    validateRequest(registerSchema),
    authController.register
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user and get token
 * @access  Public
 */
router.post(
    '/login',
    validateRequest(loginSchema),
    authController.login
);

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout current user
 * @access  Private
 */
router.post(
    '/logout',
    protect,
    authController.logout
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get(
    '/me',
    protect,
    authController.getMe
);

/**
 * @route   PATCH /api/v1/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.patch(
    '/change-password',
    protect,
    validateRequest(changePasswordSchema),
    authController.changePassword
);

export default router;

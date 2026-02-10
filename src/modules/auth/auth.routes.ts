import { Router } from 'express';
import * as authController from './auth.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import { protect } from '../../middlewares/auth.middleware';
import {
    registerSchema,
    loginSchema,
    changePasswordSchema,
    resendVerificationSchema,
    verifyEmailQuerySchema,
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

/**
 * @route   GET /api/v1/auth/verify-email
 * @desc    Verify email address
 * @access  Public
 */
router.get(
    '/verify-email',
    validateRequest(verifyEmailQuerySchema, 'query'),
    authController.verifyEmail
);

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend verification email
 * @access  Public
 */
router.post(
    '/resend-verification',
    validateRequest(resendVerificationSchema),
    authController.resendVerification
);

/**
 * @route   GET /api/v1/auth/google
 * @desc    Initiate Google OAuth
 * @access  Public
 */
router.get(
    '/google',
    authController.googleAuth
);

/**
 * @route   GET /api/v1/auth/google/callback
 * @desc    Google OAuth Callback
 * @access  Public
 */
router.get(
    '/google/callback',
    authController.googleCallback
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

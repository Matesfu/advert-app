import { Router } from 'express';
import * as userController from './user.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import { protect, restrictTo } from '../../middlewares/auth.middleware';
import { updateUserSchema, userIdParamSchema } from './user.schema';

const router = Router();

// All routes require authentication
router.use(protect);

/** GET /api/v1/users/me - Get current user */
router.get('/me', userController.getMe);

/** PATCH /api/v1/users/me - Update current user */
router.patch('/me', validateRequest(updateUserSchema), userController.updateMe);

/** DELETE /api/v1/users/me - Delete current user */
router.delete('/me', userController.deleteMe);

/** GET /api/v1/users/:id - Get user by ID (Admin only) */
router.get(
    '/:id',
    restrictTo('ADMIN'),
    validateRequest(userIdParamSchema, 'params'),
    userController.getUserById
);

export default router;

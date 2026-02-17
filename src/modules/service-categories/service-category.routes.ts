import { Router } from 'express';
import * as serviceCategoryController from './service-category.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import { protect, restrictTo } from '../../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import {
    createServiceCategorySchema,
    updateServiceCategorySchema,
    listServiceCategoriesQuerySchema,
    idParamSchema,
} from './service-category.schema';

const router = Router();

/**
 * Service Category Routes
 * Base path: /api/v1/service-categories
 *
 * GET routes are public (no auth required).
 * Mutation routes (POST, PATCH, DELETE) require Admin authentication.
 */

// ============================================
// PUBLIC ROUTES (no auth required)
// ============================================

// GET /api/v1/service-categories — Public
router.get(
    '/',
    validateRequest(listServiceCategoriesQuerySchema, 'query'),
    serviceCategoryController.getAll
);

// GET /api/v1/service-categories/:id — Public
router.get(
    '/:id',
    validateRequest(idParamSchema, 'params'),
    serviceCategoryController.getOne
);

// ============================================
// ADMIN-ONLY ROUTES (auth + ADMIN role required)
// ============================================

// POST /api/v1/service-categories — Admin only
router.post(
    '/',
    protect,
    restrictTo(UserRole.ADMIN),
    validateRequest(createServiceCategorySchema),
    serviceCategoryController.create
);

// PATCH /api/v1/service-categories/:id — Admin only
router.patch(
    '/:id',
    protect,
    restrictTo(UserRole.ADMIN),
    validateRequest(idParamSchema, 'params'),
    validateRequest(updateServiceCategorySchema),
    serviceCategoryController.update
);

// DELETE /api/v1/service-categories/:id — Admin only
router.delete(
    '/:id',
    protect,
    restrictTo(UserRole.ADMIN),
    validateRequest(idParamSchema, 'params'),
    serviceCategoryController.remove
);

export default router;

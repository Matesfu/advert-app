import { Router } from 'express';
import * as eventTypeController from './event-type.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import { protect, restrictTo } from '../../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import {
    createEventTypeSchema,
    updateEventTypeSchema,
    idParamSchema,
    listEventTypesQuerySchema,
    syncCategoriesSchema,
} from './event-type.schema';

const router = Router();

/**
 * Event Type Routes
 * Base path: /api/v1/event-types
 *
 * GET routes are public (no auth required).
 * Mutation routes (POST, PATCH, DELETE, PUT) require Admin authentication.
 */

// ============================================
// PUBLIC ROUTES (no auth required)
// ============================================

/**
 * @route   GET /api/v1/event-types
 * @desc    List all event types (paginated, searchable, sortable)
 * @access  Public
 */
router.get(
    '/',
    validateRequest(listEventTypesQuerySchema, 'query'),
    eventTypeController.getAll
);

/**
 * @route   GET /api/v1/event-types/:id
 * @desc    Get a single event type by ID with linked categories
 * @access  Public
 */
router.get(
    '/:id',
    validateRequest(idParamSchema, 'params'),
    eventTypeController.getOne
);

// ============================================
// ADMIN-ONLY ROUTES (auth + ADMIN role required)
// ============================================

/**
 * @route   POST /api/v1/event-types
 * @desc    Create a new event type
 * @access  Admin only
 */
router.post(
    '/',
    protect,
    restrictTo(UserRole.ADMIN),
    validateRequest(createEventTypeSchema),
    eventTypeController.create
);

/**
 * @route   PATCH /api/v1/event-types/:id
 * @desc    Update event type name and/or sync service categories
 * @access  Admin only
 */
router.patch(
    '/:id',
    protect,
    restrictTo(UserRole.ADMIN),
    validateRequest(idParamSchema, 'params'),
    validateRequest(updateEventTypeSchema),
    eventTypeController.update
);

/**
 * @route   DELETE /api/v1/event-types/:id
 * @desc    Delete an event type and its category links
 * @access  Admin only
 */
router.delete(
    '/:id',
    protect,
    restrictTo(UserRole.ADMIN),
    validateRequest(idParamSchema, 'params'),
    eventTypeController.remove
);

/**
 * @route   PUT /api/v1/event-types/:id/categories
 * @desc    Sync (full-replace) linked service categories
 * @access  Admin only
 */
router.put(
    '/:id/categories',
    protect,
    restrictTo(UserRole.ADMIN),
    validateRequest(idParamSchema, 'params'),
    validateRequest(syncCategoriesSchema),
    eventTypeController.syncCategories
);

export default router;

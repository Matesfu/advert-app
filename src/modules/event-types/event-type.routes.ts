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
 * Event Type Admin Routes
 * Base path: /api/v1/admin/event-types
 *
 * All routes require authentication (protect) and ADMIN role (restrictTo).
 */

// Apply auth middleware to ALL routes in this router
router.use(protect, restrictTo('ADMIN'));

// ============================================
// COLLECTION ROUTES
// ============================================

/**
 * @route   POST /api/v1/admin/event-types
 * @desc    Create a new event type
 * @access  Admin only
 */
router.post(
    '/',
    validateRequest(createEventTypeSchema),
    eventTypeController.create
);

/**
 * @route   GET /api/v1/admin/event-types
 * @desc    List all event types (paginated, searchable, sortable)
 * @access  Admin only
 */
router.get(
    '/',
    validateRequest(listEventTypesQuerySchema, 'query'),
    eventTypeController.getAll
);

// ============================================
// SINGLE RESOURCE ROUTES
// ============================================

/**
 * @route   GET /api/v1/admin/event-types/:id
 * @desc    Get a single event type by ID with linked categories
 * @access  Admin only
 */
router.get(
    '/:id',
    validateRequest(idParamSchema, 'params'),
    eventTypeController.getOne
);

/**
 * @route   PATCH /api/v1/admin/event-types/:id
 * @desc    Update event type name and/or sync service categories
 * @access  Admin only
 */
router.patch(
    '/:id',
    validateRequest(idParamSchema, 'params'),
    validateRequest(updateEventTypeSchema),
    eventTypeController.update
);

/**
 * @route   DELETE /api/v1/admin/event-types/:id
 * @desc    Delete an event type and its category links
 * @access  Admin only
 */
router.delete(
    '/:id',
    validateRequest(idParamSchema, 'params'),
    eventTypeController.remove
);

// ============================================
// SUB-RESOURCE ROUTES
// ============================================

/**
 * @route   PUT /api/v1/admin/event-types/:id/categories
 * @desc    Sync (full-replace) linked service categories
 * @access  Admin only
 */
router.put(
    '/:id/categories',
    validateRequest(idParamSchema, 'params'),
    validateRequest(syncCategoriesSchema),
    eventTypeController.syncCategories
);

export default router;

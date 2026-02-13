import { Router } from 'express';
import * as categoryController from './category.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import { slugParamSchema } from './category.schema';

const router = Router();

// All routes are public (read-only reference data)

/** GET /api/v1/categories/event-types - List event types */
router.get('/event-types', categoryController.getAllEventTypes);

/** GET /api/v1/categories/event-types/:slug - Get event type by slug */
router.get(
    '/event-types/:slug',
    validateRequest(slugParamSchema, 'params'),
    categoryController.getEventTypeBySlug
);

/** GET /api/v1/categories/service-categories - List service categories */
router.get('/service-categories', categoryController.getAllServiceCategories);

/** GET /api/v1/categories/service-categories/:slug - Get service category by slug */
router.get(
    '/service-categories/:slug',
    validateRequest(slugParamSchema, 'params'),
    categoryController.getServiceCategoryBySlug
);

export default router;

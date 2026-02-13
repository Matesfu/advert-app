import { Router } from 'express';
import * as favoriteController from './favorite.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import { protect } from '../../middlewares/auth.middleware';
import { vendorIdParamSchema } from './favorite.schema';

const router = Router();

// All routes require authentication
router.use(protect);

/** GET /api/v1/favorites - List user's favorites */
router.get('/', favoriteController.getMyFavorites);

/** POST /api/v1/favorites/:vendorId - Add to favorites */
router.post(
    '/:vendorId',
    validateRequest(vendorIdParamSchema, 'params'),
    favoriteController.addFavorite
);

/** DELETE /api/v1/favorites/:vendorId - Remove from favorites */
router.delete(
    '/:vendorId',
    validateRequest(vendorIdParamSchema, 'params'),
    favoriteController.removeFavorite
);

export default router;

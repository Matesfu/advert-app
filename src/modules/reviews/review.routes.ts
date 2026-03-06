import { Router } from 'express';
import * as reviewController from './review.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import { protect } from '../../middlewares/auth.middleware';
import {
    vendorIdParamSchema,
    vendorAndReviewParamSchema,
    createReviewSchema,
    updateReviewSchema,
    listReviewsQuerySchema,
} from './review.schema';

const router = Router({ mergeParams: true }); // To access :vendorId from parent

/** GET /api/v1/vendors/:vendorId/reviews - List reviews */
router.get(
    '/',
    validateRequest(vendorIdParamSchema, 'params'),
    validateRequest(listReviewsQuerySchema, 'query'),
    reviewController.getVendorReviews
);

/** POST /api/v1/vendors/:vendorId/reviews - Create review */
router.post(
    '/',
    protect,
    validateRequest(vendorIdParamSchema, 'params'),
    validateRequest(createReviewSchema),
    reviewController.createReview
);

/** PATCH /api/v1/vendors/:vendorId/reviews/:reviewId - Update review */
router.patch(
    '/:reviewId',
    protect,
    validateRequest(vendorAndReviewParamSchema, 'params'),
    validateRequest(updateReviewSchema),
    reviewController.updateReview
);

/** DELETE /api/v1/vendors/:vendorId/reviews/:reviewId - Delete review */
router.delete(
    '/:reviewId',
    protect,
    validateRequest(vendorAndReviewParamSchema, 'params'),
    reviewController.deleteReview
);

export default router;

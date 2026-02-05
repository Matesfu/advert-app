import { Request, Response } from 'express';
import { reviewService } from './review.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import { logger } from '../../utils/logger';
import type { VendorIdParam, CreateReviewInput, ListReviewsQuery } from './review.schema';

/**
 * @route   GET /api/v1/vendors/:vendorId/reviews
 * @desc    Get all reviews for a vendor
 * @access  Public
 */
export const getVendorReviews = async (req: Request, res: Response): Promise<void> => {
    const { vendorId } = req.params as unknown as VendorIdParam;
    const query = req.query as unknown as ListReviewsQuery;
    logger.info(`[ReviewController] Get reviews for vendor ID: ${vendorId}`);
    const result = await reviewService.findByVendor(vendorId, query);
    sendSuccess(res, result);
};

/**
 * @route   POST /api/v1/vendors/:vendorId/reviews
 * @desc    Create a review for a vendor
 * @access  Private
 */
export const createReview = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { vendorId } = req.params as unknown as VendorIdParam;
    const data = req.body as CreateReviewInput;
    logger.info(`[ReviewController] Create review for vendor ID: ${vendorId} by user: ${userId}`);
    const review = await reviewService.create(userId, vendorId, data);
    sendCreated(res, { review }, 'Review created successfully');
};

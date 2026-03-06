import { Request, Response } from 'express';
import { reviewService } from './review.service';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { logger } from '../../utils/logger';
import type { VendorIdParam, VendorAndReviewParam, CreateReviewInput, UpdateReviewInput, ListReviewsQuery } from './review.schema';

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
    sendSuccess(res, result, 200, undefined, result.pagination);
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

/**
 * @route   PATCH /api/v1/vendors/:vendorId/reviews/:reviewId
 * @desc    Update a review
 * @access  Private (author only)
 */
export const updateReview = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { reviewId } = req.params as unknown as VendorAndReviewParam;
    const data = req.body as UpdateReviewInput;
    logger.info(`[ReviewController] Update review ID: ${reviewId} by user: ${userId}`);
    const review = await reviewService.update(reviewId, userId, data);
    sendSuccess(res, { review }, 200, 'Review updated successfully');
};

/**
 * @route   DELETE /api/v1/vendors/:vendorId/reviews/:reviewId
 * @desc    Delete a review
 * @access  Private (author or ADMIN)
 */
export const deleteReview = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { reviewId } = req.params as unknown as VendorAndReviewParam;
    logger.info(`[ReviewController] Delete review ID: ${reviewId} by user: ${userId}`);
    await reviewService.delete(reviewId, userId, userRole);
    sendNoContent(res);
};

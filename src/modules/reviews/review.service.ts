import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type { CreateReviewInput, ListReviewsQuery } from './review.schema';

interface Review {
    id: number;
    rating: number;
    comment: string | null;
    userId: number;
    vendorProfileId: number;
    createdAt: Date;
}

interface PaginatedReviews {
    items: Review[];
    total: number;
    page: number;
    limit: number;
    averageRating: number;
}

class ReviewService {
    async findByVendor(vendorId: number, query: ListReviewsQuery): Promise<PaginatedReviews> {
        logger.info(`Review Service: Fetching reviews for vendor ID: ${vendorId}`);
        throw new AppError('List reviews functionality not implemented yet', 501);
    }

    async create(userId: number, vendorId: number, data: CreateReviewInput): Promise<Review> {
        logger.info(`Review Service: Creating review for vendor ID: ${vendorId} by user: ${userId}`);
        throw new AppError('Create review functionality not implemented yet', 501);
    }
}

export const reviewService = new ReviewService();

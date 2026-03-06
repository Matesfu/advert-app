import { UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { vendorService } from '../vendors/vendor.service';
import { sendNewReviewEmail } from '../../utils/mailer';
import type { CreateReviewInput, UpdateReviewInput, ListReviewsQuery } from './review.schema';

/**
 * Review Service — Business logic for vendor reviews.
 *
 * Key rules:
 * - One review per user per vendor (enforced by @@unique + app-level check)
 * - No self-reviews (vendor owner cannot review their own profile)
 * - Same-category competition guard (vendors in the same ServiceCategory cannot review each other)
 * - Always recalculate vendor stats after mutations
 * - Email notification to vendor owner on new review
 */
class ReviewService {
    /**
     * Create a new review for a vendor profile.
     */
    async create(userId: number, vendorProfileId: number, data: CreateReviewInput) {
        // 1. Verify vendor profile exists and is active
        const vendorProfile = await prisma.vendorProfile.findUnique({
            where: { id: vendorProfileId },
            include: {
                owner: { select: { id: true, email: true } },
            },
        });

        if (!vendorProfile || vendorProfile.deletedAt) {
            throw new AppError('Vendor profile not found.', 404);
        }

        // 2. Prevent self-review
        if (vendorProfile.userId === userId) {
            throw new AppError('You cannot review your own vendor profile.', 403);
        }

        // 3. Same-category competition guard
        const reviewerVendorInSameCategory = await prisma.vendorProfile.findFirst({
            where: {
                userId,
                serviceCategoryId: vendorProfile.serviceCategoryId,
                deletedAt: null,
            },
        });

        if (reviewerVendorInSameCategory) {
            throw new AppError(
                'You cannot review a vendor in the same service category as your own business.',
                403
            );
        }

        // 4. Check for duplicate review (friendly error before DB constraint)
        const existingReview = await prisma.review.findUnique({
            where: {
                userId_vendorProfileId: { userId, vendorProfileId },
            },
        });

        if (existingReview) {
            throw new AppError(
                'You have already reviewed this vendor. You can update your existing review instead.',
                409
            );
        }

        // 5. Create the review
        const review = await prisma.review.create({
            data: {
                rating: data.rating,
                comment: data.comment ?? null,
                userId,
                vendorProfileId,
            },
            include: {
                user: { select: { displayName: true, avatarUrl: true } },
            },
        });

        // 6. Recalculate vendor stats
        await vendorService.recalculateReviewStats(vendorProfileId);

        // 7. Send email notification to vendor owner (fire-and-forget)
        const reviewer = await prisma.user.findUnique({
            where: { id: userId },
            select: { displayName: true },
        });

        sendNewReviewEmail(
            vendorProfile.owner.email,
            reviewer?.displayName || 'A user',
            data.rating,
            data.comment ?? null,
            vendorProfile.businessName,
            vendorProfileId
        );

        logger.info(
            `[ReviewService] Review created: user ${userId} → vendor ${vendorProfileId}, rating: ${data.rating}`
        );

        return review;
    }

    /**
     * List reviews for a vendor profile with pagination and sorting.
     */
    async findByVendor(vendorProfileId: number, query: ListReviewsQuery) {
        // Verify vendor profile exists
        const vendorProfile = await prisma.vendorProfile.findUnique({
            where: { id: vendorProfileId },
            select: { id: true, averageRating: true, reviewCount: true },
        });

        if (!vendorProfile) {
            throw new AppError('Vendor profile not found.', 404);
        }

        // Determine sort order
        const orderBy = this.getSortOrder(query.sortBy);

        const [reviews, total] = await Promise.all([
            prisma.review.findMany({
                where: { vendorProfileId },
                include: {
                    user: { select: { id: true, displayName: true, avatarUrl: true, deletedAt: true } },
                },
                orderBy,
                skip: (query.page - 1) * query.limit,
                take: query.limit,
            }),
            prisma.review.count({ where: { vendorProfileId } }),
        ]);

        // Mask deleted users
        const sanitizedReviews = reviews.map((review) => ({
            ...review,
            user: review.user.deletedAt
                ? { id: review.user.id, displayName: 'Deleted User', avatarUrl: null }
                : { id: review.user.id, displayName: review.user.displayName, avatarUrl: review.user.avatarUrl },
        }));

        return {
            reviews: sanitizedReviews,
            averageRating: vendorProfile.averageRating,
            reviewCount: vendorProfile.reviewCount,
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit),
            },
        };
    }

    /**
     * Update a review (author only).
     */
    async update(reviewId: number, userId: number, data: UpdateReviewInput) {
        const review = await prisma.review.findUnique({
            where: { id: reviewId },
        });

        if (!review) {
            throw new AppError('Review not found.', 404);
        }

        if (review.userId !== userId) {
            throw new AppError('You can only update your own reviews.', 403);
        }

        const ratingChanged = data.rating !== undefined && data.rating !== review.rating;

        const updated = await prisma.review.update({
            where: { id: reviewId },
            data: {
                ...(data.rating !== undefined && { rating: data.rating }),
                ...(data.comment !== undefined && { comment: data.comment }),
            },
            include: {
                user: { select: { displayName: true, avatarUrl: true } },
            },
        });

        // Recalculate stats if rating changed
        if (ratingChanged) {
            await vendorService.recalculateReviewStats(review.vendorProfileId);
        }

        logger.info(
            `[ReviewService] Review ${reviewId} updated by user ${userId}` +
            (ratingChanged ? ` (rating: ${review.rating} → ${data.rating})` : '')
        );

        return updated;
    }

    /**
     * Delete a review (author or ADMIN).
     */
    async delete(reviewId: number, userId: number, userRole: UserRole) {
        const review = await prisma.review.findUnique({
            where: { id: reviewId },
        });

        if (!review) {
            throw new AppError('Review not found.', 404);
        }

        const isOwner = review.userId === userId;
        const isAdmin = userRole === UserRole.ADMIN;

        if (!isOwner && !isAdmin) {
            throw new AppError('You do not have permission to delete this review.', 403);
        }

        await prisma.review.delete({ where: { id: reviewId } });

        // Recalculate vendor stats
        await vendorService.recalculateReviewStats(review.vendorProfileId);

        logger.info(
            `[ReviewService] Review ${reviewId} deleted by user ${userId} (${isAdmin ? 'ADMIN' : 'owner'})`
        );
    }

    // ── Private helpers ──

    private getSortOrder(sortBy: string) {
        switch (sortBy) {
            case 'oldest':
                return { createdAt: 'asc' as const };
            case 'highest':
                return { rating: 'desc' as const };
            case 'lowest':
                return { rating: 'asc' as const };
            case 'newest':
            default:
                return { createdAt: 'desc' as const };
        }
    }
}

export const reviewService = new ReviewService();

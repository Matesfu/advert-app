import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { Prisma } from '@prisma/client';

/**
 * Favorite Service — Business logic for the favorites / wishlist feature.
 *
 * Key design decisions:
 * - **Self-favorite guard**: Vendors cannot add their own profiles to favorites.
 * - **Soft-delete awareness**: Favorites only reference active (non-deleted) vendor profiles.
 * - **Unique constraint**: The DB-level `@@unique([userId, vendorProfileId])` prevents
 *   duplicate favorites; the service catches P2002 and returns a friendly 409 error.
 */
class FavoriteService {
    /**
     * List all favorites for a given user.
     *
     * Includes summary vendor profile data and excludes favorites
     * that reference a soft-deleted vendor profile.
     */
    async findByUser(userId: number) {
        logger.info(`[FavoriteService] Fetching favorites for user ID: ${userId}`);

        const favorites = await prisma.favorite.findMany({
            where: {
                userId,
                vendorProfile: {
                    deletedAt: null, // Exclude soft-deleted vendors
                },
            },
            include: {
                vendorProfile: {
                    select: {
                        id: true,
                        businessName: true,
                        city: true,
                        basePrice: true,
                        averageRating: true,
                        reviewCount: true,
                        portfolioImages: true,
                        serviceCategory: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return favorites;
    }

    /**
     * Add a vendor profile to the user's favorites.
     *
     * Guards:
     *  1. Vendor profile must exist and not be soft-deleted → 404
     *  2. User must not own the vendor profile → 403 (self-favorite)
     *  3. Must not already be in favorites → 409 (duplicate)
     */
    async add(userId: number, vendorProfileId: number) {
        logger.info(`[FavoriteService] Adding vendor ${vendorProfileId} to favorites for user: ${userId}`);

        // 1. Validate vendor profile exists and is active
        const vendorProfile = await prisma.vendorProfile.findFirst({
            where: {
                id: vendorProfileId,
                deletedAt: null,
            },
            select: {
                id: true,
                userId: true,
            },
        });

        if (!vendorProfile) {
            throw new AppError('Vendor profile not found', 404);
        }

        // 2. Self-favorite guard — vendors cannot favorite their own profiles
        if (vendorProfile.userId === userId) {
            throw new AppError('You cannot add your own vendor profile to favorites', 403);
        }

        // 3. Create the favorite record (unique constraint catches duplicates)
        try {
            const favorite = await prisma.favorite.create({
                data: {
                    userId,
                    vendorProfileId,
                },
                include: {
                    vendorProfile: {
                        select: {
                            id: true,
                            businessName: true,
                            city: true,
                            basePrice: true,
                            averageRating: true,
                            reviewCount: true,
                            portfolioImages: true,
                            serviceCategory: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                },
                            },
                        },
                    },
                },
            });

            return favorite;
        } catch (error) {
            // P2002 = Unique constraint violation → vendor already in favorites
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new AppError('Vendor profile is already in your favorites', 409);
            }
            throw error;
        }
    }

    /**
     * Remove a vendor profile from the user's favorites.
     *
     * Uses the compound unique key `userId_vendorProfileId` for a precise delete.
     * Returns 404 if the favorite entry does not exist.
     */
    async remove(userId: number, vendorProfileId: number) {
        logger.info(`[FavoriteService] Removing vendor ${vendorProfileId} from favorites for user: ${userId}`);

        try {
            await prisma.favorite.delete({
                where: {
                    userId_vendorProfileId: {
                        userId,
                        vendorProfileId,
                    },
                },
            });
        } catch (error) {
            // P2025 = Record not found
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new AppError('Favorite not found', 404);
            }
            throw error;
        }
    }
}

export const favoriteService = new FavoriteService();

import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { MAX_PORTFOLIO_IMAGES } from './vendor.schema';
import type { UserRole } from '@prisma/client';
import type {
    CreateVendorInput,
    UpdateVendorInput,
    CreateServiceInput,
    ListVendorsQuery,
    UpdatePortfolioImagesInput,
} from './vendor.schema';

/**
 * Vendor Service — Business logic for vendor profiles and nested services.
 *
 * Key design decisions:
 * - **Soft Delete**: `delete()` sets `deletedAt` instead of removing the row,
 *   preserving reviews, favorites, and conversation history.
 * - **Image Management**: Portfolio images are managed via dedicated `updatePortfolioImages()`
 *   with add/remove operations and a max cap (MAX_PORTFOLIO_IMAGES).
 * - **Soft-delete filtering**: All public queries (`findAll`, `findById`) exclude
 *   soft-deleted profiles automatically.
 */
class VendorServiceClass {
    // ========================================
    // PRIVATE HELPERS
    // ========================================

    /**
     * Base WHERE clause that excludes soft-deleted profiles.
     */
    private get activeFilter() {
        return { deletedAt: null };
    }

    // ========================================
    // VENDOR PROFILE CRUD
    // ========================================

    /**
     * Create a new vendor profile.
     *
     * Rules:
     *  - Feature‑flag gating via `VENDOR_ROLE_ENFORCED`.
     *  - One profile per ServiceCategory per user (soft-deleted profiles don't count).
     *  - ServiceCategory must exist.
     */
    async create(userId: number, userRole: UserRole, data: CreateVendorInput) {
        // Feature‑flag check
        if (env.VENDOR_ROLE_ENFORCED) {
            if (userRole !== 'VENDOR' && userRole !== 'ADMIN') {
                throw new AppError(
                    'Vendor role required. Subscribe to become a vendor.',
                    403,
                );
            }
        }

        // Verify the service category exists
        const category = await prisma.serviceCategory.findUnique({
            where: { id: data.serviceCategoryId },
        });

        if (!category) {
            throw new AppError(
                `Service category with ID ${data.serviceCategoryId} not found`,
                404,
            );
        }

        // Enforce one profile per category per user (exclude soft-deleted)
        const existing = await prisma.vendorProfile.findFirst({
            where: {
                userId,
                serviceCategoryId: data.serviceCategoryId,
                ...this.activeFilter,
            },
        });

        if (existing) {
            throw new AppError(
                `You already have a vendor profile in the "${category.name}" category. One profile per category is allowed.`,
                409,
            );
        }

        const vendor = await prisma.vendorProfile.create({
            data: {
                businessName: data.businessName,
                bio: data.bio ?? null,
                basePrice: data.basePrice,
                city: data.city,
                portfolioImages: data.portfolioImages ?? [],
                locationCoordinates: data.locationCoordinates ?? undefined,
                userId,
                serviceCategoryId: data.serviceCategoryId,
            },
            include: {
                serviceCategory: { select: { id: true, name: true, slug: true } },
                _count: { select: { services: true, reviews: true } },
            },
        });

        logger.info(
            `[VendorService] Created profile "${vendor.businessName}" (ID ${vendor.id}) in category "${category.name}" for user ${userId}`,
        );

        return vendor;
    }

    /**
     * List vendor profiles with filtering, searching, sorting, and pagination.
     *
     * Automatically excludes soft-deleted profiles.
     */
    async findAll(query: ListVendorsQuery) {
        const { page, limit, city, minPrice, maxPrice, search, serviceCategoryId, sortBy, sortOrder } = query;
        const skip = (page - 1) * limit;

        // Build dynamic WHERE clause — always exclude soft-deleted
        const where: Record<string, unknown> = { ...this.activeFilter };

        if (city) {
            where.city = { contains: city, mode: 'insensitive' as const };
        }

        // Filter by service category
        if (serviceCategoryId) {
            where.serviceCategoryId = serviceCategoryId;
        }

        // Price range filter on basePrice
        if (minPrice !== undefined || maxPrice !== undefined) {
            const priceFilter: Record<string, number> = {};
            if (minPrice !== undefined) priceFilter.gte = minPrice;
            if (maxPrice !== undefined) priceFilter.lte = maxPrice;
            where.basePrice = priceFilter;
        }

        // Full-text search across businessName and bio
        if (search) {
            where.OR = [
                { businessName: { contains: search, mode: 'insensitive' as const } },
                { bio: { contains: search, mode: 'insensitive' as const } },
            ];
        }

        // Build orderBy — 'popularity' uses compound sort, others use single field
        const orderBy =
            sortBy === 'popularity'
                ? [{ averageRating: sortOrder }, { reviewCount: sortOrder }]
                : { [sortBy]: sortOrder };

        // Run count + data in parallel for efficiency
        const [total, vendors] = await Promise.all([
            prisma.vendorProfile.count({ where }),
            prisma.vendorProfile.findMany({
                where,
                skip,
                take: limit,
                orderBy: orderBy as any,
                include: {
                    serviceCategory: { select: { id: true, name: true, slug: true } },
                    _count: { select: { services: true, reviews: true } },
                    owner: {
                        select: { id: true, displayName: true, avatarUrl: true },
                    },
                },
            }),
        ]);

        const totalPages = Math.ceil(total / limit);

        logger.info(
            `[VendorService] Listed vendors: page=${page}, total=${total}`,
        );

        return {
            items: vendors,
            total,
            page,
            limit,
            totalPages,
        };
    }

    /**
     * Get a single vendor profile by ID, including related data.
     *
     * Returns 404 if the profile is soft-deleted.
     */
    async findById(id: number) {
        const vendor = await prisma.vendorProfile.findFirst({
            where: { id, ...this.activeFilter },
            include: {
                serviceCategory: { select: { id: true, name: true, slug: true } },
                services: true,
                _count: { select: { reviews: true, services: true, favorites: true } },
                owner: {
                    select: { id: true, displayName: true, avatarUrl: true },
                },
            },
        });

        if (!vendor) {
            throw new AppError(`Vendor profile with ID ${id} not found`, 404);
        }

        logger.info(`[VendorService] Found vendor: ${vendor.businessName} (ID ${id})`);
        return vendor;
    }

    /**
     * Update a vendor profile (partial update).
     *
     * - Ownership: only the profile owner or an ADMIN can update.
     * - Note: portfolioImages are managed separately via `updatePortfolioImages()`.
     */
    async update(id: number, userId: number, userRole: UserRole, data: UpdateVendorInput) {
        const existing = await prisma.vendorProfile.findFirst({
            where: { id, ...this.activeFilter },
        });

        if (!existing) {
            throw new AppError(`Vendor profile with ID ${id} not found`, 404);
        }

        // Ownership check — owner or admin
        if (existing.userId !== userId && userRole !== 'ADMIN') {
            throw new AppError('You do not have permission to update this profile', 403);
        }

        const vendor = await prisma.vendorProfile.update({
            where: { id },
            data: {
                ...(data.businessName !== undefined && { businessName: data.businessName }),
                ...(data.bio !== undefined && { bio: data.bio }),
                ...(data.basePrice !== undefined && { basePrice: data.basePrice }),
                ...(data.city !== undefined && { city: data.city }),
                ...(data.locationCoordinates !== undefined && { locationCoordinates: data.locationCoordinates }),
            },
            include: {
                _count: { select: { services: true, reviews: true } },
            },
        });

        logger.info(`[VendorService] Updated vendor ID ${id} by user ${userId}`);
        return vendor;
    }

    /**
     * Soft-delete a vendor profile.
     *
     * Sets `deletedAt` to the current timestamp instead of removing the row.
     * This preserves:
     *  - Reviews and ratings left by customers
     *  - Favorite/wishlist entries
     *  - Conversation/message history
     *
     * The profile will no longer appear in public queries.
     */
    async delete(id: number, userId: number, userRole: UserRole) {
        const existing = await prisma.vendorProfile.findFirst({
            where: { id, ...this.activeFilter },
        });

        if (!existing) {
            throw new AppError(`Vendor profile with ID ${id} not found`, 404);
        }

        // Ownership check — owner or admin
        if (existing.userId !== userId && userRole !== 'ADMIN') {
            throw new AppError('You do not have permission to delete this profile', 403);
        }

        await prisma.vendorProfile.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        logger.info(`[VendorService] Soft-deleted vendor ID ${id} by user ${userId}`);
    }

    // ========================================
    // PORTFOLIO IMAGE MANAGEMENT
    // ========================================

    /**
     * Update portfolio images with granular add/remove operations.
     *
     * - `add`: Appends new image URLs (up to MAX_PORTFOLIO_IMAGES total).
     * - `remove`: Removes specific image URLs from the current array.
     * - Both can be provided in a single request.
     *
     * Processing order: remove first, then add (to free slots before adding).
     */
    async updatePortfolioImages(
        id: number,
        userId: number,
        data: UpdatePortfolioImagesInput,
    ) {
        const vendor = await prisma.vendorProfile.findFirst({
            where: { id, ...this.activeFilter },
        });

        if (!vendor) {
            throw new AppError(`Vendor profile with ID ${id} not found`, 404);
        }

        if (vendor.userId !== userId) {
            throw new AppError('You do not have permission to update this profile', 403);
        }

        let currentImages = [...vendor.portfolioImages];

        // Step 1: Remove images first (frees up slots)
        if (data.remove && data.remove.length > 0) {
            const removeSet = new Set(data.remove);
            const beforeCount = currentImages.length;
            currentImages = currentImages.filter((img) => !removeSet.has(img));

            const removedCount = beforeCount - currentImages.length;
            if (removedCount === 0) {
                logger.warn(`[VendorService] No matching images found to remove for vendor ID ${id}`);
            }
        }

        // Step 2: Add new images (respect max limit)
        if (data.add && data.add.length > 0) {
            // Deduplicate: skip images that already exist
            const existingSet = new Set(currentImages);
            const newImages = data.add.filter((img) => !existingSet.has(img));

            const availableSlots = MAX_PORTFOLIO_IMAGES - currentImages.length;

            if (newImages.length > availableSlots) {
                throw new AppError(
                    `Cannot add ${newImages.length} image(s). You have ${currentImages.length}/${MAX_PORTFOLIO_IMAGES} images. ` +
                    `Only ${availableSlots} slot(s) available.`,
                    400,
                );
            }

            currentImages.push(...newImages);
        }

        const updated = await prisma.vendorProfile.update({
            where: { id },
            data: { portfolioImages: currentImages },
            include: {
                _count: { select: { services: true, reviews: true } },
            },
        });

        logger.info(
            `[VendorService] Updated portfolio images for vendor ID ${id}: ${currentImages.length} images`,
        );

        return updated;
    }

    // ========================================
    // SERVICE MANAGEMENT (nested under vendor)
    // ========================================

    /**
     * Add a service package to a vendor profile.
     *
     * Validates: vendor ownership, service category existence, vendor is active.
     */
    async addService(vendorId: number, userId: number, data: CreateServiceInput) {
        // Verify vendor profile exists, is active, and belongs to user
        const vendor = await prisma.vendorProfile.findFirst({
            where: { id: vendorId, ...this.activeFilter },
        });

        if (!vendor) {
            throw new AppError(`Vendor profile with ID ${vendorId} not found`, 404);
        }

        if (vendor.userId !== userId) {
            throw new AppError('You do not have permission to add services to this profile', 403);
        }

        const service = await prisma.service.create({
            data: {
                name: data.name,
                description: data.description ?? null,
                price: data.price,
                vendorProfileId: vendorId,
            },
        });

        logger.info(
            `[VendorService] Added service "${service.name}" to vendor ID ${vendorId}`,
        );

        return service;
    }

    /**
     * Remove a service from a vendor profile.
     *
     * Validates: vendor ownership and that the service belongs to this vendor.
     */
    async removeService(vendorId: number, serviceId: number, userId: number) {
        const vendor = await prisma.vendorProfile.findFirst({
            where: { id: vendorId, ...this.activeFilter },
        });

        if (!vendor) {
            throw new AppError(`Vendor profile with ID ${vendorId} not found`, 404);
        }

        if (vendor.userId !== userId) {
            throw new AppError('You do not have permission to manage this profile', 403);
        }

        const service = await prisma.service.findUnique({ where: { id: serviceId } });

        if (!service || service.vendorProfileId !== vendorId) {
            throw new AppError(
                `Service with ID ${serviceId} not found on vendor profile ${vendorId}`,
                404,
            );
        }

        await prisma.service.delete({ where: { id: serviceId } });

        logger.info(
            `[VendorService] Removed service ID ${serviceId} from vendor ID ${vendorId}`,
        );
    }

    /**
     * Get all services for a vendor profile.
     */
    async getServices(vendorId: number) {
        // Verify vendor exists and is active
        const vendor = await prisma.vendorProfile.findFirst({
            where: { id: vendorId, ...this.activeFilter },
        });

        if (!vendor) {
            throw new AppError(`Vendor profile with ID ${vendorId} not found`, 404);
        }

        const services = await prisma.service.findMany({
            where: { vendorProfileId: vendorId },
        });

        logger.info(
            `[VendorService] Fetched ${services.length} services for vendor ID ${vendorId}`,
        );

        return services;
    }

    // ========================================
    // REVIEW STATS (denormalized aggregation)
    // ========================================

    /**
     * Recalculate and persist `averageRating` and `reviewCount` for a vendor profile.
     *
     * This should be called by the Review module whenever a review is:
     *  - Created
     *  - Updated (rating changed)
     *  - Deleted
     *
     * The values are stored directly on VendorProfile for fast sorting/filtering
     * without needing a JOIN + GROUP BY on every list request.
     */
    async recalculateReviewStats(vendorProfileId: number) {
        const stats = await prisma.review.aggregate({
            where: { vendorProfileId },
            _avg: { rating: true },
            _count: { rating: true },
        });

        const averageRating = Math.round((stats._avg.rating ?? 0) * 10) / 10; // 1 decimal
        const reviewCount = stats._count.rating;

        await prisma.vendorProfile.update({
            where: { id: vendorProfileId },
            data: { averageRating, reviewCount },
        });

        logger.info(
            `[VendorService] Recalculated review stats for vendor ID ${vendorProfileId}: ` +
            `avg=${averageRating}, count=${reviewCount}`,
        );

        return { averageRating, reviewCount };
    }
}

// Export singleton instance
export const vendorService = new VendorServiceClass();

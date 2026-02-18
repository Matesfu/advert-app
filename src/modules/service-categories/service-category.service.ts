import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type {
    CreateServiceCategoryInput,
    UpdateServiceCategoryInput,
    ListServiceCategoriesQuery,
} from './service-category.schema';

class ServiceCategoryService {
    // ========================================
    // PRIVATE HELPERS
    // ========================================

    /**
     * Generate a URL-safe slug from a name.
     * e.g., "Wedding DJ" → "wedding-dj"
     */
    private generateSlug(name: string): string {
        return name
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')   // Remove special characters
            .replace(/\s+/g, '-')        // Replace spaces with hyphens
            .replace(/-+/g, '-')         // Collapse multiple hyphens
            .replace(/^-|-$/g, '');      // Trim leading/trailing hyphens
    }

    /**
     * Common include clause for returning categories with linked event types.
     */
    private get includeEventTypes() {
        return {
            eventTypes: {
                include: {
                    eventType: {
                        select: { id: true, name: true, slug: true },
                    },
                },
            },
        };
    }

    // ========================================
    // CREATE
    // ========================================

    async create(data: CreateServiceCategoryInput) {
        const slug = this.generateSlug(data.name);

        // Check uniqueness (name and slug are both @unique in schema)
        const existing = await prisma.serviceCategory.findFirst({
            where: {
                OR: [{ name: data.name }, { slug }],
            },
        });

        if (existing) {
            throw new AppError(
                `A service category with this name already exists: "${existing.name}"`,
                409
            );
        }

        const serviceCategory = await prisma.serviceCategory.create({
            data: {
                name: data.name,
                slug,
                imageUrl: data.imageUrl ?? null,
            },
            include: this.includeEventTypes,
        });

        logger.info(
            `[ServiceCategoryService] Created: ${serviceCategory.name} (${serviceCategory.slug})`
        );
        return serviceCategory;
    }

    // ========================================
    // LIST (paginated, searchable, sortable)
    // ========================================

    async findAll(query: ListServiceCategoriesQuery) {
        const { page, limit, search, eventTypeId, sortBy, order } = query;
        const skip = (page - 1) * limit;

        // Build where clause: search + optional eventTypeId filter
        const where: Record<string, unknown> = {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' as const } },
                { slug: { contains: search, mode: 'insensitive' as const } },
            ];
        }

        // Filter categories that belong to a specific EventType via bridge table
        if (eventTypeId) {
            where.eventTypes = {
                some: { eventTypeId },
            };
        }

        // Run count + data in parallel
        const [total, serviceCategories] = await Promise.all([
            prisma.serviceCategory.count({ where }),
            prisma.serviceCategory.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: order },
                include: {
                    _count: { select: { eventTypes: true, vendorProfiles: true } },
                    ...this.includeEventTypes,
                },
            }),
        ]);

        const totalPages = Math.ceil(total / limit);

        logger.info(
            `[ServiceCategoryService] Listed: page=${page}, total=${total}`
        );

        return {
            serviceCategories,
            meta: { page, limit, total, totalPages },
        };
    }

    // ========================================
    // FIND BY ID
    // ========================================

    async findById(id: number) {
        const serviceCategory = await prisma.serviceCategory.findUnique({
            where: { id },
            include: {
                _count: { select: { eventTypes: true, vendorProfiles: true } },
                ...this.includeEventTypes,
            },
        });

        if (!serviceCategory) {
            throw new AppError(`Service category with ID ${id} not found`, 404);
        }

        logger.info(`[ServiceCategoryService] Found: ${serviceCategory.name}`);
        return serviceCategory;
    }

    // ========================================
    // UPDATE (name and/or imageUrl)
    // ========================================

    async update(id: number, data: UpdateServiceCategoryInput) {
        // Ensure the service category exists
        const existing = await prisma.serviceCategory.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(`Service category with ID ${id} not found`, 404);
        }

        // Build the update payload
        const updateData: { name?: string; slug?: string; imageUrl?: string | null } = {};

        if (data.name !== undefined) {
            const newSlug = this.generateSlug(data.name);

            // Check uniqueness of the new name/slug (excluding current record)
            const duplicate = await prisma.serviceCategory.findFirst({
                where: {
                    OR: [{ name: data.name }, { slug: newSlug }],
                    NOT: { id },
                },
            });

            if (duplicate) {
                throw new AppError(
                    `A service category with this name already exists: "${duplicate.name}"`,
                    409
                );
            }

            updateData.name = data.name;
            updateData.slug = newSlug;
        }

        if (data.imageUrl !== undefined) {
            // null → clear the image, string → set new URL
            updateData.imageUrl = data.imageUrl;
        }

        const serviceCategory = await prisma.serviceCategory.update({
            where: { id },
            data: updateData,
            include: {
                _count: { select: { eventTypes: true, vendorProfiles: true } },
                ...this.includeEventTypes,
            },
        });

        logger.info(`[ServiceCategoryService] Updated ID ${id}`);
        return serviceCategory;
    }

    // ========================================
    // DELETE (guarded — blocks if services exist)
    // ========================================

    async delete(id: number) {
        const existing = await prisma.serviceCategory.findUnique({
            where: { id },
            include: {
                _count: { select: { vendorProfiles: true, eventTypes: true } },
            },
        });

        if (!existing) {
            throw new AppError(`Service category with ID ${id} not found`, 404);
        }

        // Guard: prevent deletion when services are still linked
        if (existing._count.vendorProfiles > 0) {
            throw new AppError(
                `Cannot delete: ${existing._count.vendorProfiles} vendor profile(s) still reference this category. Reassign or remove them first.`,
                409
            );
        }

        // Cascade: remove bridge records first, then the category
        await prisma.$transaction(async (tx) => {
            await tx.eventTypeServiceCategory.deleteMany({
                where: { serviceCategoryId: id },
            });
            await tx.serviceCategory.delete({ where: { id } });
        });

        logger.info(
            `[ServiceCategoryService] Deleted: ${existing.name} (ID ${id})`
        );
    }
}

export const serviceCategoryService = new ServiceCategoryService();

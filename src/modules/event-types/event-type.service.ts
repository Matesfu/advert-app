import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type {
    CreateEventTypeInput,
    UpdateEventTypeInput,
    ListEventTypesQuery,
} from './event-type.schema';

class EventTypeService {
    // ========================================
    // PRIVATE HELPERS
    // ========================================

    /**
     * Generate a URL-safe slug from a name.
     * e.g., "Wedding DJ Party" → "wedding-dj-party"
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
     * Common include clause for returning event types with their linked categories.
     */
    private get includeCategories() {
        return {
            serviceCategories: {
                include: {
                    serviceCategory: {
                        select: { id: true, name: true, slug: true },
                    },
                },
            },
        };
    }

    // ========================================
    // CREATE
    // ========================================

    async create(data: CreateEventTypeInput) {
        const slug = this.generateSlug(data.name);

        // Check uniqueness (name and slug are both @unique in schema)
        const existing = await prisma.eventType.findFirst({
            where: {
                OR: [{ name: data.name }, { slug }],
            },
        });

        if (existing) {
            throw new AppError(
                `An event type with this name already exists: "${existing.name}"`,
                409
            );
        }

        const eventType = await prisma.eventType.create({
            data: { name: data.name, slug },
            include: this.includeCategories,
        });

        logger.info(`[EventTypeService] Created event type: ${eventType.name} (${eventType.slug})`);
        return eventType;
    }

    // ========================================
    // LIST (paginated, searchable, sortable)
    // ========================================

    async findAll(query: ListEventTypesQuery) {
        const { page, limit, search, sortBy, order } = query;
        const skip = (page - 1) * limit;

        // Build where clause for search
        const where = search
            ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' as const } },
                    { slug: { contains: search, mode: 'insensitive' as const } },
                ],
            }
            : {};

        // Run count + data in parallel
        const [total, eventTypes] = await Promise.all([
            prisma.eventType.count({ where }),
            prisma.eventType.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: order },
                include: {
                    _count: { select: { serviceCategories: true } },
                    ...this.includeCategories,
                },
            }),
        ]);

        const totalPages = Math.ceil(total / limit);

        logger.info(
            `[EventTypeService] Listed event types: page=${page}, total=${total}`
        );

        return {
            eventTypes,
            meta: { page, limit, total, totalPages },
        };
    }

    // ========================================
    // FIND BY ID
    // ========================================

    async findById(id: number) {
        const eventType = await prisma.eventType.findUnique({
            where: { id },
            include: this.includeCategories,
        });

        if (!eventType) {
            throw new AppError(`Event type with ID ${id} not found`, 404);
        }

        logger.info(`[EventTypeService] Found event type: ${eventType.name}`);
        return eventType;
    }

    // ========================================
    // UPDATE (name and/or service categories)
    // ========================================

    async update(id: number, data: UpdateEventTypeInput) {
        // Ensure the event type exists
        const existing = await prisma.eventType.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(`Event type with ID ${id} not found`, 404);
        }

        // Build the update payload for the EventType record itself
        const updateData: { name?: string; slug?: string } = {};

        if (data.name !== undefined) {
            const newSlug = this.generateSlug(data.name);

            // Check uniqueness of the new name/slug (excluding current record)
            const duplicate = await prisma.eventType.findFirst({
                where: {
                    OR: [{ name: data.name }, { slug: newSlug }],
                    NOT: { id },
                },
            });

            if (duplicate) {
                throw new AppError(
                    `An event type with this name already exists: "${duplicate.name}"`,
                    409
                );
            }

            updateData.name = data.name;
            updateData.slug = newSlug;
        }

        // Use a transaction to atomically update name + sync categories
        const eventType = await prisma.$transaction(async (tx) => {
            // 1. Update name/slug if provided
            if (Object.keys(updateData).length > 0) {
                await tx.eventType.update({
                    where: { id },
                    data: updateData,
                });
            }

            // 2. Sync service categories if provided
            if (data.serviceCategoryIds !== undefined) {
                // Validate that all provided category IDs exist
                if (data.serviceCategoryIds.length > 0) {
                    const existingCategories = await tx.serviceCategory.findMany({
                        where: { id: { in: data.serviceCategoryIds } },
                        select: { id: true },
                    });

                    const foundIds = existingCategories.map((c) => c.id);
                    const missingIds = data.serviceCategoryIds.filter(
                        (cid) => !foundIds.includes(cid)
                    );

                    if (missingIds.length > 0) {
                        throw new AppError(
                            `Service categories not found: ${missingIds.join(', ')}`,
                            400
                        );
                    }
                }

                // Delete all existing links
                await tx.eventTypeServiceCategory.deleteMany({
                    where: { eventTypeId: id },
                });

                // Create new links (if any)
                if (data.serviceCategoryIds.length > 0) {
                    await tx.eventTypeServiceCategory.createMany({
                        data: data.serviceCategoryIds.map((serviceCategoryId) => ({
                            eventTypeId: id,
                            serviceCategoryId,
                        })),
                    });
                }
            }

            // 3. Return the full updated record
            return tx.eventType.findUnique({
                where: { id },
                include: {
                    serviceCategories: {
                        include: {
                            serviceCategory: {
                                select: { id: true, name: true, slug: true },
                            },
                        },
                    },
                },
            });
        });

        logger.info(`[EventTypeService] Updated event type ID ${id}`);
        return eventType;
    }

    // ========================================
    // DELETE
    // ========================================

    async delete(id: number) {
        const existing = await prisma.eventType.findUnique({
            where: { id },
            include: { _count: { select: { serviceCategories: true } } },
        });

        if (!existing) {
            throw new AppError(`Event type with ID ${id} not found`, 404);
        }

        // Cascade: remove bridge records first, then the event type
        await prisma.$transaction(async (tx) => {
            await tx.eventTypeServiceCategory.deleteMany({
                where: { eventTypeId: id },
            });
            await tx.eventType.delete({ where: { id } });
        });

        logger.info(
            `[EventTypeService] Deleted event type: ${existing.name} (ID ${id})`
        );
    }

    // ========================================
    // SYNC CATEGORIES (dedicated endpoint)
    // ========================================

    async syncCategories(id: number, serviceCategoryIds: number[]) {
        // Ensure event type exists
        const existing = await prisma.eventType.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(`Event type with ID ${id} not found`, 404);
        }

        // Validate that all provided category IDs exist
        if (serviceCategoryIds.length > 0) {
            const existingCategories = await prisma.serviceCategory.findMany({
                where: { id: { in: serviceCategoryIds } },
                select: { id: true },
            });

            const foundIds = existingCategories.map((c) => c.id);
            const missingIds = serviceCategoryIds.filter(
                (cid) => !foundIds.includes(cid)
            );

            if (missingIds.length > 0) {
                throw new AppError(
                    `Service categories not found: ${missingIds.join(', ')}`,
                    400
                );
            }
        }

        // Full-replace: delete all, then re-create
        const eventType = await prisma.$transaction(async (tx) => {
            await tx.eventTypeServiceCategory.deleteMany({
                where: { eventTypeId: id },
            });

            if (serviceCategoryIds.length > 0) {
                await tx.eventTypeServiceCategory.createMany({
                    data: serviceCategoryIds.map((serviceCategoryId) => ({
                        eventTypeId: id,
                        serviceCategoryId,
                    })),
                });
            }

            return tx.eventType.findUnique({
                where: { id },
                include: {
                    serviceCategories: {
                        include: {
                            serviceCategory: {
                                select: { id: true, name: true, slug: true },
                            },
                        },
                    },
                },
            });
        });

        logger.info(
            `[EventTypeService] Synced ${serviceCategoryIds.length} categories for event type ID ${id}`
        );

        return eventType;
    }
}

export const eventTypeService = new EventTypeService();

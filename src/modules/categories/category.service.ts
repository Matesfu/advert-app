import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';

interface EventType {
    id: number;
    name: string;
    slug: string;
    serviceCategories?: ServiceCategory[];
}

interface ServiceCategory {
    id: number;
    name: string;
    slug: string;
    imageUrl?: string | null;
    vendorCount?: number;
    eventTypes?: EventType[];
}

class CategoryService {
    async getAllEventTypes(): Promise<EventType[]> {
        logger.info('Category Service: Fetching all event types');
        throw new AppError('List event types functionality not implemented yet', 501);
    }

    /**
     * Get an event type by slug with its linked service categories.
     *
     * This is the key browsing endpoint:
     *   User clicks "Wedding" → returns the event type with all its
     *   service categories (DJ, Photographer, Catering…) including
     *   imageUrl and vendorCount per category.
     *
     * The bridge table shape is flattened:
     *   BEFORE: serviceCategories: [{ serviceCategory: { id, name } }]
     *   AFTER:  serviceCategories: [{ id, name, slug, imageUrl, vendorCount }]
     */
    async getEventTypeBySlug(slug: string) {
        logger.info(`[CategoryService] Fetching event type by slug: ${slug}`);

        const eventType = await prisma.eventType.findUnique({
            where: { slug },
            include: {
                serviceCategories: {
                    include: {
                        serviceCategory: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                imageUrl: true,
                                _count: {
                                    select: { vendorProfiles: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!eventType) {
            throw new AppError(`Event type with slug "${slug}" not found`, 404);
        }

        // Flatten the bridge table shape for a clean API response
        const result = {
            id: eventType.id,
            name: eventType.name,
            slug: eventType.slug,
            serviceCategories: eventType.serviceCategories.map((link) => ({
                id: link.serviceCategory.id,
                name: link.serviceCategory.name,
                slug: link.serviceCategory.slug,
                imageUrl: link.serviceCategory.imageUrl,
                vendorCount: link.serviceCategory._count.vendorProfiles,
            })),
        };

        logger.info(
            `[CategoryService] Found "${result.name}" with ${result.serviceCategories.length} service categories`
        );

        return result;
    }

    async getAllServiceCategories(): Promise<ServiceCategory[]> {
        logger.info('Category Service: Fetching all service categories');
        throw new AppError('List service categories functionality not implemented yet', 501);
    }

    async getServiceCategoryBySlug(slug: string): Promise<ServiceCategory> {
        logger.info(`Category Service: Fetching service category by slug: ${slug}`);
        throw new AppError('Get service category functionality not implemented yet', 501);
    }
}

export const categoryService = new CategoryService();

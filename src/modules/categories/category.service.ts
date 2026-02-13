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
    eventTypes?: EventType[];
}

class CategoryService {
    async getAllEventTypes(): Promise<EventType[]> {
        logger.info('Category Service: Fetching all event types');
        throw new AppError('List event types functionality not implemented yet', 501);
    }

    async getEventTypeBySlug(slug: string): Promise<EventType> {
        logger.info(`Category Service: Fetching event type by slug: ${slug}`);
        throw new AppError('Get event type functionality not implemented yet', 501);
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

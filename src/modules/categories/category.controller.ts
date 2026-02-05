import { Request, Response } from 'express';
import { categoryService } from './category.service';
import { sendSuccess } from '../../utils/response';
import { logger } from '../../utils/logger';
import type { SlugParam } from './category.schema';

/** GET /api/v1/categories/event-types - List all event types */
export const getAllEventTypes = async (req: Request, res: Response): Promise<void> => {
    logger.info('[CategoryController] Get all event types');
    const eventTypes = await categoryService.getAllEventTypes();
    sendSuccess(res, { eventTypes });
};

/** GET /api/v1/categories/event-types/:slug - Get event type by slug */
export const getEventTypeBySlug = async (req: Request, res: Response): Promise<void> => {
    const { slug } = req.params as unknown as SlugParam;
    logger.info(`[CategoryController] Get event type by slug: ${slug}`);
    const eventType = await categoryService.getEventTypeBySlug(slug);
    sendSuccess(res, { eventType });
};

/** GET /api/v1/categories/service-categories - List all service categories */
export const getAllServiceCategories = async (req: Request, res: Response): Promise<void> => {
    logger.info('[CategoryController] Get all service categories');
    const serviceCategories = await categoryService.getAllServiceCategories();
    sendSuccess(res, { serviceCategories });
};

/** GET /api/v1/categories/service-categories/:slug - Get service category by slug */
export const getServiceCategoryBySlug = async (req: Request, res: Response): Promise<void> => {
    const { slug } = req.params as unknown as SlugParam;
    logger.info(`[CategoryController] Get service category by slug: ${slug}`);
    const serviceCategory = await categoryService.getServiceCategoryBySlug(slug);
    sendSuccess(res, { serviceCategory });
};


import { Request, Response } from 'express';
import { serviceCategoryService } from './service-category.service';
import { sendCreated, sendSuccess, sendNoContent } from '../../utils/response';
import { logger } from '../../utils/logger';
import type {
    CreateServiceCategoryInput,
    UpdateServiceCategoryInput,
    IdParam,
    ListServiceCategoriesQuery,
} from './service-category.schema';

/**
 * POST /api/v1/admin/service-categories
 * Create a new service category
 */
export const create = async (req: Request, res: Response): Promise<void> => {
    const data = req.body as CreateServiceCategoryInput;
    logger.info(`[ServiceCategoryController] Creating category: ${data.name}`);

    const serviceCategory = await serviceCategoryService.create(data);
    sendCreated(res, { serviceCategory }, 'Service category created successfully');
};

/**
 * GET /api/v1/admin/service-categories
 * List all service categories (paginated, searchable, filterable)
 */
export const getAll = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as ListServiceCategoriesQuery;
    logger.info('[ServiceCategoryController] Listing categories', { query });

    const { serviceCategories, meta } = await serviceCategoryService.findAll(query);
    sendSuccess(res, { serviceCategories }, 200, undefined, meta);
};

/**
 * GET /api/v1/admin/service-categories/:id
 * Get a single service category by ID
 */
export const getOne = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as IdParam;
    logger.info(`[ServiceCategoryController] Getting category ID: ${id}`);

    const serviceCategory = await serviceCategoryService.findById(id);
    sendSuccess(res, { serviceCategory });
};

/**
 * PATCH /api/v1/admin/service-categories/:id
 * Update a service category (name, imageUrl)
 */
export const update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as IdParam;
    const data = req.body as UpdateServiceCategoryInput;
    logger.info(`[ServiceCategoryController] Updating category ID: ${id}`, { data });

    const serviceCategory = await serviceCategoryService.update(id, data);
    sendSuccess(res, { serviceCategory }, 200, 'Service category updated successfully');
};

/**
 * DELETE /api/v1/admin/service-categories/:id
 * Delete a service category (guarded: blocks if services exist)
 */
export const remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as IdParam;
    logger.info(`[ServiceCategoryController] Deleting category ID: ${id}`);

    await serviceCategoryService.delete(id);
    sendNoContent(res);
};

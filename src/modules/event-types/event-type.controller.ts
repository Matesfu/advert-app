import { Request, Response } from 'express';
import { eventTypeService } from './event-type.service';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { logger } from '../../utils/logger';
import type {
    CreateEventTypeInput,
    UpdateEventTypeInput,
    IdParam,
    ListEventTypesQuery,
    SyncCategoriesInput,
} from './event-type.schema';

/**
 * POST /api/v1/admin/event-types
 * Create a new event type
 */
export const create = async (req: Request, res: Response): Promise<void> => {
    const data = req.body as CreateEventTypeInput;
    logger.info(`[EventTypeController] Creating event type: ${data.name}`);

    const eventType = await eventTypeService.create(data);
    sendCreated(res, { eventType }, 'Event type created successfully');
};

/**
 * GET /api/v1/admin/event-types
 * List all event types (paginated, searchable, sortable)
 */
export const getAll = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as ListEventTypesQuery;
    logger.info('[EventTypeController] Listing event types');

    const { eventTypes, meta } = await eventTypeService.findAll(query);
    sendSuccess(res, { eventTypes }, 200, undefined, meta);
};

/**
 * GET /api/v1/admin/event-types/:id
 * Get a single event type by ID
 */
export const getOne = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as IdParam;
    logger.info(`[EventTypeController] Getting event type ID: ${id}`);

    const eventType = await eventTypeService.findById(id);
    sendSuccess(res, { eventType });
};

/**
 * PATCH /api/v1/admin/event-types/:id
 * Update event type name and/or sync service categories
 */
export const update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as IdParam;
    const data = req.body as UpdateEventTypeInput;
    logger.info(`[EventTypeController] Updating event type ID: ${id}`);

    const eventType = await eventTypeService.update(id, data);
    sendSuccess(res, { eventType }, 200, 'Event type updated successfully');
};

/**
 * DELETE /api/v1/admin/event-types/:id
 * Delete an event type
 */
export const remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as IdParam;
    logger.info(`[EventTypeController] Deleting event type ID: ${id}`);

    await eventTypeService.delete(id);
    sendNoContent(res);
};

/**
 * PUT /api/v1/admin/event-types/:id/categories
 * Sync linked service categories (full-replace)
 */
export const syncCategories = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as IdParam;
    const { serviceCategoryIds } = req.body as SyncCategoriesInput;
    logger.info(`[EventTypeController] Syncing categories for event type ID: ${id}`);

    const eventType = await eventTypeService.syncCategories(id, serviceCategoryIds);
    sendSuccess(res, { eventType }, 200, 'Service categories synced successfully');
};

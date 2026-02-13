import { Request, Response } from 'express';
import { favoriteService } from './favorite.service';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { logger } from '../../utils/logger';
import type { VendorIdParam } from './favorite.schema';

/** GET /api/v1/favorites - Get user's favorites */
export const getMyFavorites = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    logger.info(`[FavoriteController] Get favorites for user ID: ${userId}`);
    const favorites = await favoriteService.findByUser(userId);
    sendSuccess(res, { favorites });
};

/** POST /api/v1/favorites/:vendorId - Add to favorites */
export const addFavorite = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { vendorId } = req.params as unknown as VendorIdParam;
    logger.info(`[FavoriteController] Add vendor ${vendorId} to favorites for user: ${userId}`);
    const favorite = await favoriteService.add(userId, vendorId);
    sendCreated(res, { favorite }, 'Added to favorites');
};

/** DELETE /api/v1/favorites/:vendorId - Remove from favorites */
export const removeFavorite = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { vendorId } = req.params as unknown as VendorIdParam;
    logger.info(`[FavoriteController] Remove vendor ${vendorId} from favorites for user: ${userId}`);
    await favoriteService.remove(userId, vendorId);
    sendNoContent(res);
};

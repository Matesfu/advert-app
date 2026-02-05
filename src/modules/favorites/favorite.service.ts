import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';

interface Favorite {
    id: number;
    userId: number;
    vendorProfileId: number;
    createdAt: Date;
    vendorProfile?: {
        id: number;
        businessName: string;
        city: string;
        basePrice: number;
    };
}

class FavoriteService {
    async findByUser(userId: number): Promise<Favorite[]> {
        logger.info(`Favorite Service: Fetching favorites for user ID: ${userId}`);
        throw new AppError('List favorites functionality not implemented yet', 501);
    }

    async add(userId: number, vendorId: number): Promise<Favorite> {
        logger.info(`Favorite Service: Adding vendor ${vendorId} to favorites for user: ${userId}`);
        throw new AppError('Add favorite functionality not implemented yet', 501);
    }

    async remove(userId: number, vendorId: number): Promise<void> {
        logger.info(`Favorite Service: Removing vendor ${vendorId} from favorites for user: ${userId}`);
        throw new AppError('Remove favorite functionality not implemented yet', 501);
    }
}

export const favoriteService = new FavoriteService();

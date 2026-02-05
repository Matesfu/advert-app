import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type { UpdateUserInput } from './user.schema';

interface UserProfile {
    id: number;
    email: string;
    phone: string | null;
    role: string;
    isVerified: boolean;
    createdAt: Date;
}

class UserService {
    async findById(id: number): Promise<UserProfile> {
        logger.info(`User Service: Fetching user by ID: ${id}`);
        throw new AppError('Get user functionality not implemented yet', 501);
    }

    async updateMe(userId: number, data: UpdateUserInput): Promise<UserProfile> {
        logger.info(`User Service: Updating user ID: ${userId}`);
        throw new AppError('Update user functionality not implemented yet', 501);
    }

    async deleteMe(userId: number): Promise<void> {
        logger.info(`User Service: Deleting user ID: ${userId}`);
        throw new AppError('Delete user functionality not implemented yet', 501);
    }
}

export const userService = new UserService();

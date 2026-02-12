import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type { UpdateUserInput } from './user.schema';

/**
 * Safe user fields to return (never expose passwordHash).
 */
const USER_SAFE_SELECT = {
    id: true,
    email: true,
    displayName: true,
    avatarUrl: true,
    phone: true,
    role: true,
    authProvider: true,
    isVerified: true,
    createdAt: true,
    updatedAt: true,
};

interface UserProfile {
    id: number;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    phone: string | null;
    role: string;
    authProvider: string;
    isVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
}

class UserService {
    /**
     * Find a user by ID.
     * Excludes soft-deleted users and sensitive fields.
     */
    async findById(id: number): Promise<UserProfile> {
        logger.info(`User Service: Fetching user by ID: ${id}`);

        const user = await prisma.user.findUnique({
            where: { id },
            select: USER_SAFE_SELECT,
        });

        if (!user) {
            throw new AppError('User not found.', 404);
        }

        // Check soft-delete — we need to query deletedAt separately
        const fullUser = await prisma.user.findUnique({
            where: { id },
            select: { deletedAt: true },
        });

        if (fullUser?.deletedAt) {
            throw new AppError('User not found.', 404);
        }

        return user;
    }

    /**
     * Update current user's profile.
     * Only allows updating safe fields: displayName, phone, avatarUrl.
     */
    async updateMe(userId: number, data: UpdateUserInput): Promise<UserProfile> {
        logger.info(`User Service: Updating user ID: ${userId}`);

        // Verify user exists and is not deleted
        const existingUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, deletedAt: true },
        });

        if (!existingUser || existingUser.deletedAt) {
            throw new AppError('User not found.', 404);
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                displayName: data.displayName,
                phone: data.phone,
                avatarUrl: data.avatarUrl,
            },
            select: USER_SAFE_SELECT,
        });

        return updatedUser;
    }

    /**
     * Soft-delete the current user's account.
     * Sets deletedAt timestamp and invalidates all refresh tokens.
     */
    async deleteMe(userId: number): Promise<void> {
        logger.info(`User Service: Soft-deleting user ID: ${userId}`);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, deletedAt: true },
        });

        if (!user || user.deletedAt) {
            throw new AppError('User not found.', 404);
        }

        // Use a transaction to ensure consistency
        await prisma.$transaction([
            // Soft-delete the user
            prisma.user.update({
                where: { id: userId },
                data: { deletedAt: new Date() },
            }),
            // Invalidate all refresh tokens
            prisma.refreshToken.deleteMany({
                where: { userId },
            }),
        ]);

        logger.info(`User Service: User ${userId} soft-deleted. All sessions invalidated.`);
    }
}

export const userService = new UserService();

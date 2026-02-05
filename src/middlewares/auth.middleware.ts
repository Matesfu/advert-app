import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

// Note: Express Request augmentation is defined in src/types/express.d.ts
// Declaration files are automatically included by TypeScript (no import needed)

/**
 * Authentication middleware - Protects routes by verifying JWT token.
 * 
 * Currently a placeholder implementation that checks for Authorization header.
 * TODO: Implement actual JWT verification when auth service is complete.
 * 
 * @example
 * router.get('/profile', protect, controller.getProfile);
 */
export const protect = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    // 1. Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError('You are not logged in. Please log in to access this resource.', 401);
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        throw new AppError('Invalid authentication token.', 401);
    }

    // TODO: Implement actual JWT verification
    // For now, this is a placeholder that logs the attempt
    logger.debug(`Auth middleware: Token received (first 20 chars): ${token.substring(0, 20)}...`);

    /**
     * PLACEHOLDER: In production, this should:
     * 1. Verify the JWT token using jsonwebtoken library
     * 2. Decode the payload to get user ID
     * 3. Fetch user from database using prisma
     * 4. Attach user to request
     * 
     * Example implementation:
     * const decoded = jwt.verify(token, env.JWT_SECRET) as { id: number };
     * const user = await prisma.user.findUnique({ where: { id: decoded.id } });
     * if (!user) throw new AppError('User no longer exists.', 401);
     * req.user = { id: user.id, email: user.email, role: user.role };
     */

    // Temporary mock user for development
    req.user = {
        id: 1,
        email: 'mock@example.com',
        role: 'CUSTOMER' as UserRole,
    };

    logger.info(`Protected route accessed by user: ${req.user.email}`);
    next();
};

/**
 * Authorization middleware - Restricts route access to specific roles.
 * Must be used AFTER the protect middleware.
 * 
 * @param allowedRoles - Array of roles that can access the route
 * @returns Express middleware function
 * 
 * @example
 * // Only vendors can access
 * router.post('/services', protect, restrictTo('VENDOR'), controller.createService);
 * 
 * // Admins and vendors can access
 * router.delete('/:id', protect, restrictTo('ADMIN', 'VENDOR'), controller.delete);
 */
export const restrictTo = (...allowedRoles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            throw new AppError('User not authenticated.', 401);
        }

        if (!allowedRoles.includes(req.user.role)) {
            logger.warn(
                `Access denied: User ${req.user.email} (${req.user.role}) attempted to access restricted route`
            );
            throw new AppError(
                'You do not have permission to perform this action.',
                403
            );
        }

        logger.debug(`Access granted: User ${req.user.email} authorized for ${allowedRoles.join('/')}`);
        next();
    };
};

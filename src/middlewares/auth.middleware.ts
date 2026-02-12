import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { verifyAccessToken, verifyCsrfToken } from '../utils/token';

// Note: Express Request augmentation is defined in src/types/express.d.ts

/**
 * Authentication middleware - Protects routes by verifying the JWT access token
 * from the Authorization header and the CSRF token from the x-csrf-token header.
 *
 * @example
 * router.get('/profile', protect, controller.getProfile);
 */
export const protect = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    // 1. Extract access token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError('You are not logged in. Please log in to access this resource.', 401);
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        throw new AppError('Invalid authentication token.', 401);
    }

    // 2. Verify the JWT access token
    let decoded;
    try {
        decoded = verifyAccessToken(token);
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'TokenExpiredError') {
            throw new AppError('Your session has expired. Please refresh your token.', 401);
        }
        throw new AppError('Invalid authentication token.', 401);
    }

    // 3. Verify CSRF token (for state-changing requests: POST, PUT, PATCH, DELETE)
    const method = req.method.toUpperCase();
    const csrfExemptMethods = ['GET', 'HEAD', 'OPTIONS'];

    if (!csrfExemptMethods.includes(method)) {
        const csrfToken = req.headers['x-csrf-token'] as string;

        if (!csrfToken) {
            throw new AppError('CSRF token is required for this request.', 403);
        }

        if (!verifyCsrfToken(csrfToken)) {
            throw new AppError('Invalid CSRF token.', 403);
        }
    }

    // 4. Attach user data to request
    req.user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role as UserRole,
        authProvider: decoded.authProvider,
    };

    logger.debug(`Protected route accessed by user: ${req.user.email}`);
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

import { UserRole } from '@prisma/client';

/**
 * Augment Express Request interface to include authenticated user data.
 * This allows TypeScript to recognize `req.user` after authentication middleware.
 */
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: number;
                email: string;
                role: UserRole;
            };
        }
    }
}

// This export is needed to make this file a module
export { };

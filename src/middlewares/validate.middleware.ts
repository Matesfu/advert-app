import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../utils/AppError';

/**
 * Validation target - which part of the request to validate.
 */
type ValidationTarget = 'body' | 'params' | 'query';

/**
 * Middleware factory to validate request data using Zod schemas.
 * 
 * @param schema - Zod schema to validate against
 * @param target - Which part of the request to validate (default: 'body')
 * @returns Express middleware function
 * 
 * @example
 * // Validate request body
 * router.post('/register', validateRequest(registerSchema), controller.register);
 * 
 * // Validate route params
 * router.get('/:id', validateRequest(idParamSchema, 'params'), controller.getById);
 */
export const validateRequest = (
    schema: ZodSchema,
    target: ValidationTarget = 'body'
) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            const dataToValidate = req[target];
            const validatedData = schema.parse(dataToValidate);

            // Replace with validated/transformed data
            req[target] = validatedData;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                // Format Zod errors into a user-friendly message
                const errorMessages = error.errors.map((err) => {
                    const path = err.path.join('.');
                    return path ? `${path}: ${err.message}` : err.message;
                });

                throw new AppError(
                    `Validation failed: ${errorMessages.join(', ')}`,
                    400
                );
            }
            throw error;
        }
    };
};

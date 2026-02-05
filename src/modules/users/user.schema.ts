import { z } from 'zod';

/**
 * Schema for updating user profile.
 */
export const updateUserSchema = z.object({
    phone: z
        .string()
        .regex(/^\+?[\d\s-]{10,}$/, 'Invalid phone number format')
        .optional(),
});

/**
 * Schema for user ID param.
 */
export const userIdParamSchema = z.object({
    id: z
        .string()
        .regex(/^\d+$/, 'ID must be a valid number')
        .transform((val) => parseInt(val, 10)),
});

// Type exports
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;

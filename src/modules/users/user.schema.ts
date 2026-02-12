import { z } from 'zod';

/**
 * Schema for updating user profile.
 */
export const updateUserSchema = z.object({
    displayName: z
        .string()
        .min(1, 'Display name cannot be empty')
        .max(100, 'Display name is too long')
        .optional(),
    phone: z
        .string()
        .regex(/^\+?[\d\s-]{10,}$/, 'Invalid phone number format')
        .optional(),
    avatarUrl: z
        .string()
        .url('Avatar URL must be a valid URL')
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

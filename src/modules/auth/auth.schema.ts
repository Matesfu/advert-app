import { z } from 'zod';
import { UserRole } from '@prisma/client';

/**
 * Schema for user registration.
 */
export const registerSchema = z.object({
    email: z
        .string({ required_error: 'Email is required' })
        .email('Invalid email format'),
    password: z
        .string({ required_error: 'Password is required' })
        .min(8, 'Password must be at least 8 characters')
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Password must contain at least one uppercase letter, one lowercase letter, and one number'
        ),
    phone: z
        .string()
        .regex(/^\+?[\d\s-]{10,}$/, 'Invalid phone number format')
        .optional(),
    role: z
        .nativeEnum(UserRole)
        .optional()
        .default('CUSTOMER'),
});

/**
 * Schema for user login.
 */
export const loginSchema = z.object({
    email: z
        .string({ required_error: 'Email is required' })
        .email('Invalid email format'),
    password: z
        .string({ required_error: 'Password is required' })
        .min(1, 'Password is required'),
});

/**
 * Schema for password change.
 */
export const changePasswordSchema = z.object({
    currentPassword: z
        .string({ required_error: 'Current password is required' })
        .min(1, 'Current password is required'),
    newPassword: z
        .string({ required_error: 'New password is required' })
        .min(8, 'Password must be at least 8 characters')
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Password must contain at least one uppercase letter, one lowercase letter, and one number'
        ),
});

// Type exports for use in services and controllers
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

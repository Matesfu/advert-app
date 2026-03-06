import { z } from 'zod';

export const vendorIdParamSchema = z.object({
    vendorId: z
        .string()
        .regex(/^\d+$/, 'Vendor ID must be a valid number')
        .transform((val) => parseInt(val, 10)),
});

export const reviewIdParamSchema = z.object({
    reviewId: z
        .string()
        .regex(/^\d+$/, 'Review ID must be a valid number')
        .transform((val) => parseInt(val, 10)),
});

export const vendorAndReviewParamSchema = z.object({
    vendorId: z
        .string()
        .regex(/^\d+$/, 'Vendor ID must be a valid number')
        .transform((val) => parseInt(val, 10)),
    reviewId: z
        .string()
        .regex(/^\d+$/, 'Review ID must be a valid number')
        .transform((val) => parseInt(val, 10)),
});

export const createReviewSchema = z.object({
    rating: z
        .number({ required_error: 'Rating is required' })
        .int()
        .min(1, 'Rating must be at least 1')
        .max(5, 'Rating must be at most 5'),
    comment: z
        .string()
        .max(1000, 'Comment must be less than 1000 characters')
        .optional(),
});

export const updateReviewSchema = z
    .object({
        rating: z
            .number()
            .int()
            .min(1, 'Rating must be at least 1')
            .max(5, 'Rating must be at most 5')
            .optional(),
        comment: z
            .string()
            .max(1000, 'Comment must be less than 1000 characters')
            .optional(),
    })
    .refine((data) => data.rating !== undefined || data.comment !== undefined, {
        message: 'At least one of rating or comment must be provided',
    });

export const listReviewsQuerySchema = z.object({
    page: z.string().regex(/^\d+$/).transform((val) => parseInt(val, 10)).optional().default('1'),
    limit: z.string().regex(/^\d+$/).transform((val) => Math.min(parseInt(val, 10), 50)).optional().default('10'),
    sortBy: z.enum(['newest', 'oldest', 'highest', 'lowest']).optional().default('newest'),
});

export type VendorIdParam = z.infer<typeof vendorIdParamSchema>;
export type ReviewIdParam = z.infer<typeof reviewIdParamSchema>;
export type VendorAndReviewParam = z.infer<typeof vendorAndReviewParamSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;

import { z } from 'zod';

export const vendorIdParamSchema = z.object({
    vendorId: z
        .string()
        .regex(/^\d+$/, 'Vendor ID must be a valid number')
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

export const listReviewsQuerySchema = z.object({
    page: z.string().regex(/^\d+$/).transform((val) => parseInt(val, 10)).optional().default('1'),
    limit: z.string().regex(/^\d+$/).transform((val) => Math.min(parseInt(val, 10), 50)).optional().default('10'),
});

export type VendorIdParam = z.infer<typeof vendorIdParamSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;

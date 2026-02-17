import { z } from 'zod';

// ============================================
// CREATE
// ============================================

export const createServiceCategorySchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, 'Name must be at least 2 characters')
        .max(50, 'Name must be at most 50 characters'),
    imageUrl: z
        .string()
        .trim()
        .url('imageUrl must be a valid URL')
        .optional(),
});

export type CreateServiceCategoryInput = z.infer<typeof createServiceCategorySchema>;

// ============================================
// UPDATE (name and/or imageUrl)
// ============================================

export const updateServiceCategorySchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2, 'Name must be at least 2 characters')
            .max(50, 'Name must be at most 50 characters')
            .optional(),
        imageUrl: z
            .string()
            .trim()
            .url('imageUrl must be a valid URL')
            .nullable()    // null → clear the image
            .optional(),
    })
    .refine((data) => data.name !== undefined || data.imageUrl !== undefined, {
        message: 'At least one of "name" or "imageUrl" must be provided',
    });

export type UpdateServiceCategoryInput = z.infer<typeof updateServiceCategorySchema>;

// ============================================
// ID PARAM
// ============================================

export const idParamSchema = z.object({
    id: z.coerce.number().int().positive('ID must be a positive integer'),
});

export type IdParam = z.infer<typeof idParamSchema>;

// ============================================
// LIST QUERY (pagination, search, sorting)
// ============================================

export const listServiceCategoriesQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
    search: z.string().trim().optional(),
    eventTypeId: z.coerce.number().int().positive('eventTypeId must be a positive integer').optional(),
    sortBy: z.enum(['name', 'id', 'slug']).default('name'),
    order: z.enum(['asc', 'desc']).default('asc'),
});

export type ListServiceCategoriesQuery = z.infer<typeof listServiceCategoriesQuerySchema>;

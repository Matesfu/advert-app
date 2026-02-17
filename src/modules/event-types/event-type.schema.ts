import { z } from 'zod';

// ============================================
// CREATE
// ============================================

export const createEventTypeSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, 'Name must be at least 2 characters')
        .max(50, 'Name must be at most 50 characters'),
});

export type CreateEventTypeInput = z.infer<typeof createEventTypeSchema>;

// ============================================
// UPDATE (supports name + optional category sync)
// ============================================

export const updateEventTypeSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2, 'Name must be at least 2 characters')
            .max(50, 'Name must be at most 50 characters')
            .optional(),
        serviceCategoryIds: z
            .array(z.number().int().positive('Each category ID must be a positive integer'))
            .optional(),
    })
    .refine((data) => data.name !== undefined || data.serviceCategoryIds !== undefined, {
        message: 'At least one of "name" or "serviceCategoryIds" must be provided',
    });

export type UpdateEventTypeInput = z.infer<typeof updateEventTypeSchema>;

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

export const listEventTypesQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
    search: z.string().trim().optional(),
    sortBy: z.enum(['name', 'id', 'slug']).default('name'),
    order: z.enum(['asc', 'desc']).default('asc'),
});

export type ListEventTypesQuery = z.infer<typeof listEventTypesQuerySchema>;

// ============================================
// SYNC CATEGORIES (dedicated PUT endpoint)
// ============================================

export const syncCategoriesSchema = z.object({
    serviceCategoryIds: z
        .array(z.number().int().positive('Each category ID must be a positive integer'))
        .min(0, 'serviceCategoryIds must be an array'),
});

export type SyncCategoriesInput = z.infer<typeof syncCategoriesSchema>;

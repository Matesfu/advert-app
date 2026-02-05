import { z } from 'zod';

/**
 * Schema for route ID parameters.
 */
export const idParamSchema = z.object({
    id: z
        .string()
        .regex(/^\d+$/, 'ID must be a valid number')
        .transform((val) => parseInt(val, 10)),
});

/**
 * Schema for nested service ID in vendor routes.
 */
export const serviceIdParamSchema = z.object({
    id: z
        .string()
        .regex(/^\d+$/, 'Vendor ID must be a valid number')
        .transform((val) => parseInt(val, 10)),
    serviceId: z
        .string()
        .regex(/^\d+$/, 'Service ID must be a valid number')
        .transform((val) => parseInt(val, 10)),
});

/**
 * Schema for creating a vendor profile.
 */
export const createVendorSchema = z.object({
    businessName: z
        .string({ required_error: 'Business name is required' })
        .min(2, 'Business name must be at least 2 characters')
        .max(100, 'Business name must be less than 100 characters'),
    bio: z
        .string()
        .max(2000, 'Bio must be less than 2000 characters')
        .optional(),
    basePrice: z
        .number({ required_error: 'Base price is required' })
        .positive('Base price must be a positive number'),
    city: z
        .string({ required_error: 'City is required' })
        .min(2, 'City must be at least 2 characters'),
    portfolioImages: z
        .array(z.string().url('Each portfolio image must be a valid URL'))
        .optional()
        .default([]),
    locationCoordinates: z
        .object({
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
        })
        .optional(),
});

/**
 * Schema for updating a vendor profile (all fields optional).
 */
export const updateVendorSchema = createVendorSchema.partial();

/**
 * Schema for creating a service under a vendor profile.
 */
export const createServiceSchema = z.object({
    name: z
        .string({ required_error: 'Service name is required' })
        .min(2, 'Service name must be at least 2 characters')
        .max(100, 'Service name must be less than 100 characters'),
    description: z
        .string()
        .max(1000, 'Description must be less than 1000 characters')
        .optional(),
    price: z
        .number({ required_error: 'Price is required' })
        .positive('Price must be a positive number'),
    serviceCategoryId: z
        .number({ required_error: 'Service category is required' })
        .int()
        .positive(),
});

/**
 * Schema for vendor listing query parameters.
 */
export const listVendorsQuerySchema = z.object({
    page: z
        .string()
        .regex(/^\d+$/)
        .transform((val) => parseInt(val, 10))
        .optional()
        .default('1'),
    limit: z
        .string()
        .regex(/^\d+$/)
        .transform((val) => Math.min(parseInt(val, 10), 50))
        .optional()
        .default('10'),
    city: z.string().optional(),
    minPrice: z
        .string()
        .regex(/^\d+(\.\d+)?$/)
        .transform((val) => parseFloat(val))
        .optional(),
    maxPrice: z
        .string()
        .regex(/^\d+(\.\d+)?$/)
        .transform((val) => parseFloat(val))
        .optional(),
});

// Type exports
export type IdParam = z.infer<typeof idParamSchema>;
export type ServiceIdParam = z.infer<typeof serviceIdParamSchema>;
export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type ListVendorsQuery = z.infer<typeof listVendorsQuerySchema>;

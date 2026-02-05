import { z } from 'zod';

export const vendorIdParamSchema = z.object({
    vendorId: z
        .string()
        .regex(/^\d+$/, 'Vendor ID must be a valid number')
        .transform((val) => parseInt(val, 10)),
});

export type VendorIdParam = z.infer<typeof vendorIdParamSchema>;

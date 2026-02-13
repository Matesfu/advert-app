import { z } from 'zod';

export const conversationIdParamSchema = z.object({
    id: z
        .string()
        .regex(/^\d+$/, 'Conversation ID must be a valid number')
        .transform((val) => parseInt(val, 10)),
});

export const startConversationSchema = z.object({
    vendorProfileId: z
        .number({ required_error: 'Vendor profile ID is required' })
        .int()
        .positive(),
    message: z
        .string({ required_error: 'Initial message is required' })
        .min(1, 'Message cannot be empty')
        .max(2000, 'Message must be less than 2000 characters'),
});

export const sendMessageSchema = z.object({
    content: z
        .string({ required_error: 'Message content is required' })
        .min(1, 'Message cannot be empty')
        .max(2000, 'Message must be less than 2000 characters'),
});

export type ConversationIdParam = z.infer<typeof conversationIdParamSchema>;
export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

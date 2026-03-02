import { Request, Response } from 'express';
import { messageService } from './message.service';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { logger } from '../../utils/logger';
import type { ConversationIdParam, StartConversationInput, SendMessageInput } from './message.schema';

/** GET /api/v1/messages/conversations - List user's conversations */
export const getConversations = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    logger.info(`[MessageController] Get conversations for user ID: ${userId}`);
    const conversations = await messageService.getConversations(userId);
    sendSuccess(res, { conversations });
};

/** GET /api/v1/messages/conversations/:id - Get conversation with messages */
export const getConversation = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { id } = req.params as unknown as ConversationIdParam;
    logger.info(`[MessageController] Get conversation ID: ${id} for user: ${userId}`);
    const conversation = await messageService.getConversation(userId, id);
    sendSuccess(res, { conversation });
};

/** POST /api/v1/messages/conversations - Start new conversation */
export const startConversation = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const data = req.body as StartConversationInput;
    logger.info(`[MessageController] Start conversation with vendor ${data.vendorProfileId}`);
    const conversation = await messageService.startConversation(userId, data);
    sendCreated(res, { conversation }, 'Conversation started');
};

/** POST /api/v1/messages/conversations/:id/messages - Send message */
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { id } = req.params as unknown as ConversationIdParam;
    const data = req.body as SendMessageInput;
    logger.info(`[MessageController] Send message to conversation ID: ${id}`);
    const message = await messageService.sendMessage(userId, id, data);
    sendCreated(res, { message }, 'Message sent');
};

/** PATCH /api/v1/messages/conversations/:id/read - Mark as read */
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { id } = req.params as unknown as ConversationIdParam;
    logger.info(`[MessageController] Mark conversation ${id} as read`);
    await messageService.markAsRead(userId, id);
    sendNoContent(res);
};

/** GET /api/v1/messages/unread-count - Get total unread count */
export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    logger.info(`[MessageController] Get unread count for user ID: ${userId}`);
    const count = await messageService.getUnreadCount(userId);
    sendSuccess(res, { unreadCount: count });
};

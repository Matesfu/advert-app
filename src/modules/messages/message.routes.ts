import { Router } from 'express';
import * as messageController from './message.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import { protect } from '../../middlewares/auth.middleware';
import { conversationIdParamSchema, startConversationSchema, sendMessageSchema } from './message.schema';

const router = Router();

// All routes require authentication
router.use(protect);

/** GET /api/v1/messages/conversations - List conversations */
router.get('/conversations', messageController.getConversations);

/** GET /api/v1/messages/unread-count - Get total unread message count */
router.get('/unread-count', messageController.getUnreadCount);

/** POST /api/v1/messages/conversations - Start conversation */
router.post(
    '/conversations',
    validateRequest(startConversationSchema),
    messageController.startConversation
);

/** GET /api/v1/messages/conversations/:id - Get conversation */
router.get(
    '/conversations/:id',
    validateRequest(conversationIdParamSchema, 'params'),
    messageController.getConversation
);

/** POST /api/v1/messages/conversations/:id/messages - Send message */
router.post(
    '/conversations/:id/messages',
    validateRequest(conversationIdParamSchema, 'params'),
    validateRequest(sendMessageSchema),
    messageController.sendMessage
);

/** PATCH /api/v1/messages/conversations/:id/read - Mark as read */
router.patch(
    '/conversations/:id/read',
    validateRequest(conversationIdParamSchema, 'params'),
    messageController.markAsRead
);

export default router;

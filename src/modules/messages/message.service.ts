import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type { StartConversationInput, SendMessageInput } from './message.schema';

interface Message {
    id: number;
    content: string;
    isRead: boolean;
    senderId: number;
    conversationId: number;
    createdAt: Date;
}

interface Conversation {
    id: number;
    userId: number;
    vendorProfileId: number;
    createdAt: Date;
    updatedAt: Date;
    messages?: Message[];
    lastMessage?: Message;
}

class MessageService {
    async getConversations(userId: number): Promise<Conversation[]> {
        logger.info(`Message Service: Fetching conversations for user ID: ${userId}`);
        throw new AppError('List conversations functionality not implemented yet', 501);
    }

    async getConversation(userId: number, conversationId: number): Promise<Conversation> {
        logger.info(`Message Service: Fetching conversation ID: ${conversationId} for user: ${userId}`);
        throw new AppError('Get conversation functionality not implemented yet', 501);
    }

    async startConversation(userId: number, data: StartConversationInput): Promise<Conversation> {
        logger.info(`Message Service: Starting conversation with vendor ${data.vendorProfileId}`);
        throw new AppError('Start conversation functionality not implemented yet', 501);
    }

    async sendMessage(userId: number, conversationId: number, data: SendMessageInput): Promise<Message> {
        logger.info(`Message Service: Sending message to conversation ID: ${conversationId}`);
        throw new AppError('Send message functionality not implemented yet', 501);
    }

    async markAsRead(userId: number, conversationId: number): Promise<void> {
        logger.info(`Message Service: Marking conversation ${conversationId} as read`);
        throw new AppError('Mark as read functionality not implemented yet', 501);
    }
}

export const messageService = new MessageService();

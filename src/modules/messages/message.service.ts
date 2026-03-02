import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { sendNewMessageEmail } from '../../utils/mailer';
import { Prisma } from '@prisma/client';
import type { StartConversationInput, SendMessageInput } from './message.schema';

/**
 * Message Service — Business logic for the messaging / inbox system.
 *
 * Key design decisions:
 * - **Dual-perspective queries**: Conversations are fetched where the user is
 *   either the customer (`userId`) or the vendor owner (`vendorProfile.userId`).
 * - **Soft-delete awareness**: Sending is blocked when either participant is
 *   deleted, but reading history is always allowed.
 * - **Email notifications**: Fire-and-forget, controlled by ENV feature flag,
 *   with first-unread-only rate limiting.
 * - **Unread counts**: Derived from `isRead = false` on messages not sent by
 *   the requesting user.
 */
class MessageService {
    /**
     * Build a WHERE clause that matches conversations where the user
     * is either the customer or the vendor profile owner.
     */
    private participantFilter(userId: number): Prisma.ConversationWhereInput {
        return {
            OR: [
                { userId },                         // User is the customer
                { vendorProfile: { userId } },       // User owns the vendor profile
            ],
        };
    }

    /**
     * List all conversations for a user, sorted by most recent activity.
     *
     * Includes: last message preview, unread count, participant details.
     * Handles soft-deleted participants with placeholder names.
     */
    async getConversations(userId: number) {
        logger.info(`[MessageService] Fetching conversations for user ID: ${userId}`);

        const conversations = await prisma.conversation.findMany({
            where: this.participantFilter(userId),
            include: {
                user: {
                    select: {
                        id: true,
                        displayName: true,
                        avatarUrl: true,
                        deletedAt: true,
                    },
                },
                vendorProfile: {
                    select: {
                        id: true,
                        businessName: true,
                        userId: true,
                        deletedAt: true,
                        owner: {
                            select: {
                                id: true,
                                displayName: true,
                                avatarUrl: true,
                                deletedAt: true,
                            },
                        },
                    },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        content: true,
                        senderId: true,
                        isRead: true,
                        createdAt: true,
                    },
                },
                _count: {
                    select: {
                        messages: {
                            where: {
                                senderId: { not: userId },
                                isRead: false,
                            },
                        },
                    },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        // Transform: apply soft-delete placeholders and flatten structure
        return conversations.map((conv) => {
            const lastMessage = conv.messages[0] || null;
            const unreadCount = conv._count.messages;

            // Soft-delete display names
            const customerName = conv.user.deletedAt
                ? 'Deleted User'
                : (conv.user.displayName || 'Unknown User');
            const customerAvatar = conv.user.deletedAt ? null : conv.user.avatarUrl;

            const vendorName = conv.vendorProfile.deletedAt
                ? 'Deleted Business'
                : conv.vendorProfile.businessName;

            return {
                id: conv.id,
                createdAt: conv.createdAt,
                updatedAt: conv.updatedAt,
                customer: {
                    id: conv.user.id,
                    displayName: customerName,
                    avatarUrl: customerAvatar,
                },
                vendorProfile: {
                    id: conv.vendorProfile.id,
                    businessName: vendorName,
                },
                lastMessage,
                unreadCount,
            };
        });
    }

    /**
     * Get a single conversation with its messages (paginated).
     *
     * Messages are sorted chronologically (oldest first).
     * Automatically marks unread messages as read for the requesting user.
     */
    async getConversation(userId: number, conversationId: number, page = 1, limit = 50) {
        logger.info(`[MessageService] Fetching conversation ID: ${conversationId} for user: ${userId}`);

        // 1. Verify conversation exists and user is a participant
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                ...this.participantFilter(userId),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        displayName: true,
                        avatarUrl: true,
                        deletedAt: true,
                    },
                },
                vendorProfile: {
                    select: {
                        id: true,
                        businessName: true,
                        userId: true,
                        deletedAt: true,
                        owner: {
                            select: {
                                id: true,
                                displayName: true,
                                avatarUrl: true,
                                deletedAt: true,
                            },
                        },
                    },
                },
            },
        });

        if (!conversation) {
            throw new AppError('Conversation not found or access denied', 404);
        }

        // 2. Fetch paginated messages
        const skip = (page - 1) * limit;
        const [messages, totalMessages] = await Promise.all([
            prisma.message.findMany({
                where: { conversationId },
                orderBy: { createdAt: 'asc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    content: true,
                    isRead: true,
                    senderId: true,
                    createdAt: true,
                    sender: {
                        select: {
                            id: true,
                            displayName: true,
                            avatarUrl: true,
                            deletedAt: true,
                        },
                    },
                },
            }),
            prisma.message.count({ where: { conversationId } }),
        ]);

        // 3. Auto-mark unread messages as read (for messages NOT sent by this user)
        await prisma.message.updateMany({
            where: {
                conversationId,
                senderId: { not: userId },
                isRead: false,
            },
            data: { isRead: true },
        });

        // 4. Apply soft-delete placeholders to message senders
        const transformedMessages = messages.map((msg) => ({
            ...msg,
            sender: {
                id: msg.sender.id,
                displayName: msg.sender.deletedAt
                    ? 'Deleted User'
                    : (msg.sender.displayName || 'Unknown User'),
                avatarUrl: msg.sender.deletedAt ? null : msg.sender.avatarUrl,
            },
        }));

        // Participant display names
        const customerName = conversation.user.deletedAt
            ? 'Deleted User'
            : (conversation.user.displayName || 'Unknown User');
        const vendorName = conversation.vendorProfile.deletedAt
            ? 'Deleted Business'
            : conversation.vendorProfile.businessName;

        return {
            id: conversation.id,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            customer: {
                id: conversation.user.id,
                displayName: customerName,
                avatarUrl: conversation.user.deletedAt ? null : conversation.user.avatarUrl,
            },
            vendorProfile: {
                id: conversation.vendorProfile.id,
                businessName: vendorName,
            },
            messages: transformedMessages,
            pagination: {
                page,
                limit,
                total: totalMessages,
                totalPages: Math.ceil(totalMessages / limit),
            },
        };
    }

    /**
     * Start a new conversation (or return existing) and send the first message.
     *
     * Idempotent: if a conversation already exists, the initial message is
     * added to it instead of creating a duplicate.
     */
    async startConversation(userId: number, data: StartConversationInput) {
        logger.info(`[MessageService] Starting conversation — user: ${userId}, vendor: ${data.vendorProfileId}`);

        // 1. Validate vendor profile exists and is active
        const vendorProfile = await prisma.vendorProfile.findFirst({
            where: {
                id: data.vendorProfileId,
                deletedAt: null,
            },
            select: {
                id: true,
                userId: true,
                businessName: true,
                owner: {
                    select: {
                        id: true,
                        email: true,
                        displayName: true,
                        deletedAt: true,
                    },
                },
            },
        });

        if (!vendorProfile) {
            throw new AppError('Vendor profile not found', 404);
        }

        // 2. Self-messaging guard
        if (vendorProfile.userId === userId) {
            throw new AppError('You cannot start a conversation with your own vendor profile', 403);
        }

        // 3. Find or create conversation (idempotent via unique constraint)
        let conversation = await prisma.conversation.findUnique({
            where: {
                userId_vendorProfileId: {
                    userId,
                    vendorProfileId: data.vendorProfileId,
                },
            },
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    userId,
                    vendorProfileId: data.vendorProfileId,
                },
            });
        }

        // 4. Create the first message and bump updatedAt atomically
        const [message] = await prisma.$transaction([
            prisma.message.create({
                data: {
                    content: data.message,
                    conversationId: conversation.id,
                    senderId: userId,
                },
                include: {
                    sender: {
                        select: {
                            id: true,
                            displayName: true,
                            avatarUrl: true,
                        },
                    },
                },
            }),
            prisma.conversation.update({
                where: { id: conversation.id },
                data: { updatedAt: new Date() },
            }),
        ]);

        // 5. Trigger email notification (fire-and-forget)
        const senderUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { displayName: true },
        });
        const senderName = senderUser?.displayName || 'Someone';

        // Determine recipient: the vendor owner
        const recipientEmail = vendorProfile.owner.email;
        if (recipientEmail && !vendorProfile.owner.deletedAt) {
            // Check first-unread rate limiting
            const existingUnread = await prisma.message.count({
                where: {
                    conversationId: conversation.id,
                    senderId: userId,
                    isRead: false,
                    id: { not: message.id }, // Exclude the just-created message
                },
            });

            if (existingUnread === 0) {
                // Fire-and-forget — do not await
                sendNewMessageEmail(
                    recipientEmail,
                    senderName,
                    data.message,
                    conversation.id
                ).catch(() => { }); // Swallow any errors
            }
        }

        // 6. Return the full conversation
        return {
            id: conversation.id,
            userId: conversation.userId,
            vendorProfileId: conversation.vendorProfileId,
            createdAt: conversation.createdAt,
            message,
        };
    }

    /**
     * Send a message in an existing conversation.
     *
     * Guards:
     *  1. Conversation must exist and user must be a participant.
     *  2. Neither participant may be soft-deleted.
     */
    async sendMessage(userId: number, conversationId: number, data: SendMessageInput) {
        logger.info(`[MessageService] Sending message — user: ${userId}, conversation: ${conversationId}`);

        // 1. Fetch conversation with participant info
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                ...this.participantFilter(userId),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        displayName: true,
                        deletedAt: true,
                    },
                },
                vendorProfile: {
                    select: {
                        id: true,
                        userId: true,
                        businessName: true,
                        deletedAt: true,
                        owner: {
                            select: {
                                id: true,
                                email: true,
                                displayName: true,
                                deletedAt: true,
                            },
                        },
                    },
                },
            },
        });

        if (!conversation) {
            throw new AppError('Conversation not found or access denied', 404);
        }

        // 2. Soft-delete guard — block sending if either party is deleted
        if (conversation.user.deletedAt) {
            throw new AppError('Cannot send messages — the customer account has been deleted', 403);
        }
        if (conversation.vendorProfile.deletedAt) {
            throw new AppError('Cannot send messages — the vendor profile has been deleted', 403);
        }

        // 3. Create message + bump updatedAt atomically
        const [message] = await prisma.$transaction([
            prisma.message.create({
                data: {
                    content: data.content,
                    conversationId,
                    senderId: userId,
                },
                include: {
                    sender: {
                        select: {
                            id: true,
                            displayName: true,
                            avatarUrl: true,
                        },
                    },
                },
            }),
            prisma.conversation.update({
                where: { id: conversationId },
                data: { updatedAt: new Date() },
            }),
        ]);

        // 4. Determine recipient and send email notification
        const isCustomer = conversation.userId === userId;
        const recipientEmail = isCustomer
            ? conversation.vendorProfile.owner.email
            : conversation.user.email;
        const recipientDeleted = isCustomer
            ? conversation.vendorProfile.owner.deletedAt
            : conversation.user.deletedAt;
        const senderName = isCustomer
            ? (conversation.user.displayName || 'A customer')
            : (conversation.vendorProfile.businessName || 'A vendor');

        if (recipientEmail && !recipientDeleted) {
            // First-unread rate limiting
            const existingUnread = await prisma.message.count({
                where: {
                    conversationId,
                    senderId: userId,
                    isRead: false,
                    id: { not: message.id },
                },
            });

            if (existingUnread === 0) {
                sendNewMessageEmail(
                    recipientEmail,
                    senderName,
                    data.content,
                    conversationId
                ).catch(() => { });
            }
        }

        return message;
    }

    /**
     * Mark all unread messages in a conversation as read
     * (only messages NOT sent by the requesting user).
     */
    async markAsRead(userId: number, conversationId: number) {
        logger.info(`[MessageService] Marking conversation ${conversationId} as read for user: ${userId}`);

        // Verify user is a participant
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                ...this.participantFilter(userId),
            },
        });

        if (!conversation) {
            throw new AppError('Conversation not found or access denied', 404);
        }

        await prisma.message.updateMany({
            where: {
                conversationId,
                senderId: { not: userId },
                isRead: false,
            },
            data: { isRead: true },
        });
    }

    /**
     * Get total unread message count across all conversations for a user.
     * Used for inbox badge / notification indicator.
     */
    async getUnreadCount(userId: number) {
        logger.info(`[MessageService] Getting unread count for user: ${userId}`);

        const count = await prisma.message.count({
            where: {
                conversation: this.participantFilter(userId),
                senderId: { not: userId },
                isRead: false,
            },
        });

        return count;
    }
}

export const messageService = new MessageService();

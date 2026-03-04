import { Server } from 'socket.io';
import { logger } from '../utils/logger';

/**
 * Socket Emitter — Singleton that holds the Socket.io server instance
 * and provides typed helper methods for emitting events from the service layer.
 *
 * Usage:
 *   1. Call `socketEmitter.initialize(io)` once in server.ts after creating the io instance.
 *   2. Call emit helpers from MessageService after successful DB writes.
 *
 * If Socket.io is not initialized (e.g., during tests), all emit calls are no-ops.
 */
class SocketEmitter {
    private io: Server | null = null;

    /** Bind the Socket.io server instance. Called once at startup. */
    initialize(io: Server): void {
        this.io = io;
        logger.info('[SocketEmitter] Initialized');
    }

    /** Get the raw io instance (for tests or advanced use). */
    getIO(): Server | null {
        return this.io;
    }

    // ─── Emit Helpers ─────────────────────────────────────────

    /**
     * Emit a new message to everyone in the conversation room.
     * Called after MessageService.sendMessage() succeeds.
     */
    emitNewMessage(conversationId: number, message: Record<string, unknown>): void {
        if (!this.io) return;
        this.io.to(`conversation_${conversationId}`).emit('new_message', {
            conversationId,
            message,
        });
        logger.debug(`[SocketEmitter] new_message → conversation_${conversationId}`);
    }

    /**
     * Emit a conversation update to specific user rooms (inbox refresh).
     * Called after a new message is sent or a conversation is started.
     */
    emitConversationUpdated(
        userIds: number[],
        conversationId: number,
        lastMessage: Record<string, unknown>,
        updatedAt: Date
    ): void {
        if (!this.io) return;
        const payload = { conversationId, lastMessage, updatedAt };
        for (const uid of userIds) {
            this.io.to(`user_${uid}`).emit('conversation_updated', payload);
        }
        logger.debug(`[SocketEmitter] conversation_updated → users: [${userIds.join(', ')}]`);
    }

    /**
     * Emit a read receipt to the conversation room.
     * Called after MessageService.markAsRead() succeeds.
     */
    emitMessagesRead(conversationId: number, readByUserId: number): void {
        if (!this.io) return;
        this.io.to(`conversation_${conversationId}`).emit('messages_read', {
            conversationId,
            readBy: readByUserId,
        });
        logger.debug(`[SocketEmitter] messages_read → conversation_${conversationId}, by user ${readByUserId}`);
    }
}

export const socketEmitter = new SocketEmitter();

import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/token';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────

interface AuthenticatedSocket extends Socket {
    data: {
        user: {
            userId: number;
            email: string;
            role: string;
        };
    };
}

// ─── Socket Authentication Middleware ─────────────────────

/**
 * Authenticate socket connections using the existing JWT access token.
 * Client must connect with: io(url, { auth: { token: "Bearer <jwt>" } })
 */
const socketAuthMiddleware = (socket: Socket, next: (err?: Error) => void): void => {
    try {
        const authToken = socket.handshake.auth?.token as string | undefined;

        if (!authToken) {
            logger.warn('[Socket] Connection rejected — no token provided');
            return next(new Error('Authentication error: No token provided'));
        }

        // Support both "Bearer <token>" and raw token
        const token = authToken.startsWith('Bearer ') ? authToken.split(' ')[1] : authToken;

        if (!token) {
            return next(new Error('Authentication error: Invalid token format'));
        }

        const decoded = verifyAccessToken(token);

        // Attach user data to socket
        socket.data.user = {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.role,
        };

        logger.info(`[Socket] Authenticated: user ${decoded.userId} (${decoded.email})`);
        next();
    } catch (err) {
        logger.warn(`[Socket] Connection rejected — invalid token`);
        next(new Error('Authentication error: Invalid or expired token'));
    }
};

// ─── Room Join Validation ─────────────────────────────────

/**
 * Verify that the user is a participant in the conversation before
 * allowing them to join the room.
 */
const validateConversationAccess = async (
    userId: number,
    conversationId: number
): Promise<boolean> => {
    const conversation = await prisma.conversation.findFirst({
        where: {
            id: conversationId,
            OR: [
                { userId },
                { vendorProfile: { userId } },
            ],
        },
    });
    return !!conversation;
};

// ─── Connection Handler ───────────────────────────────────

const handleConnection = (socket: AuthenticatedSocket): void => {
    const { userId, email } = socket.data.user;

    // Auto-join the user's personal room (for inbox updates)
    socket.join(`user_${userId}`);
    logger.info(`[Socket] User ${userId} (${email}) connected — joined room user_${userId}`);

    // ── join_conversation ──────────────────────────────────
    socket.on('join_conversation', async (data: { conversationId: number }) => {
        try {
            const { conversationId } = data;

            if (!conversationId || typeof conversationId !== 'number') {
                socket.emit('error', { message: 'Invalid conversationId' });
                return;
            }

            const hasAccess = await validateConversationAccess(userId, conversationId);
            if (!hasAccess) {
                socket.emit('error', { message: 'Access denied to this conversation' });
                return;
            }

            socket.join(`conversation_${conversationId}`);
            logger.info(`[Socket] User ${userId} joined conversation_${conversationId}`);
            socket.emit('joined_conversation', { conversationId });
        } catch (err) {
            logger.error(`[Socket] Error joining conversation: ${err}`);
            socket.emit('error', { message: 'Failed to join conversation' });
        }
    });

    // ── leave_conversation ─────────────────────────────────
    socket.on('leave_conversation', (data: { conversationId: number }) => {
        const { conversationId } = data;
        if (!conversationId) return;

        socket.leave(`conversation_${conversationId}`);
        logger.info(`[Socket] User ${userId} left conversation_${conversationId}`);
    });

    // ── typing_start ───────────────────────────────────────
    socket.on('typing_start', (data: { conversationId: number }) => {
        const { conversationId } = data;
        if (!conversationId) return;

        socket.to(`conversation_${conversationId}`).emit('user_typing', {
            conversationId,
            userId,
        });
    });

    // ── typing_stop ────────────────────────────────────────
    socket.on('typing_stop', (data: { conversationId: number }) => {
        const { conversationId } = data;
        if (!conversationId) return;

        socket.to(`conversation_${conversationId}`).emit('user_stop_typing', {
            conversationId,
            userId,
        });
    });

    // ── disconnect ─────────────────────────────────────────
    socket.on('disconnect', (reason: string) => {
        logger.info(`[Socket] User ${userId} disconnected — reason: ${reason}`);
    });
};

// ─── Public Initializer ──────────────────────────────────

/**
 * Initialize Socket.io with authentication middleware and event handlers.
 * Called once from server.ts after creating the io instance.
 */
export const initializeSocket = (io: Server): void => {
    // Apply JWT auth middleware
    io.use(socketAuthMiddleware);

    // Handle new connections
    io.on('connection', (socket: Socket) => {
        handleConnection(socket as AuthenticatedSocket);
    });

    logger.info('[Socket] Socket.io initialized and listening for connections');
};

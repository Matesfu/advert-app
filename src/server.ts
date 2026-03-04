import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './config/prisma';
import { initializeSocket } from './socket';
import { socketEmitter } from './socket/socketEmitter';

const PORT = env.PORT;

// ============================================
// 1. HTTP Server + Socket.io
// ============================================
const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
    cors: {
        origin: env.FRONTEND_URL || '*',
        methods: ['GET', 'POST'],
        credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
});

// Initialize Socket.io auth middleware & event handlers
initializeSocket(io);

// Make the io instance available to the service layer
socketEmitter.initialize(io);

// ============================================
// 2. Start Server
// ============================================
const server = httpServer.listen(PORT, async () => {
    try {
        // Check DB Connection
        await prisma.$connect();
        logger.info('✅ Database connected successfully');
        logger.info(`🚀 Server running on port ${PORT} in ${env.NODE_ENV} mode`);
        logger.info(`🔌 Socket.io ready on the same port`);
    } catch (error) {
        logger.error('❌ Database connection failed');
        logger.error(error);
        process.exit(1);
    }
});

// Graceful Shutdown
const exitHandler = () => {
    if (server) {
        server.close(() => {
            logger.info('Server closed');
            process.exit(1);

        });
    } else {
        process.exit(1);
    }
};

const unexpectedErrorHandler = (error: Error) => {
    logger.error('Unexpected Error: ', error);
    exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
    logger.info('SIGTERM received');
    if (server) {
        server.close();
    }
});

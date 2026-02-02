import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './config/prisma';

const PORT = env.PORT;

const server = app.listen(PORT, async () => {
    try {
        // Check DB Connection
        await prisma.$connect();
        logger.info('✅ Database connected successfully');
        logger.info(`🚀 Server running on port ${PORT} in ${env.NODE_ENV} mode`);
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

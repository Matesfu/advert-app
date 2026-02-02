import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export const globalErrorHandler = (
    err: Error | AppError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    let error = err;

    // Set default values if they are missing
    if (!(error instanceof AppError)) {
        const statusCode = 500;
        const message = error.message || 'Internal Server Error';
        error = new AppError(message, statusCode);
    }

    const { statusCode, status, message } = error as AppError;

    // Log the error
    logger.error(`[${req.method} ${req.originalUrl}] ${statusCode} - ${message}`);
    if (statusCode === 500 && env.NODE_ENV === 'development') {
        logger.error(err.stack);
    }

    // Send response
    res.status(statusCode).json({
        status,
        message,
        stack: env.NODE_ENV === 'development' ? err.stack : undefined,
    });
};

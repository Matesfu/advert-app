import { Response } from 'express';

/**
 * Standard success response structure for consistent API responses.
 */
interface SuccessResponse<T> {
    status: 'success';
    data: T;
    message?: string;
    meta?: Record<string, unknown>;
}

/**
 * Send a standardized success response.
 * @param res - Express Response object
 * @param data - The data payload to send
 * @param statusCode - HTTP status code (default: 200)
 * @param message - Optional success message
 * @param meta - Optional metadata (pagination, etc.)
 */
export const sendSuccess = <T>(
    res: Response,
    data: T,
    statusCode: number = 200,
    message?: string,
    meta?: Record<string, unknown>
): Response => {
    const response: SuccessResponse<T> = {
        status: 'success',
        data,
    };

    if (message) response.message = message;
    if (meta) response.meta = meta;

    return res.status(statusCode).json(response);
};

/**
 * Send a success response for resource creation (201).
 */
export const sendCreated = <T>(
    res: Response,
    data: T,
    message: string = 'Resource created successfully'
): Response => {
    return sendSuccess(res, data, 201, message);
};

/**
 * Send a success response for deletion (no content).
 */
export const sendNoContent = (res: Response): Response => {
    return res.status(204).send();
};

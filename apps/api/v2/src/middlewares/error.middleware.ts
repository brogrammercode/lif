import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/error.js';
import logger from '../utils/logger.js';
import { HttpStatus } from '../constants/http-status.js';
import config from '../core/config.js';

export const errorHandler = (
    err: Error | AppError,
    req: Request,
    res: Response,
    _next: NextFunction
) => {
    if (err instanceof AppError) {
        logger.error(`${err.statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);

        return res.status(err.statusCode).json({
            status: 'error',
            message: err.message,
            ...(err.code && { code: err.code }),
            ...(err.details && { details: err.details }),
        });
    }

    logger.error(`500 - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`, {
        stack: err.stack,
    });

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: config.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message,
        ...(config.NODE_ENV !== 'production' && { stack: err.stack }),
    });
};

export default errorHandler;
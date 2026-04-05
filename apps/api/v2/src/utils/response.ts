import { Response } from 'express';
import { HttpStatus } from '../constants/http-status.js';
import { ApiResponse } from '../types/common.js';

export const sendSuccess = <T>(
    res: Response,
    data: T,
    message: string = 'Success',
    statusCode: number = HttpStatus.OK
): Response => {
    const response: ApiResponse<T> = {
        status: 'success',
        message,
        data,
    };
    return res.status(statusCode).json(response);
};

export const sendError = (
    res: Response,
    message: string = 'Error occurred',
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR
): Response => {
    const response: ApiResponse = {
        status: 'error',
        message,
    };
    return res.status(statusCode).json(response);
};
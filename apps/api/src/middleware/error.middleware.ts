import type { ErrorRequestHandler, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { UNKNOWN_ERROR_MESSAGE, VALIDATION_ERROR_MESSAGE } from '../core/constants.js';
import { AppError, is_app_error } from '../core/error.js';

export const request_context: RequestHandler = (request, _response, next) => {
  request.request_id = randomUUID();
  next();
};

export const not_found_handler: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route was not found'));
};

export const error_handler: ErrorRequestHandler = (error, request, response, _next) => {
  const is_zod_error = error?.name === 'ZodError';
  const status_code = is_app_error(error) ? error.status_code : is_zod_error ? 422 : 500;
  const error_code = is_app_error(error) ? error.error_code : is_zod_error ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';
  const message = is_app_error(error)
    ? error.message
    : is_zod_error
      ? VALIDATION_ERROR_MESSAGE
      : UNKNOWN_ERROR_MESSAGE;
  const details = is_app_error(error) ? error.details : is_zod_error ? error.issues : undefined;
  console.error({ request_id: request.request_id, error });
  response.status(status_code).json({ status: 'error', message, error_code, request_id: request.request_id, details });
};

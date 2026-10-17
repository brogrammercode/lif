import type { ErrorRequestHandler, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import {
  UNKNOWN_ERROR_MESSAGE,
  VALIDATION_ERROR_MESSAGE,
  MALFORMED_JSON_MESSAGE,
  BODY_TOO_LARGE_MESSAGE,
  DUPLICATE_RECORD_MESSAGE,
} from '../core/constants.js';
import { Prisma } from '@prisma/client';
import { AppError, is_app_error } from '../core/error.js';

export const request_context: RequestHandler = (request, response, next) => {
  request.request_id = randomUUID();
  response.setHeader('X-Request-ID', request.request_id);
  next();
};

export const not_found_handler: RequestHandler = (
  _request,
  _response,
  next,
) => {
  next(new AppError(404, 'NOT_FOUND', 'Route was not found'));
};

export const error_handler: ErrorRequestHandler = (
  error,
  request,
  response,
  _next,
) => {
  const is_zod_error = error?.name === 'ZodError';
  const malformed =
    error instanceof SyntaxError &&
    'type' in error &&
    error.type === 'entity.parse.failed';
  const oversized = error?.type === 'entity.too.large';
  const duplicate =
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002';
  const status_code = is_app_error(error)
    ? error.status_code
    : is_zod_error
      ? 422
      : malformed
        ? 400
        : oversized
          ? 413
          : duplicate
            ? 409
            : 500;
  const error_code = is_app_error(error)
    ? error.error_code
    : is_zod_error
      ? 'VALIDATION_ERROR'
      : malformed
        ? 'MALFORMED_JSON'
        : oversized
          ? 'BODY_TOO_LARGE'
          : duplicate
            ? 'RECORD_EXISTS'
            : 'INTERNAL_ERROR';
  const message = is_app_error(error)
    ? error.message
    : is_zod_error
      ? VALIDATION_ERROR_MESSAGE
      : malformed
        ? MALFORMED_JSON_MESSAGE
        : oversized
          ? BODY_TOO_LARGE_MESSAGE
          : duplicate
            ? DUPLICATE_RECORD_MESSAGE
            : UNKNOWN_ERROR_MESSAGE;
  const details = is_app_error(error)
    ? error.details
    : is_zod_error
      ? error.issues
      : undefined;
  if (status_code < 500) {
    console.warn({
      request_id: request.request_id,
      path: request.originalUrl,
      status_code,
      error_code,
      message,
    });
  } else {
    console.error({ request_id: request.request_id, error });
  }
  response
    .status(status_code)
    .json({
      status: 'error',
      message,
      error_code,
      request_id: request.request_id,
      details,
    });
};

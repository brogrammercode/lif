import type { ErrorRequestHandler } from 'express';
import { AppError } from './error.js';
import { MALFORMED_JSON_MESSAGE } from './constants.js';
import { HTTP_MESSAGES } from './http.constant.js';

export const body_parser_error: ErrorRequestHandler = (
  error: unknown,
  _request,
  _response,
  next,
) => {
  if (
    error instanceof SyntaxError &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  ) {
    next(new AppError(400, 'MALFORMED_JSON', MALFORMED_JSON_MESSAGE));
    return;
  }
  if (
    error instanceof Error &&
    'status' in error &&
    error.status === 400 &&
    'code' in error &&
    ['Z_DATA_ERROR', 'Z_BUF_ERROR'].includes(String(error.code))
  ) {
    next(
      new AppError(
        400,
        'INVALID_REQUEST_BODY',
        HTTP_MESSAGES.INVALID_BODY_ENCODING,
      ),
    );
    return;
  }
  next(error);
};

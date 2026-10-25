import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { Request, Response } from 'express';
import { is_app_error } from './error.js';
import { AdminAuditService } from './admin_audit.service.js';
import {
  UNKNOWN_ERROR_MESSAGE,
  VALIDATION_ERROR_MESSAGE,
  MALFORMED_JSON_MESSAGE,
  BODY_TOO_LARGE_MESSAGE,
} from './constants.js';
import {
  HTTP_DATABASE_ERRORS,
  HTTP_ERROR_CODES,
  HTTP_MESSAGES,
} from './http.constant.js';
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly audit: AdminAuditService) {}
  async catch(error: unknown, host: ArgumentsHost): Promise<void> {
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();
    const validation = error instanceof ZodError;
    const malformed =
      error instanceof SyntaxError &&
      'type' in error &&
      error.type === 'entity.parse.failed';
    const oversized =
      error !== null &&
      typeof error === 'object' &&
      'type' in error &&
      error.type === 'entity.too.large';
    const database_code =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code
        : error instanceof Prisma.PrismaClientInitializationError
          ? error.errorCode
          : undefined;
    const database_error =
      database_code && Object.hasOwn(HTTP_DATABASE_ERRORS, database_code)
        ? HTTP_DATABASE_ERRORS[
            database_code as keyof typeof HTTP_DATABASE_ERRORS
          ]
        : undefined;
    const unsupported_encoding =
      error !== null &&
      typeof error === 'object' &&
      'type' in error &&
      ['charset.unsupported', 'encoding.unsupported'].includes(
        String(error.type),
      );
    const status_code = is_app_error(error)
      ? error.status_code
      : validation
        ? 422
        : malformed
          ? 400
          : oversized
            ? 413
            : unsupported_encoding
              ? 415
              : database_error
                ? database_error.status_code
                : error instanceof HttpException
                  ? error.getStatus()
                  : 500;
    const error_code = is_app_error(error)
      ? error.error_code
      : validation
        ? 'VALIDATION_ERROR'
        : malformed
          ? 'MALFORMED_JSON'
          : oversized
            ? 'BODY_TOO_LARGE'
            : unsupported_encoding
              ? 'UNSUPPORTED_MEDIA_TYPE'
              : database_error
                ? database_error.error_code
                : (HTTP_ERROR_CODES[
                    status_code as keyof typeof HTTP_ERROR_CODES
                  ] ?? 'INTERNAL_ERROR');
    const message = is_app_error(error)
      ? error.message
      : validation
        ? VALIDATION_ERROR_MESSAGE
        : malformed
          ? MALFORMED_JSON_MESSAGE
          : oversized
            ? BODY_TOO_LARGE_MESSAGE
            : unsupported_encoding
              ? HTTP_MESSAGES.UNSUPPORTED_ENCODING
              : database_error
                ? database_error.message
                : status_code === 404
                  ? HTTP_MESSAGES.NOT_FOUND
                  : error instanceof HttpException && status_code < 500
                    ? error.message
                    : UNKNOWN_ERROR_MESSAGE;
    if (status_code < 500)
      console.warn({
        request_id: request.request_id,
        path: request.originalUrl,
        status_code,
        error_code,
        message,
      });
    else
      console.error({
        request_id: request.request_id,
        path: request.originalUrl,
        status_code,
        error_code,
        error,
      });
    if (status_code === 503 && !response.headersSent)
      response.setHeader('Retry-After', '3');
    await this.audit
      .complete(request, response, { status_code })
      .catch((auditError) => this.audit.report_failure(request, auditError));
    if (!response.headersSent)
      response.status(status_code).json({
        status: 'error',
        message,
        error_code,
        request_id: request.request_id,
        details: is_app_error(error)
          ? error.details
          : validation
            ? error.issues
            : undefined,
      });
  }
}

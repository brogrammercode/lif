import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from './config.js';
import { AppError } from './error.js';
import { HTTP_CONFIG, HTTP_MESSAGES } from './http.constant.js';
import { ADMIN_AUTH_MESSAGES } from '../features/admin_auth/admin_auth.constant.js';
import { WEBHOOK_SIGNATURE_HEADER } from '../features/payment/payment.constant.js';
export { AuthGuard } from '../common/guards/auth.guard.js';
export { DriverAccessGuard } from '../common/guards/driver-access.guard.js';
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', ADMIN_AUTH_MESSAGES.EXPIRED);
    if (request.auth.role !== 'ADMIN') {
      console.warn({
        request_id: request.request_id,
        admin_access_denied: {
          user_id: request.auth.user_id,
          current_role: request.auth.role,
          method: request.method,
          path: request.path,
        },
      });
      throw new AppError(
        403,
        'ADMIN_ACCESS_DENIED',
        ADMIN_AUTH_MESSAGES.DENIED,
      );
    }
    return true;
  }
}
@Injectable()
export class AdminOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origins = config.ADMIN_WEB_ORIGIN.split(',').map((origin) =>
      origin.trim(),
    );
    if (!request.headers.origin || !origins.includes(request.headers.origin)) {
      console.warn({
        event: 'ADMIN_ORIGIN_REJECTED',
        request_id: request.request_id,
        origin: request.headers.origin ?? null,
        allowed_origins: origins,
      });
      throw new AppError(403, 'ORIGIN_NOT_ALLOWED', ADMIN_AUTH_MESSAGES.ORIGIN);
    }
    return true;
  }
}
@Injectable()
export class AdminSignInGuard implements CanActivate {
  private readonly attempts = new Map<
    string,
    { count: number; expires: number }
  >();
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const now = Date.now();
    for (const [key, value] of this.attempts)
      if (value.expires <= now) this.attempts.delete(key);
    const key = request.ip ?? HTTP_CONFIG.UNKNOWN_IP;
    const entry = this.attempts.get(key) ?? {
      count: 0,
      expires: now + HTTP_CONFIG.RATE_LIMIT_MS,
    };
    entry.count++;
    this.attempts.set(key, entry);
    if (entry.count > HTTP_CONFIG.RATE_LIMIT_COUNT) {
      response.setHeader(
        HTTP_CONFIG.RATE_LIMIT_HEADER,
        Math.ceil((entry.expires - now) / 1000),
      );
      throw new AppError(429, 'RATE_LIMITED', ADMIN_AUTH_MESSAGES.RATE_LIMIT);
    }
    return true;
  }
}
@Injectable()
export class PaymentWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const signature = request.header(WEBHOOK_SIGNATURE_HEADER);
    if (!signature)
      throw new AppError(
        401,
        'INVALID_WEBHOOK_SIGNATURE',
        HTTP_MESSAGES.WEBHOOK_SIGNATURE_REQUIRED,
      );
    if (!request.raw_body)
      throw new AppError(
        401,
        'INVALID_WEBHOOK_SIGNATURE',
        HTTP_MESSAGES.WEBHOOK_BODY_REQUIRED,
      );
    const expected = createHmac('sha256', config.PAYMENT_WEBHOOK_SECRET)
      .update(request.raw_body)
      .digest('hex');
    const received = Buffer.from(signature);
    const expected_buffer = Buffer.from(expected);
    if (
      received.length !== expected_buffer.length ||
      !timingSafeEqual(received, expected_buffer)
    )
      throw new AppError(
        401,
        'INVALID_WEBHOOK_SIGNATURE',
        HTTP_MESSAGES.WEBHOOK_SIGNATURE_INVALID,
      );
    return true;
  }
}

import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { PrismaService } from '../infra/database/prisma.service.js';
import { read_access_token } from '../infra/security/token.js';
import { config } from './config.js';
import { AppError } from './error.js';
import {
  ACCOUNT_INACTIVE_MESSAGE,
  AUTHORIZATION_PREFIX,
  SESSION_EXPIRED_MESSAGE,
  UNAUTHORIZED_ERROR_MESSAGE,
} from './constants.js';
import { HTTP_CONFIG, HTTP_MESSAGES } from './http.constant.js';
import { ADMIN_AUTH_MESSAGES } from '../features/admin_auth/admin_auth.constant.js';
import { WEBHOOK_SIGNATURE_HEADER } from '../features/payment/payment.constant.js';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly database: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const header = request.header('authorization');
    if (!header?.startsWith(AUTHORIZATION_PREFIX))
      throw new AppError(401, 'UNAUTHORIZED', UNAUTHORIZED_ERROR_MESSAGE);
    const auth = read_access_token(header.slice(AUTHORIZATION_PREFIX.length));
    const user = await this.database.client.user.findUnique({
      where: { id: auth.user_id },
      select: {
        role: true,
        status: true,
        sessions: auth.session_family_id
          ? {
              where: {
                family_id: auth.session_family_id,
                revoked_at: null,
                expires_at: { gt: new Date() },
              },
              select: { id: true },
              take: 1,
            }
          : false,
      },
    });
    if (!user)
      throw new AppError(401, 'INVALID_SESSION', SESSION_EXPIRED_MESSAGE);
    if (user.status !== 'ACTIVE')
      throw new AppError(403, 'USER_INACTIVE', ACCOUNT_INACTIVE_MESSAGE);
    if (auth.session_family_id && !user.sessions?.length)
      throw new AppError(401, 'INVALID_SESSION', SESSION_EXPIRED_MESSAGE);
    request.auth = { ...auth, role: user.role };
    response.setHeader(HTTP_CONFIG.CACHE_CONTROL_HEADER, HTTP_CONFIG.NO_STORE);
    return true;
  }
}
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', ADMIN_AUTH_MESSAGES.EXPIRED);
    if (request.auth.role !== 'ADMIN')
      throw new AppError(
        403,
        'ADMIN_ACCESS_DENIED',
        ADMIN_AUTH_MESSAGES.DENIED,
      );
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
    if (!request.headers.origin || !origins.includes(request.headers.origin))
      throw new AppError(403, 'ORIGIN_NOT_ALLOWED', ADMIN_AUTH_MESSAGES.ORIGIN);
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

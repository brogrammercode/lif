import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PrismaService } from '../infra/database/prisma.service.js';
import { CloudinaryService } from '../infra/media/cloudinary.js';
import {
  AuthGuard,
  AdminGuard,
  AdminOriginGuard,
  AdminSignInGuard,
  PaymentWebhookGuard,
} from './guards.js';
import { HttpExceptionFilter } from './http_exception.filter.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { RequestContextMiddleware } from './request_context.middleware.js';
const PROVIDERS = [
  PrismaService,
  CloudinaryService,
  AuthGuard,
  AdminGuard,
  AdminOriginGuard,
  AdminSignInGuard,
  PaymentWebhookGuard,
  IdempotencyInterceptor,
  RequestContextMiddleware,
];
@Global()
@Module({
  providers: [
    ...PROVIDERS,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
  exports: PROVIDERS,
})
export class CoreModule {}

import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AdminAuditService } from './admin_audit.service.js';
import { AdminAuditInterceptor } from './admin_audit.interceptor.js';
import { PrismaService } from '../infra/database/prisma.service.js';
import { CloudinaryService } from '../infra/media/cloudinary.js';
import {
  AuthGuard,
  DriverAccessGuard,
  AdminGuard,
  AdminOriginGuard,
  AdminSignInGuard,
  PaymentWebhookGuard,
} from './guards.js';
import { HttpExceptionFilter } from './http_exception.filter.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { RequestContextMiddleware } from './request_context.middleware.js';
const PROVIDERS = [
  AdminAuditService,
  PrismaService,
  CloudinaryService,
  AuthGuard,
  DriverAccessGuard,
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
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
  ],
  exports: PROVIDERS,
})
export class CoreModule {}

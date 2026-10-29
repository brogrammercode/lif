import { PendingInvalidationInterceptor } from './pending_invalidation.interceptor.js';
import { Global, Module } from '@nestjs/common';
import { AuditRetentionService } from './audit_retention.service.js';
import { AuditRetentionController } from './audit_retention.controller.js';
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
  AuditRetentionService,
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
  controllers: [AuditRetentionController],
  providers: [
    ...PROVIDERS,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: PendingInvalidationInterceptor },
  ],
  exports: PROVIDERS,
})
export class CoreModule {}

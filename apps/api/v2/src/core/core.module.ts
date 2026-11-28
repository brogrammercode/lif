import { PendingInvalidationInterceptor } from './pending_invalidation.interceptor.js';
import { Global, Module } from '@nestjs/common';
import { AuditRetentionService } from './audit_retention.service.js';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AdminAuditService } from './admin_audit.service.js';
import { AdminAuditRepository } from '../database/admin-audit.repository.js';
import { AdminAuditInterceptor } from './admin_audit.interceptor.js';
import { DatabaseModule } from '../database/database.module.js';
import { IdempotencyRepository } from '../database/idempotency.repository.js';
import { AccessRepository } from '../database/access.repository.js';
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
  AdminAuditRepository,
  AccessRepository,
  CloudinaryService,
  AuthGuard,
  DriverAccessGuard,
  AdminGuard,
  AdminOriginGuard,
  AdminSignInGuard,
  PaymentWebhookGuard,
  IdempotencyRepository,
  IdempotencyInterceptor,
  RequestContextMiddleware,
];
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    ...PROVIDERS,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: PendingInvalidationInterceptor },
  ],
  exports: PROVIDERS,
})
export class CoreModule {}

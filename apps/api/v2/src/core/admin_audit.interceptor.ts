import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AdminAuditService,
  is_admin_auth_path,
} from './admin_audit.service.js';

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AdminAuditService) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.admin_actor_id || is_admin_auth_path(request.path))
      await this.audit.start(request);
    return next.handle();
  }
}

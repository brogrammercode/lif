import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { concatMap } from 'rxjs';
import {
  AdminAuditService,
  should_audit_admin,
} from './admin_audit.service.js';

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AdminAuditService) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    if (!should_audit_admin(request)) return next.handle();
    await this.audit.start(request);
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      concatMap(async (value) => {
        // Finish before serializing success; finish/close middleware remains a
        // retry path. Never turn a committed mutation into a retryable error just
        // because its request-outcome update failed.
        await this.audit
          .complete(request, response)
          .catch((error) => this.audit.report_failure(request, error));
        return value;
      }),
    );
  }
}

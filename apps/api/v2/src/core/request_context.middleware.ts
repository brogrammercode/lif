import { is_pending_poll } from '../features/admin_pending/pending.rules.js';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import type { Request, Response, NextFunction } from 'express';
import { HTTP_CONFIG } from './http.constant.js';
import {
  AdminAuditService,
  is_admin_path,
  should_audit_admin,
} from './admin_audit.service.js';
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly audit: AdminAuditService) {}
  use(request: Request, response: Response, next: NextFunction): void {
    request.request_id = randomUUID();
    response.setHeader(HTTP_CONFIG.REQUEST_ID_HEADER, request.request_id);
    const completion = new Promise<void>((resolve) => {
      response.once('finish', () => {
        if (should_audit_admin(request))
          void this.audit
            .complete(request, response, { source: 'response' })
            .catch((error) => this.audit.report_failure(request, error))
            .finally(resolve);
        else resolve();
      });
      response.once('close', () => {
        if (!response.writableFinished) {
          if (should_audit_admin(request))
            void this.audit
              .complete(request, response, {
                status_code: 499,
                source: 'abort',
              })
              .catch((error) => this.audit.report_failure(request, error))
              .finally(resolve);
          else resolve();
        }
      });
    });
    waitUntil(completion);
    // Record admin attempts before guards/body parsing. No request body, token
    // or query is stored.
    if (
      is_admin_path(request.originalUrl || request.path) &&
      !is_pending_poll(request.method, request.originalUrl || request.path)
    )
      void this.audit.start(request).then(() => next(), next);
    else next();
  }
}

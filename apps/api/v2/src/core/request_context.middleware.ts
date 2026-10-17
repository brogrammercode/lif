import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import type { Request, Response, NextFunction } from 'express';
import { HTTP_CONFIG } from './http.constant.js';
import {
  AdminAuditService,
  is_admin_auth_path,
} from './admin_audit.service.js';
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly audit: AdminAuditService) {}
  use(request: Request, response: Response, next: NextFunction): void {
    request.request_id = randomUUID();
    response.setHeader(HTTP_CONFIG.REQUEST_ID_HEADER, request.request_id);
    const completion = new Promise<void>((resolve) => {
      response.once('finish', () => {
        if (
          request.admin_actor_id ||
          request.admin_activity_id ||
          is_admin_auth_path(request.path)
        )
          void this.audit
            .complete(request, response)
            .catch((error) =>
              console.error({
                event: 'ADMIN_ACTIVITY_SAVE_FAILED',
                request_id: request.request_id,
                error,
              }),
            )
            .finally(resolve);
        else resolve();
      });
      response.once('close', () => {
        if (!response.writableFinished) resolve();
      });
    });
    waitUntil(completion);
    next();
  }
}

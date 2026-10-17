import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { HTTP_CONFIG } from './http.constant.js';
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    request.request_id = randomUUID();
    response.setHeader(HTTP_CONFIG.REQUEST_ID_HEADER, request.request_id);
    next();
  }
}

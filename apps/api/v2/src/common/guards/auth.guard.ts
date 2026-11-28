import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ACCOUNT_INACTIVE_MESSAGE,
  AUTHORIZATION_PREFIX,
  SESSION_EXPIRED_MESSAGE,
  UNAUTHORIZED_ERROR_MESSAGE,
} from '../../core/constants.js';
import { AppError } from '../../core/error.js';
import { HTTP_CONFIG } from '../../core/http.constant.js';
import { AccessRepository } from '../../database/access.repository.js';
import { read_access_token } from '../../infra/security/token.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly access: AccessRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const header = request.header('authorization');
    if (!header?.startsWith(AUTHORIZATION_PREFIX))
      throw new AppError(401, 'UNAUTHORIZED', UNAUTHORIZED_ERROR_MESSAGE);
    const auth = read_access_token(header.slice(AUTHORIZATION_PREFIX.length));
    const account = await this.access.account(
      auth.user_id,
      auth.session_family_id,
      new Date(),
    );
    if (!account)
      throw new AppError(401, 'INVALID_SESSION', SESSION_EXPIRED_MESSAGE);
    if (account.role === 'ADMIN') request.admin_actor_id = auth.user_id;
    if (account.status !== 'ACTIVE' || account.deleted_at)
      throw new AppError(403, 'USER_INACTIVE', ACCOUNT_INACTIVE_MESSAGE);
    if (!account.session_valid)
      throw new AppError(401, 'INVALID_SESSION', SESSION_EXPIRED_MESSAGE);
    request.auth = { ...auth, role: account.role };
    response.setHeader(HTTP_CONFIG.CACHE_CONTROL_HEADER, HTTP_CONFIG.NO_STORE);
    return true;
  }
}

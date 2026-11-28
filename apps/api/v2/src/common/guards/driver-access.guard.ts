import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { UNAUTHORIZED_ERROR_MESSAGE } from '../../core/constants.js';
import { AppError } from '../../core/error.js';
import { AccessRepository } from '../../database/access.repository.js';

@Injectable()
export class DriverAccessGuard implements CanActivate {
  constructor(private readonly access: AccessRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', UNAUTHORIZED_ERROR_MESSAGE);
    const status = await this.access.partnerStatus(request.auth.user_id);
    if (status === 'EXITED')
      throw new AppError(
        403,
        'DRIVER_EXITED',
        'Your partner exit is complete. Driver operations are disabled.',
      );
    if (status && status !== 'ACTIVATED')
      throw new AppError(
        403,
        'DRIVER_ACTIVATION_REQUIRED',
        'Complete driver activation before using driver operations.',
      );
    return true;
  }
}

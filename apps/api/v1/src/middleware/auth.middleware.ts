import type { RequestHandler } from 'express';
import {
  AUTHORIZATION_PREFIX,
  UNAUTHORIZED_ERROR_MESSAGE,
  ACCOUNT_INACTIVE_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from '../core/constants.js';
import { AppError } from '../core/error.js';
import { read_access_token } from '../infra/security/token.js';
import { prisma } from '../infra/database/client.js';

export const require_auth: RequestHandler = async (request, response, next) => {
  const header = request.header('authorization');
  if (!header?.startsWith(AUTHORIZATION_PREFIX)) {
    next(new AppError(401, 'UNAUTHORIZED', UNAUTHORIZED_ERROR_MESSAGE));
    return;
  }
  try {
    const auth = read_access_token(header.slice(AUTHORIZATION_PREFIX.length));
    const user = await prisma.user.findUnique({
      where: { id: auth.user_id },
      select: {
        role: true,
        status: true,
        sessions: auth.session_family_id
          ? {
              where: {
                family_id: auth.session_family_id,
                revoked_at: null,
                expires_at: { gt: new Date() },
              },
              select: { id: true },
              take: 1,
            }
          : false,
      },
    });
    if (!user)
      throw new AppError(401, 'INVALID_SESSION', SESSION_EXPIRED_MESSAGE);
    if (user.status !== 'ACTIVE')
      throw new AppError(403, 'USER_INACTIVE', ACCOUNT_INACTIVE_MESSAGE);
    if (auth.session_family_id && !user.sessions?.length)
      throw new AppError(401, 'INVALID_SESSION', SESSION_EXPIRED_MESSAGE);
    request.auth = { ...auth, role: user.role };
    response.setHeader('Cache-Control', 'no-store');
    next();
  } catch (error) {
    next(error);
  }
};

export const require_role =
  (...roles: string[]): RequestHandler =>
  (request, _response, next) => {
    if (!request.auth || !roles.includes(request.auth.role)) {
      next(
        new AppError(
          403,
          'FORBIDDEN',
          'You are not allowed to perform this action',
        ),
      );
      return;
    }
    next();
  };

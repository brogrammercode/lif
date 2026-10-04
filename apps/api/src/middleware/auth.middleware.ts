import type { RequestHandler } from 'express';
import { AUTHORIZATION_PREFIX, UNAUTHORIZED_ERROR_MESSAGE } from '../core/constants.js';
import { AppError } from '../core/error.js';
import { read_access_token } from '../infra/security/token.js';

export const require_auth: RequestHandler = (request, _response, next) => {
  const header = request.header('authorization');
  if (!header?.startsWith(AUTHORIZATION_PREFIX)) {
    next(new AppError(401, 'UNAUTHORIZED', UNAUTHORIZED_ERROR_MESSAGE));
    return;
  }
  try {
    request.auth = read_access_token(header.slice(AUTHORIZATION_PREFIX.length));
    next();
  } catch (error) {
    next(error);
  }
};

export const require_role = (...roles: string[]): RequestHandler => (request, _response, next) => {
  if (!request.auth || !roles.includes(request.auth.role)) {
    next(new AppError(403, 'FORBIDDEN', 'You are not allowed to perform this action'));
    return;
  }
  next();
};

import type { RequestHandler } from 'express';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { ADMIN_AUTH_MESSAGES } from './admin_auth.constant.js';

export const require_admin: RequestHandler = (request, _response, next) => {
  try {
    if (!request.auth)
      throw new AppError(401, 'UNAUTHORIZED', ADMIN_AUTH_MESSAGES.EXPIRED);
    if (request.auth.role !== 'ADMIN')
      throw new AppError(
        403,
        'ADMIN_ACCESS_DENIED',
        ADMIN_AUTH_MESSAGES.DENIED,
      );
    next();
  } catch (error) {
    next(error);
  }
};

export const require_admin_origin: RequestHandler = (
  request,
  _response,
  next,
) => {
  const origins = config.ADMIN_WEB_ORIGIN.split(',').map((origin) =>
    origin.trim(),
  );
  if (!request.headers.origin || !origins.includes(request.headers.origin)) {
    next(new AppError(403, 'ORIGIN_NOT_ALLOWED', ADMIN_AUTH_MESSAGES.ORIGIN));
    return;
  }
  next();
};

const attempts = new Map<string, { count: number; expires: number }>();
export const limit_admin_sign_in: RequestHandler = (
  request,
  response,
  next,
) => {
  const now = Date.now();
  for (const [key, value] of attempts)
    if (value.expires <= now) attempts.delete(key);
  const key = request.ip ?? 'unknown';
  const entry = attempts.get(key) ?? { count: 0, expires: now + 60_000 };
  entry.count++;
  attempts.set(key, entry);
  if (entry.count > 15) {
    response.setHeader('Retry-After', Math.ceil((entry.expires - now) / 1000));
    next(new AppError(429, 'RATE_LIMITED', ADMIN_AUTH_MESSAGES.RATE_LIMIT));
    return;
  }
  next();
};

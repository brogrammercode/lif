import jwt from 'jsonwebtoken';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
export type AuthTokenPayload = {
  user_id: string;
  role: string;
  token_type: 'access';
  session_family_id?: string;
};
export const create_access_token = (
  payload: Omit<AuthTokenPayload, 'token_type'>,
): string =>
  jwt.sign({ ...payload, token_type: 'access' }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
export const read_access_token = (token: string): AuthTokenPayload => {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof decoded.user_id !== 'string' ||
      typeof decoded.role !== 'string' ||
      decoded.token_type !== 'access' ||
      (decoded.session_family_id !== undefined &&
        (typeof decoded.session_family_id !== 'string' ||
          !decoded.session_family_id))
    ) {
      throw new Error('Invalid token payload');
    }
    return {
      user_id: decoded.user_id,
      role: decoded.role,
      token_type: 'access',
      ...(typeof decoded.session_family_id === 'string'
        ? { session_family_id: decoded.session_family_id }
        : {}),
    };
  } catch {
    throw new AppError(
      401,
      'INVALID_TOKEN',
      'The access token is invalid or expired',
    );
  }
};

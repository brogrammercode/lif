import type { Request, Response } from 'express';
import { send_success } from '../../core/response.js';
import { AppError } from '../../core/error.js';
import {
  LOGIN_SUCCESS_MESSAGE,
  LOGOUT_SUCCESS_MESSAGE,
  REFRESH_SUCCESS_MESSAGE,
} from './auth.constant.js';
import { external_login_schema, refresh_schema } from './auth.type.js';
import {
  get_current_user,
  login_with_provider,
  logout,
  refresh_session,
} from './auth.service.js';
import { verify_google_identity } from './auth.security.js';

const request_data = (request: Request) => ({
  user_agent: request.header('user-agent'),
  ip_address: request.ip,
});

export const google_login = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const input = external_login_schema.parse(request.body);
  const identity = await verify_google_identity(input.id_token);
  const result = await login_with_provider(
    'GOOGLE',
    identity,
    request_data(request),
  );
  send_success(response, result, LOGIN_SUCCESS_MESSAGE);
};

export const refresh = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const input = refresh_schema.parse(request.body);
  const result = await refresh_session(
    input.refresh_token,
    request_data(request),
  );
  send_success(response, result, REFRESH_SUCCESS_MESSAGE);
};

export const current_user = async (
  request: Request,
  response: Response,
): Promise<void> => {
  if (!request.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  }
  send_success(
    response,
    await get_current_user(request.auth.user_id),
    'Current user loaded',
  );
};

export const revoke = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const input = refresh_schema.parse(request.body);
  await logout(input.refresh_token);
  send_success(response, null, LOGOUT_SUCCESS_MESSAGE);
};

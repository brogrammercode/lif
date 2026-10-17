import type { CookieOptions, Request, Response } from 'express';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import { external_login_schema } from '../auth/auth.type.js';
import {
  ADMIN_AUTH_MESSAGES,
  ADMIN_COOKIE,
  ADMIN_COOKIE_PATH,
} from './admin_auth.constant.js';
import {
  current_admin,
  login_admin,
  logout_admin,
  refresh_admin,
} from './admin_auth.service.js';

const cookie_options: CookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict',
  path: ADMIN_COOKIE_PATH,
};
const refresh_cookie = (request: Request) => {
  const cookie = request.headers.cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${ADMIN_COOKIE}=`));
  return cookie?.slice(ADMIN_COOKIE.length + 1) ?? '';
};
const request_data = (request: Request) => ({
  user_agent: request.header('user-agent'),
  ip_address: request.ip,
});
const browser_response = (
  response: Response,
  session: Awaited<ReturnType<typeof login_admin>>,
  message: string,
) => {
  response.cookie(ADMIN_COOKIE, session.refresh_token, {
    ...cookie_options,
    expires: session.expires_at,
  });
  response.setHeader('Cache-Control', 'no-store');
  send_success(
    response,
    { access_token: session.access_token, user: session.user },
    message,
  );
};
export const google = async (request: Request, response: Response) =>
  browser_response(
    response,
    await login_admin(
      external_login_schema.parse(request.body).id_token,
      request_data(request),
    ),
    ADMIN_AUTH_MESSAGES.SIGNED_IN,
  );
export const refresh = async (request: Request, response: Response) => {
  try {
    const token = refresh_cookie(request);
    if (!token)
      throw new AppError(401, 'INVALID_SESSION', ADMIN_AUTH_MESSAGES.EXPIRED);
    browser_response(
      response,
      await refresh_admin(token, request_data(request)),
      ADMIN_AUTH_MESSAGES.RESTORED,
    );
  } catch (error) {
    if (error instanceof AppError && error.status_code === 401)
      response.clearCookie(ADMIN_COOKIE, cookie_options);
    throw error;
  }
};
export const logout = async (request: Request, response: Response) => {
  const token = refresh_cookie(request);
  if (token) await logout_admin(token);
  response.clearCookie(ADMIN_COOKIE, cookie_options);
  response.setHeader('Cache-Control', 'no-store');
  send_success(response, null, ADMIN_AUTH_MESSAGES.SIGNED_OUT);
};
export const me = async (request: Request, response: Response) => {
  response.setHeader('Cache-Control', 'no-store');
  send_success(
    response,
    await current_admin(request.auth!.user_id),
    ADMIN_AUTH_MESSAGES.PROFILE,
  );
};

import { config } from '../../core/config.js';
import { verify_google_identity } from '../auth/auth.security.js';
import {
  create_admin_session,
  rotate_admin_session,
  revoke_admin_session,
  find_current_admin,
} from './admin_auth.repo.js';
import type { SessionRequest } from './admin_auth.type.js';

export const login_admin = async (
  id_token: string,
  request_data: SessionRequest,
) =>
  create_admin_session(
    await verify_google_identity(
      id_token,
      config.GOOGLE_WEB_CLIENT_ID || config.GOOGLE_CLIENT_ID,
    ),
    request_data,
  );
export const refresh_admin = (token: string, request_data: SessionRequest) =>
  rotate_admin_session(token, request_data);
export const logout_admin = (token: string) => revoke_admin_session(token);
export const current_admin = (id: string) => find_current_admin(id);

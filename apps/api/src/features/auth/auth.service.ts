import type { AuthProvider } from '@prisma/client';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { create_refresh_token, create_token_hash } from '../../infra/security/hash.js';
import { create_access_token } from '../../infra/security/token.js';
import { INVALID_SESSION_MESSAGE, USER_NOT_FOUND_MESSAGE } from './auth.constant.js';
import {
  create_external_user,
  create_session,
  find_account_with_user,
  find_session,
  find_user_by_id,
  revoke_session,
  update_external_user,
} from './auth.repo.js';
import type { AuthResponse, ExternalLoginInput } from './auth.type.js';

const to_user_response = (user: { id: string; role: string; status: string; first_name: string | null; last_name: string | null; email: string | null; phone_e164: string | null; avatar_url: string | null; last_known_latitude: { toNumber(): number } | null; last_known_longitude: { toNumber(): number } | null; driver_profile?: unknown }) => ({
  id: user.id,
  role: user.role,
  status: user.status,
  first_name: user.first_name,
  last_name: user.last_name,
  email: user.email,
  phone_e164: user.phone_e164,
  avatar_url: user.avatar_url,
  last_known_latitude: user.last_known_latitude?.toNumber() ?? null,
  last_known_longitude: user.last_known_longitude?.toNumber() ?? null,
  driver_profile: user.driver_profile,
});

const issue_session = async (user: Parameters<typeof to_user_response>[0], request_data: { user_agent?: string; ip_address?: string }): Promise<AuthResponse> => {
  const refresh_token = create_refresh_token();
  const refresh_token_hash = create_token_hash(refresh_token);
  const expires_at = new Date(Date.now() + config.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await create_session(user.id, refresh_token_hash, expires_at, request_data.user_agent, request_data.ip_address);
  return {
    access_token: create_access_token({ user_id: user.id, role: user.role }),
    refresh_token,
    user: to_user_response(user),
  };
};

export const login_with_provider = async (
  provider: AuthProvider,
  input: ExternalLoginInput,
  request_data: { user_agent?: string; ip_address?: string },
): Promise<AuthResponse> => {
  const account = await find_account_with_user(provider, input.provider_account_id);
  const user = account
    ? await update_external_user(account.user.id, input, account.user.id)
    : await create_external_user(provider, input, '');
  if (user.status !== 'ACTIVE') {
    throw new AppError(403, 'USER_INACTIVE', 'This account is not active');
  }
  return issue_session(user, request_data);
};

export const refresh_session = async (refresh_token: string, request_data: { user_agent?: string; ip_address?: string }): Promise<AuthResponse> => {
  const session = await find_session(create_token_hash(refresh_token));
  if (!session || session.revoked_at || session.expires_at.getTime() <= Date.now()) {
    throw new AppError(401, 'INVALID_SESSION', INVALID_SESSION_MESSAGE);
  }
  await revoke_session(session.id, session.user_id);
  return issue_session(session.user, request_data);
};

export const get_current_user = async (user_id: string) => {
  const user = await find_user_by_id(user_id);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', USER_NOT_FOUND_MESSAGE);
  }
  return to_user_response(user);
};

export const logout = async (refresh_token: string, actor_uid: string): Promise<void> => {
  const session = await find_session(create_token_hash(refresh_token));
  if (session && !session.revoked_at) {
    await revoke_session(session.id, actor_uid);
  }
};

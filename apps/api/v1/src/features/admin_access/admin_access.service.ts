import * as admin_access_repo from './admin_access.repo.js';
import type { AccessUserRecord } from './admin_access.repo.js';
import type {
  AccessListInput,
  GrantAccessInput,
  RevokeAccessInput,
} from './admin_access.type.js';

const access_person = (user: AccessUserRecord) => {
  const grant =
    user.admin_access?.revoked_at === null ? user.admin_access : null;
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    avatar_url: user.avatar_url,
    role: user.role,
    status: user.status,
    updated_at: user.updated_at,
    has_google_account: user.auth_accounts.length > 0,
    granted_at: grant?.granted_at ?? null,
    granted_by: grant?.granted_by ?? null,
  };
};

export const list_access = async (input: AccessListInput) => {
  const { users, ...result } = await admin_access_repo.list_access(input);
  return { ...result, admins: users.map(access_person) };
};
export const grant_access = async (
  actor_id: string,
  input: GrantAccessInput,
) => {
  const result = await admin_access_repo.grant_access(actor_id, input);
  return { changed: result.changed, admin: access_person(result.user) };
};
export const revoke_access = (
  actor_id: string,
  user_id: string,
  input: RevokeAccessInput,
) => admin_access_repo.revoke_access(actor_id, user_id, input);

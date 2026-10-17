import { Injectable } from '@nestjs/common';
import { read_login_location } from '../../infra/security/login_location.js';
import {
  AdminAccessRepository,
  type AccessUserRecord,
} from './admin_access.repo.js';
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
    access_version: grant?.updated_at ?? null,
    last_login_at: user.last_login_at,
    last_admin_login_at: user.last_admin_login_at,
    last_login_location: read_login_location(user.audit_logs[0]?.after_data),
    has_google_account: user.auth_accounts.length > 0,
    granted_at: grant?.granted_at ?? null,
    granted_by: grant?.granted_by ?? null,
  };
};

@Injectable()
export class AdminAccessService {
  constructor(private readonly adminAccessRepository: AdminAccessRepository) {}
  readonly list_access = async (input: AccessListInput) => {
    const { users, ...result } =
      await this.adminAccessRepository.list_access(input);
    return { ...result, admins: users.map(access_person) };
  };
  readonly grant_access = async (actor_id: string, input: GrantAccessInput) => {
    const result = await this.adminAccessRepository.grant_access(
      actor_id,
      input,
    );
    return { changed: result.changed, admin: access_person(result.user) };
  };
  readonly revoke_access = (
    actor_id: string,
    user_id: string,
    input: RevokeAccessInput,
  ) => this.adminAccessRepository.revoke_access(actor_id, user_id, input);
}

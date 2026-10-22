import { Injectable } from '@nestjs/common';
import { schedule_new_user_emails } from '../../infra/mail/new_user_email.js';
import { AdminAuthRepository } from './admin_auth.repo.js';
import { config } from '../../core/config.js';
import { verify_google_identity } from '../auth/auth.security.js';
import type { SessionRequest } from './admin_auth.type.js';
import { resolve_login_location } from '../../infra/security/login_location.js';
@Injectable()
export class AdminAuthService {
  constructor(private readonly adminAuthRepository: AdminAuthRepository) {}
  readonly login_admin = async (
    id_token: string,
    request_data: SessionRequest,
  ) => {
    const identity = await verify_google_identity(
      id_token,
      config.GOOGLE_WEB_CLIENT_ID || config.GOOGLE_CLIENT_ID,
    );
    const login_location = await resolve_login_location(
      request_data.ip_address,
      request_data.browser_location,
    );
    const session = await this.adminAuthRepository.create_admin_session(
      identity,
      {
        ...request_data,
        login_location,
      },
    );
    schedule_new_user_emails();
    return session;
  };

  readonly refresh_admin = (token: string, request_data: SessionRequest) =>
    this.adminAuthRepository.rotate_admin_session(token, request_data);

  readonly logout_admin = (token: string) =>
    this.adminAuthRepository.revoke_admin_session(token);

  readonly current_admin = (id: string) =>
    this.adminAuthRepository.find_current_admin(id);
}

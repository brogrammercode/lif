import { Injectable } from '@nestjs/common';
import { AdminAuthRepository } from './admin_auth.repo.js';
import { config } from '../../core/config.js';
import { verify_google_identity } from '../auth/auth.security.js';
import type { SessionRequest } from './admin_auth.type.js';
@Injectable()
export class AdminAuthService {
  constructor(private readonly adminAuthRepository: AdminAuthRepository) {}
  readonly login_admin = async (
    id_token: string,
    request_data: SessionRequest,
  ) =>
    this.adminAuthRepository.create_admin_session(
      await verify_google_identity(
        id_token,
        config.GOOGLE_WEB_CLIENT_ID || config.GOOGLE_CLIENT_ID,
      ),
      request_data,
    );

  readonly refresh_admin = (token: string, request_data: SessionRequest) =>
    this.adminAuthRepository.rotate_admin_session(token, request_data);

  readonly logout_admin = (token: string) =>
    this.adminAuthRepository.revoke_admin_session(token);

  readonly current_admin = (id: string) =>
    this.adminAuthRepository.find_current_admin(id);
}

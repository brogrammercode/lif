import { Injectable } from '@nestjs/common';
import { AuthRepository } from './auth.repo.js';
import type { AuthProvider } from '@prisma/client';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import {
  create_refresh_token,
  create_token_hash,
} from '../../infra/security/hash.js';
import { create_access_token } from '../../infra/security/token.js';
import {
  INVALID_SESSION_MESSAGE,
  USER_NOT_FOUND_MESSAGE,
} from './auth.constant.js';
import type { AuthResponse, ExternalLoginInput } from './auth.type.js';
@Injectable()
export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}
  readonly to_user_response = (user: {
    id: string;
    role: string;
    status: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone_e164: string | null;
    avatar_url: string | null;
    last_known_latitude: {
      toNumber(): number;
    } | null;
    last_known_longitude: {
      toNumber(): number;
    } | null;
    driver_profile?: unknown;
    partner_application?: {
      status: string;
      activation_issued_at: Date | null;
    } | null;
  }) => ({
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
    partner_status: user.partner_application?.status ?? null,
    partner_activation_required:
      user.role !== 'DRIVER' &&
      user.partner_application?.status === 'COMPLETED' &&
      !!user.partner_application.activation_issued_at,
  });

  readonly issue_session = async (
    user: Parameters<AuthService['to_user_response']>[0],
    request_data: {
      user_agent?: string;
      ip_address?: string;
    },
  ): Promise<AuthResponse> => {
    const refresh_token = create_refresh_token();
    const refresh_token_hash = create_token_hash(refresh_token);
    const expires_at = new Date(
      Date.now() + config.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.authRepository.create_session(
      user.id,
      refresh_token_hash,
      expires_at,
      request_data.user_agent,
      request_data.ip_address,
    );
    const current_user = await this.authRepository.find_user_by_id(user.id);
    if (
      !current_user ||
      current_user.status !== 'ACTIVE' ||
      current_user.deleted_at
    )
      throw new AppError(403, 'USER_INACTIVE', 'This account is not active');
    return {
      access_token: create_access_token({
        user_id: current_user.id,
        role: current_user.role,
      }),
      refresh_token,
      user: this.to_user_response(current_user),
    };
  };

  readonly login_with_provider = async (
    provider: AuthProvider,
    input: ExternalLoginInput,
    request_data: {
      user_agent?: string;
      ip_address?: string;
    },
  ): Promise<AuthResponse> => {
    const user = await this.authRepository.resolve_external_user(
      provider,
      input,
    );
    if (user.status !== 'ACTIVE') {
      throw new AppError(403, 'USER_INACTIVE', 'This account is not active');
    }
    return this.issue_session(user, request_data);
  };

  readonly refresh_session = async (
    refresh_token: string,
    request_data: {
      user_agent?: string;
      ip_address?: string;
    },
  ): Promise<AuthResponse> => {
    const rotated = create_refresh_token();
    const user = await this.authRepository.rotate_mobile_session(
      create_token_hash(refresh_token),
      create_token_hash(rotated),
      request_data,
    );
    if (!user) {
      throw new AppError(401, 'INVALID_SESSION', INVALID_SESSION_MESSAGE);
    }
    return {
      access_token: create_access_token({ user_id: user.id, role: user.role }),
      refresh_token: rotated,
      user: this.to_user_response(user),
    };
  };

  readonly get_current_user = async (user_id: string) => {
    const user = await this.authRepository.find_user_by_id(user_id);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', USER_NOT_FOUND_MESSAGE);
    }
    return this.to_user_response(user);
  };

  readonly logout = async (refresh_token: string): Promise<void> => {
    const session = await this.authRepository.find_session(
      create_token_hash(refresh_token),
    );
    if (session && !session.family_id && !session.revoked_at) {
      await this.authRepository.revoke_session(session.id, session.user_id);
    }
  };
}

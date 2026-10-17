import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { AuthProvider, Prisma } from '@prisma/client';
import { create_user_log } from '../../infra/database/user_log.js';
import type { ExternalLoginInput } from './auth.type.js';
import { AppError } from '../../core/error.js';
import { require_active_account } from '../../infra/database/account_lifecycle.js';
import {
  AUTH_IDENTITY_CONFLICT_MESSAGE,
  AUTH_ACCOUNT_INACTIVE_MESSAGE,
} from './auth.constant.js';
@Injectable()
export class AuthRepository {
  constructor(private readonly prismaService: PrismaService) {}
  readonly find_user_by_id = async (user_id: string) =>
    this.prismaService.client.user.findUnique({
      where: { id: user_id },
      include: { driver_profile: true },
    });

  readonly resolve_external_user = async (
    provider: AuthProvider,
    input: ExternalLoginInput,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.provider_account_id}))`;
      const account = await tx.authAccount.findUnique({
        where: {
          provider_provider_account_id: {
            provider,
            provider_account_id: input.provider_account_id,
          },
        },
        include: { user: true },
      });
      let existing = account?.user ?? null;
      if (input.provider_email) {
        const email = input.provider_email.trim().toLowerCase();
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720047, hashtext(${email}))`;
        const email_owners = await tx.user.findMany({
          where: { email: { equals: email, mode: 'insensitive' } },
          take: 2,
        });
        if (email_owners.length > 1)
          throw new AppError(
            409,
            'IDENTITY_CONFLICT',
            AUTH_IDENTITY_CONFLICT_MESSAGE,
          );
        const email_owner = email_owners[0];
        if (existing && email_owner && existing.id !== email_owner.id)
          throw new AppError(
            409,
            'IDENTITY_CONFLICT',
            AUTH_IDENTITY_CONFLICT_MESSAGE,
          );
        if (!account && email_owner) {
          const linked = await tx.authAccount.findFirst({
            where: { user_id: email_owner.id, provider },
          });
          if (linked)
            throw new AppError(
              409,
              'IDENTITY_CONFLICT',
              AUTH_IDENTITY_CONFLICT_MESSAGE,
            );
          existing = email_owner;
        }
      }
      if (existing && (existing.status !== 'ACTIVE' || existing.deleted_at))
        throw new AppError(403, 'USER_INACTIVE', AUTH_ACCOUNT_INACTIVE_MESSAGE);
      const email = input.provider_email?.trim().toLowerCase();
      const data = account
        ? { email }
        : {
            first_name: existing?.first_name ?? input.first_name,
            last_name: existing?.last_name ?? input.last_name,
            email,
            avatar_url: existing?.avatar_url ?? input.avatar_url,
          };
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data,
            include: { driver_profile: true },
          })
        : await tx.user.create({ data, include: { driver_profile: true } });
      if (!account)
        await tx.authAccount.create({
          data: {
            user_id: user.id,
            provider,
            provider_account_id: input.provider_account_id,
            provider_email: input.provider_email,
          },
        });
      await create_user_log(tx, {
        actor_id: user.id,
        entity_type: 'User',
        entity_id: user.id,
        action: existing ? 'UPDATE_EXTERNAL_USER' : 'CREATE_EXTERNAL_USER',
        after_data: {
          provider,
          provider_account_id: input.provider_account_id,
        } as Prisma.InputJsonObject,
      });
      return user;
    });

  readonly create_session = async (
    user_id: string,
    refresh_token_hash: string,
    expires_at: Date,
    user_agent: string | undefined,
    ip_address: string | undefined,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      await require_active_account(tx, user_id);
      const session = await tx.session.create({
        data: {
          user_id,
          refresh_token_hash,
          expires_at,
          user_agent,
          ip_address,
        },
      });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'Session',
        entity_id: session.id,
        action: 'CREATE_SESSION',
      });
      await tx.user.update({
        where: { id: user_id },
        data: { last_login_at: new Date() },
      });
      return session;
    });

  readonly find_session = async (refresh_token_hash: string) =>
    this.prismaService.client.session.findUnique({
      where: { refresh_token_hash },
      include: { user: { include: { driver_profile: true } } },
    });

  readonly rotate_mobile_session = async (
    refresh_token_hash: string,
    next_token_hash: string,
    request_data: {
      user_agent?: string;
      ip_address?: string;
    },
  ) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        const session = await tx.session.findUnique({
          where: { refresh_token_hash },
          include: { user: { include: { driver_profile: true } } },
        });
        if (
          !session ||
          session.family_id ||
          session.revoked_at ||
          session.expires_at.getTime() <= Date.now() ||
          session.user.status !== 'ACTIVE' ||
          session.user.deleted_at
        )
          return null;
        // Serialize refresh against deactivation so a refresh cannot leave a
        // newly created, unrevoked session behind the deactivation transaction.
        await require_active_account(tx, session.user_id);
        const claimed = await tx.session.updateMany({
          where: {
            id: session.id,
            revoked_at: null,
            expires_at: { gt: new Date() },
          },
          data: { revoked_at: new Date() },
        });
        if (claimed.count !== 1) return null;
        const next = await tx.session.create({
          data: {
            user_id: session.user_id,
            refresh_token_hash: next_token_hash,
            expires_at: session.expires_at,
            user_agent: request_data.user_agent,
            ip_address: request_data.ip_address,
          },
        });
        await create_user_log(tx, {
          actor_id: session.user_id,
          entity_type: 'Session',
          entity_id: next.id,
          action: 'ROTATE_MOBILE_SESSION',
        });
        return session.user;
      },
      { maxWait: 10000, timeout: 15000 },
    );

  readonly revoke_session = async (session_id: string, actor_uid: string) =>
    this.prismaService.client.$transaction(async (tx) => {
      const session = await tx.session.update({
        where: { id: session_id },
        data: { revoked_at: new Date() },
      });
      await create_user_log(tx, {
        actor_id: actor_uid,
        entity_type: 'Session',
        entity_id: session_id,
        action: 'REVOKE_SESSION',
      });
      return session;
    });
}

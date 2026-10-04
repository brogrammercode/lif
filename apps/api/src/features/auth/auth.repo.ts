import type { AuthProvider, Prisma } from '@prisma/client';
import { prisma } from '../../infra/database/client.js';
import { create_user_log } from '../../infra/database/user_log.js';
import type { ExternalLoginInput } from './auth.type.js';

export const find_user_by_id = async (user_id: string) =>
  prisma.user.findUnique({
    where: { id: user_id },
    include: { driver_profile: true },
  });

export const find_account_with_user = async (provider: AuthProvider, provider_account_id: string) =>
  prisma.authAccount.findUnique({
    where: { provider_provider_account_id: { provider, provider_account_id } },
    include: { user: { include: { driver_profile: true } } },
  });

export const create_external_user = async (
  provider: AuthProvider,
  input: ExternalLoginInput,
  actor_uid: string,
) =>
  prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.provider_email,
        avatar_url: input.avatar_url,
      },
      include: { driver_profile: true },
    });
    await tx.authAccount.create({
      data: {
        user_id: user.id,
        provider,
        provider_account_id: input.provider_account_id,
        provider_email: input.provider_email,
      },
    });
    await create_user_log(tx, {
      actor_id: actor_uid || user.id,
      entity_type: 'User',
      entity_id: user.id,
      action: 'CREATE_EXTERNAL_USER',
      after_data: { provider, provider_account_id: input.provider_account_id } as Prisma.InputJsonObject,
    });
    return user;
  });

export const update_external_user = async (user_id: string, input: ExternalLoginInput, actor_uid: string) =>
  prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: user_id },
      data: {
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.provider_email,
        avatar_url: input.avatar_url,
      },
      include: { driver_profile: true },
    });
    await create_user_log(tx, {
      actor_id: actor_uid,
      entity_type: 'User',
      entity_id: user_id,
      action: 'UPDATE_EXTERNAL_USER',
      after_data: { provider_account_id: input.provider_account_id } as Prisma.InputJsonObject,
    });
    return user;
  });

export const create_session = async (
  user_id: string,
  refresh_token_hash: string,
  expires_at: Date,
  user_agent: string | undefined,
  ip_address: string | undefined,
) =>
  prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: { user_id, refresh_token_hash, expires_at, user_agent, ip_address },
    });
    await create_user_log(tx, {
      actor_id: user_id,
      entity_type: 'Session',
      entity_id: session.id,
      action: 'CREATE_SESSION',
    });
    return session;
  });

export const find_session = async (refresh_token_hash: string) =>
  prisma.session.findUnique({
    where: { refresh_token_hash },
    include: { user: { include: { driver_profile: true } } },
  });

export const revoke_session = async (session_id: string, actor_uid: string) =>
  prisma.$transaction(async (tx) => {
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

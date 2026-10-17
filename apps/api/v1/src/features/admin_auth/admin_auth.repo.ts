import { randomUUID } from 'node:crypto';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { prisma } from '../../infra/database/client.js';
import { create_user_log } from '../../infra/database/user_log.js';
import {
  create_refresh_token,
  create_token_hash,
} from '../../infra/security/hash.js';
import { create_access_token } from '../../infra/security/token.js';
import type { AdminIdentity, SessionRequest } from './admin_auth.type.js';
import { ADMIN_AUTH_MESSAGES } from './admin_auth.constant.js';

const admin_user = (user: {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
}) => ({
  id: user.id,
  first_name: user.first_name,
  last_name: user.last_name,
  email: user.email,
  avatar_url: user.avatar_url,
  role: user.role,
});

export const create_admin_session = async (
  identity: AdminIdentity,
  request_data: SessionRequest,
) => {
  const token = create_refresh_token();
  const family_id = randomUUID();
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.provider_account_id}))`;
      if (identity.provider_email)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720047, hashtext(${identity.provider_email.trim().toLowerCase()}))`;
      const account = await tx.authAccount.findUnique({
        where: {
          provider_provider_account_id: {
            provider: 'GOOGLE',
            provider_account_id: identity.provider_account_id,
          },
        },
        include: { user: true },
      });
      const user =
        account?.user ??
        (identity.provider_email
          ? await tx.user.findFirst({
              where: {
                email: { equals: identity.provider_email, mode: 'insensitive' },
                role: 'ADMIN',
                status: 'ACTIVE',
              },
            })
          : null);
      if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE')
        throw new AppError(
          403,
          'ADMIN_ACCESS_DENIED',
          ADMIN_AUTH_MESSAGES.DENIED,
        );
      if (!account) {
        const linked = await tx.authAccount.findFirst({
          where: { user_id: user.id, provider: 'GOOGLE' },
        });
        if (linked)
          throw new AppError(
            403,
            'ADMIN_ACCESS_DENIED',
            ADMIN_AUTH_MESSAGES.DENIED,
          );
        await tx.authAccount.create({
          data: {
            user_id: user.id,
            provider: 'GOOGLE',
            provider_account_id: identity.provider_account_id,
            provider_email: identity.provider_email,
          },
        });
      }
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          first_name: identity.first_name,
          last_name: identity.last_name,
          avatar_url: identity.avatar_url,
        },
      });
      const session = await tx.session.create({
        data: {
          user_id: user.id,
          refresh_token_hash: create_token_hash(token),
          family_id,
          expires_at: new Date(
            Date.now() + config.REFRESH_TOKEN_DAYS * 86_400_000,
          ),
          user_agent: `[admin] ${request_data.user_agent ?? ''}`,
          ip_address: request_data.ip_address,
        },
      });
      await create_user_log(tx, {
        actor_id: user.id,
        entity_type: 'Session',
        entity_id: session.id,
        action: 'ADMIN_SIGN_IN',
      });
      return {
        access_token: create_access_token({
          user_id: user.id,
          role: user.role,
          session_family_id: family_id,
        }),
        refresh_token: token,
        expires_at: session.expires_at,
        user: admin_user(updated),
      };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
};

export const rotate_admin_session = async (
  token: string,
  request_data: SessionRequest,
) => {
  const rotated = create_refresh_token();
  return prisma.$transaction(
    async (tx) => {
      const initial = await tx.session.findUnique({
        where: { refresh_token_hash: create_token_hash(token) },
        select: { family_id: true },
      });
      if (!initial?.family_id)
        throw new AppError(401, 'INVALID_SESSION', ADMIN_AUTH_MESSAGES.EXPIRED);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${initial.family_id}))`;
      const session = await tx.session.findUnique({
        where: { refresh_token_hash: create_token_hash(token) },
        include: { user: true },
      });
      if (
        !session ||
        !session.family_id ||
        session.revoked_at ||
        session.expires_at.getTime() <= Date.now() ||
        session.user.role !== 'ADMIN' ||
        session.user.status !== 'ACTIVE'
      )
        throw new AppError(401, 'INVALID_SESSION', ADMIN_AUTH_MESSAGES.EXPIRED);
      const revoked = await tx.session.updateMany({
        where: {
          id: session.id,
          revoked_at: null,
          expires_at: { gt: new Date() },
        },
        data: { revoked_at: new Date() },
      });
      if (revoked.count !== 1)
        throw new AppError(401, 'INVALID_SESSION', ADMIN_AUTH_MESSAGES.EXPIRED);
      const next = await tx.session.create({
        data: {
          user_id: session.user_id,
          refresh_token_hash: create_token_hash(rotated),
          family_id: session.family_id,
          expires_at: session.expires_at,
          user_agent: `[admin] ${request_data.user_agent ?? ''}`,
          ip_address: request_data.ip_address,
        },
      });
      await create_user_log(tx, {
        actor_id: session.user_id,
        entity_type: 'Session',
        entity_id: next.id,
        action: 'ADMIN_REFRESH_SESSION',
      });
      return {
        access_token: create_access_token({
          user_id: session.user_id,
          role: session.user.role,
          session_family_id: session.family_id,
        }),
        refresh_token: rotated,
        expires_at: session.expires_at,
        user: admin_user(session.user),
      };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
};

export const revoke_admin_session = async (token: string) =>
  prisma.$transaction(
    async (tx) => {
      const session = await tx.session.findUnique({
        where: { refresh_token_hash: create_token_hash(token) },
      });
      if (session && session.family_id) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.family_id}))`;
        await tx.session.updateMany({
          where: {
            family_id: session.family_id,
            user_id: session.user_id,
            revoked_at: null,
          },
          data: { revoked_at: new Date() },
        });
        await create_user_log(tx, {
          actor_id: session.user_id,
          entity_type: 'Session',
          entity_id: session.id,
          action: 'ADMIN_SIGN_OUT',
        });
      }
    },
    { maxWait: 10_000, timeout: 10_000 },
  );

export const find_current_admin = async (id: string) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE')
    throw new AppError(403, 'ADMIN_ACCESS_DENIED', ADMIN_AUTH_MESSAGES.DENIED);
  return admin_user(user);
};

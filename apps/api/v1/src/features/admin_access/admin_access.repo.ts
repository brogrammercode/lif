import { Prisma } from '@prisma/client';
import { prisma } from '../../infra/database/client.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import { ADMIN_AUTH_MESSAGES } from '../admin_auth/admin_auth.constant.js';
import {
  ADMIN_ACCESS_LOCK,
  ADMIN_ACCESS_MESSAGES,
  ADMIN_ACCESS_TRANSACTION,
} from './admin_access.constant.js';
import type {
  AccessListInput,
  GrantAccessInput,
  RevokeAccessInput,
} from './admin_access.type.js';

const identity_select = {
  id: true,
  first_name: true,
  last_name: true,
  email: true,
  avatar_url: true,
} satisfies Prisma.UserSelect;
const access_select = {
  ...identity_select,
  role: true,
  status: true,
  updated_at: true,
  auth_accounts: { where: { provider: 'GOOGLE' }, select: { id: true } },
  admin_access: {
    select: {
      granted_at: true,
      revoked_at: true,
      granted_by: { select: identity_select },
    },
  },
} satisfies Prisma.UserSelect;
export type AccessUserRecord = Prisma.UserGetPayload<{
  select: typeof access_select;
}>;
const visible_admin = {
  role: 'ADMIN',
  deleted_at: null,
  status: { not: 'DELETED' },
} satisfies Prisma.UserWhereInput;

export const list_access = (input: AccessListInput) =>
  prisma.$transaction(
    async (tx) => {
      const where: Prisma.UserWhereInput = {
        ...visible_admin,
        ...(input.status !== 'all' ? { status: input.status } : {}),
        ...(input.query
          ? {
              AND: input.query.split(/\s+/).map((term) => ({
                OR: ['id', 'first_name', 'last_name', 'email'].map((field) => ({
                  [field]: { contains: term, mode: 'insensitive' },
                })),
              })),
            }
          : {}),
      };
      const total = await tx.user.count({ where });
      const page = Math.min(
        input.page,
        Math.max(1, Math.ceil(total / input.page_size)),
      );
      const users = await tx.user.findMany({
        where,
        select: access_select,
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * input.page_size,
        take: input.page_size,
      });
      const counts = await tx.user.groupBy({
        by: ['status'],
        where: visible_admin,
        _count: { _all: true },
      });
      const awaiting_sign_in = await tx.user.count({
        where: {
          ...visible_admin,
          status: 'ACTIVE',
          auth_accounts: { none: { provider: 'GOOGLE' } },
        },
      });
      return {
        users,
        total,
        page,
        page_size: input.page_size,
        stats: {
          total_admins: counts.reduce(
            (sum, group) => sum + group._count._all,
            0,
          ),
          active_admins:
            counts.find((group) => group.status === 'ACTIVE')?._count._all ?? 0,
          awaiting_sign_in,
        },
      };
    },
    {
      ...ADMIN_ACCESS_TRANSACTION,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    },
  );

export const grant_access = (actor_id: string, input: GrantAccessInput) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_ACCESS_LOCK})`;
    const actor = await tx.user.findUnique({
      where: { id: actor_id },
      select: { role: true, status: true, deleted_at: true },
    });
    if (
      !actor ||
      actor.role !== 'ADMIN' ||
      actor.status !== 'ACTIVE' ||
      actor.deleted_at
    )
      throw new AppError(
        403,
        'ADMIN_ACCESS_DENIED',
        ADMIN_AUTH_MESSAGES.DENIED,
      );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(720047, hashtext(${input.email}))`;
    const matches = await tx.user.findMany({
      where: { email: { equals: input.email, mode: 'insensitive' } },
      take: 2,
    });
    if (matches.length > 1)
      throw new AppError(
        409,
        'ADMIN_EMAIL_AMBIGUOUS',
        ADMIN_ACCESS_MESSAGES.AMBIGUOUS,
      );
    const existing = matches[0];
    if (existing && (existing.status !== 'ACTIVE' || existing.deleted_at))
      throw new AppError(
        409,
        'ADMIN_ACCOUNT_INACTIVE',
        ADMIN_ACCESS_MESSAGES.INACTIVE,
      );
    if (existing?.role === 'ADMIN')
      return {
        changed: false,
        user: await tx.user.findUniqueOrThrow({
          where: { id: existing.id },
          select: access_select,
        }),
      };
    const previous_role = existing?.role ?? 'RIDER';
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { role: 'ADMIN' },
        })
      : await tx.user.create({ data: { email: input.email, role: 'ADMIN' } });
    const record = await tx.adminAccess.findUnique({
      where: { user_id: user.id },
      select: { id: true },
    });
    const data = {
      previous_role,
      granted_by_id: actor_id,
      granted_at: new Date(),
      revoked_at: null,
      revoked_by_id: null,
    };
    if (record) await tx.adminAccess.update({ where: { id: record.id }, data });
    else await tx.adminAccess.create({ data: { ...data, user_id: user.id } });
    await tx.session.updateMany({
      where: { user_id: user.id, family_id: { not: null }, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    await create_user_log(tx, {
      actor_id,
      entity_type: 'User',
      entity_id: user.id,
      action: 'GRANT_ADMIN_ACCESS',
      before_data: { role: previous_role, account_existed: Boolean(existing) },
      after_data: { role: 'ADMIN', email: user.email },
    });
    return {
      changed: true,
      user: await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: access_select,
      }),
    };
  }, ADMIN_ACCESS_TRANSACTION);

export const revoke_access = (
  actor_id: string,
  user_id: string,
  input: RevokeAccessInput,
) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_ACCESS_LOCK})`;
    const actor = await tx.user.findUnique({
      where: { id: actor_id },
      select: { role: true, status: true, deleted_at: true },
    });
    if (
      !actor ||
      actor.role !== 'ADMIN' ||
      actor.status !== 'ACTIVE' ||
      actor.deleted_at
    )
      throw new AppError(
        403,
        'ADMIN_ACCESS_DENIED',
        ADMIN_AUTH_MESSAGES.DENIED,
      );
    if (actor_id === user_id)
      throw new AppError(
        409,
        'ADMIN_SELF_REVOKE',
        ADMIN_ACCESS_MESSAGES.SELF_REVOKE,
      );
    const user = await tx.user.findFirst({
      where: { id: user_id, deleted_at: null, status: { not: 'DELETED' } },
      include: { admin_access: true, driver_profile: { select: { id: true } } },
    });
    if (!user)
      throw new AppError(
        404,
        'ADMIN_ACCOUNT_NOT_FOUND',
        ADMIN_ACCESS_MESSAGES.NOT_FOUND,
      );
    if (user.role !== 'ADMIN')
      return { changed: false, id: user.id, role: user.role };
    if (
      user.status === 'ACTIVE' &&
      (await tx.user.count({
        where: { role: 'ADMIN', status: 'ACTIVE', deleted_at: null },
      })) <= 1
    )
      throw new AppError(
        409,
        'ADMIN_LAST_ACTIVE',
        ADMIN_ACCESS_MESSAGES.LAST_ADMIN,
      );
    const previous = user.admin_access?.previous_role;
    const role =
      previous &&
      previous !== 'ADMIN' &&
      !(previous === 'RIDER' && user.driver_profile)
        ? previous
        : user.driver_profile
          ? 'DRIVER'
          : 'RIDER';
    const changed = await tx.user.updateMany({
      where: {
        id: user_id,
        role: 'ADMIN',
        updated_at: new Date(input.expected_updated_at),
      },
      data: { role },
    });
    if (changed.count !== 1)
      throw new AppError(
        409,
        'ADMIN_ACCESS_CONFLICT',
        ADMIN_ACCESS_MESSAGES.CONFLICT,
      );
    await tx.adminAccess.updateMany({
      where: { user_id, revoked_at: null },
      data: { revoked_at: new Date(), revoked_by_id: actor_id },
    });
    await tx.session.updateMany({
      where: { user_id, family_id: { not: null }, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    await create_user_log(tx, {
      actor_id,
      entity_type: 'User',
      entity_id: user_id,
      action: 'REVOKE_ADMIN_ACCESS',
      before_data: { role: 'ADMIN', email: user.email },
      after_data: { role },
    });
    return { changed: true, id: user_id, role };
  }, ADMIN_ACCESS_TRANSACTION);

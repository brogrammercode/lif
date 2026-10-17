import { Prisma } from '@prisma/client';
import { AppError } from '../../core/error.js';
import { prisma } from '../../infra/database/client.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { ADMIN_USER_MESSAGES } from './admin_user.constant.js';
import type { PersonalUpdateInput, UserListInput } from './admin_user.type.js';

const visible_user = { deleted_at: null, status: { not: 'DELETED' as const } };
const summary_select = {
  id: true,
  first_name: true,
  last_name: true,
  email: true,
  avatar_url: true,
  role: true,
  status: true,
} satisfies Prisma.UserSelect;
const detail_select = {
  ...summary_select,
  phone_e164: true,
  last_known_latitude: true,
  last_known_longitude: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.UserSelect;

export const list_admin_users = async (input: UserListInput) => {
  const where: Prisma.UserWhereInput = {
    ...visible_user,
    ...(input.query
      ? {
          AND: input.query.split(/\s+/).map((term) => ({
            OR: ['id', 'first_name', 'last_name', 'email', 'phone_e164'].map(
              (field) => ({
                [field]: { contains: term, mode: 'insensitive' },
              }),
            ),
          })),
        }
      : {}),
  };
  return prisma.$transaction(
    async (tx) => {
      const total = await tx.user.count({ where });
      const page = Math.min(
        input.page,
        Math.max(1, Math.ceil(total / input.page_size)),
      );
      const users = await tx.user.findMany({
        where,
        select: summary_select,
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * input.page_size,
        take: input.page_size,
      });
      return { users, total, page, page_size: input.page_size };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
};

export const find_admin_user = (id: string) =>
  prisma.user.findFirst({
    where: { id, ...visible_user },
    select: detail_select,
  });

export const update_admin_user = (
  actor_id: string,
  id: string,
  input: PersonalUpdateInput,
) =>
  prisma.$transaction(async (tx) => {
    const before = await tx.user.findFirst({
      where: { id, ...visible_user },
      select: detail_select,
    });
    if (!before)
      throw new AppError(404, 'USER_NOT_FOUND', ADMIN_USER_MESSAGES.NOT_FOUND);
    const {
      expected_updated_at,
      first_name,
      last_name,
      phone_e164,
      avatar_url,
    } = input;
    const updated = await tx.user.updateMany({
      where: { id, ...visible_user, updated_at: new Date(expected_updated_at) },
      data: {
        first_name,
        last_name: last_name || null,
        phone_e164,
        avatar_url,
      },
    });
    if (updated.count !== 1)
      throw new AppError(409, 'USER_CONFLICT', ADMIN_USER_MESSAGES.CONFLICT);
    const user = await tx.user.findUniqueOrThrow({
      where: { id },
      select: detail_select,
    });
    const personal = (value: typeof user) => ({
      first_name: value.first_name,
      last_name: value.last_name,
      phone_e164: value.phone_e164,
      avatar_url: value.avatar_url,
    });
    await create_user_log(tx, {
      actor_id,
      entity_type: 'User',
      entity_id: id,
      action: 'ADMIN_UPDATE_PERSONAL_DETAILS',
      before_data: personal(before),
      after_data: personal(user),
    });
    return user;
  });

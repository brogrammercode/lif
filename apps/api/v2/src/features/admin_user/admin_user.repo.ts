import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { Prisma } from '@prisma/client';
import { AppError } from '../../core/error.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { ADMIN_USER_MESSAGES } from './admin_user.constant.js';
import type { PersonalUpdateInput, UserListInput } from './admin_user.type.js';
@Injectable()
export class AdminUserRepository {
  constructor(private readonly prismaService: PrismaService) {}
  readonly visible_user = {
    deleted_at: null,
    status: { not: 'DELETED' as const },
  };

  readonly summary_select = {
    id: true,
    first_name: true,
    last_name: true,
    email: true,
    avatar_url: true,
    role: true,
    status: true,
  } satisfies Prisma.UserSelect;

  readonly detail_select = {
    ...this.summary_select,
    phone_e164: true,
    last_known_latitude: true,
    last_known_longitude: true,
    created_at: true,
    updated_at: true,
  } satisfies Prisma.UserSelect;

  readonly list_admin_users = async (input: UserListInput) => {
    const where: Prisma.UserWhereInput = {
      ...this.visible_user,
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
    return this.prismaService.client.$transaction(
      async (tx) => {
        const total = await tx.user.count({ where });
        const page = Math.min(
          input.page,
          Math.max(1, Math.ceil(total / input.page_size)),
        );
        const users = await tx.user.findMany({
          where,
          select: this.summary_select,
          orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
          skip: (page - 1) * input.page_size,
          take: input.page_size,
        });
        return { users, total, page, page_size: input.page_size };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  };

  readonly find_admin_user = (id: string) =>
    this.prismaService.client.user.findFirst({
      where: { id, ...this.visible_user },
      select: this.detail_select,
    });

  readonly update_admin_user = (
    actor_id: string,
    id: string,
    input: PersonalUpdateInput,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      const before = await tx.user.findFirst({
        where: { id, ...this.visible_user },
        select: this.detail_select,
      });
      if (!before)
        throw new AppError(
          404,
          'USER_NOT_FOUND',
          ADMIN_USER_MESSAGES.NOT_FOUND,
        );
      const {
        expected_updated_at,
        first_name,
        last_name,
        phone_e164,
        avatar_url,
      } = input;
      const updated = await tx.user.updateMany({
        where: {
          id,
          ...this.visible_user,
          updated_at: new Date(expected_updated_at),
        },
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
        select: this.detail_select,
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
}

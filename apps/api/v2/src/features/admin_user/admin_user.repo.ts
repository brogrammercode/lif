import { pending_vehicle_where } from '../admin_pending/pending.rules.js';
import { Injectable } from '@nestjs/common';
import {
  account_is_driver,
  admin_ride_select,
  rides_status_filter,
  rides_query,
} from './admin_user.rides.js';
import type { z } from 'zod';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { Prisma } from '@prisma/client';
import { AppError } from '../../core/error.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { ADMIN_USER_MESSAGES } from './admin_user.constant.js';
import type { PersonalUpdateInput, UserListInput } from './admin_user.type.js';
import { ADMIN_ACCESS_LOCK } from '../admin_access/admin_access.constant.js';
import {
  ACCOUNT_LIFECYCLE_LOCK,
  require_active_admin,
} from '../../infra/database/account_lifecycle.js';
@Injectable()
export class AdminUserRepository {
  constructor(private readonly prismaService: PrismaService) {}
  async rides(id: string, input: z.infer<typeof rides_query>) {
    return this.prismaService.client.$transaction(
      async (tx) => {
        const user = await tx.user.findFirst({
          where: { id, ...this.visible_user },
          select: this.summary_select,
        });
        if (!user)
          throw new AppError(
            404,
            'USER_NOT_FOUND',
            ADMIN_USER_MESSAGES.NOT_FOUND,
          );
        const driver = account_is_driver(user);
        const where: Prisma.RideWhereInput = {
          ...(driver ? { driver: { user_id: id } } : { rider_id: id }),
          ...rides_status_filter(input.status),
          // Draft quote attempts are not booked rides.
          AND: [
            { status: { not: 'DRAFT' } },
            {
              OR: [
                { status: { not: 'EXPIRED' } },
                { requested_at: { not: null } },
              ],
            },
          ],
        };
        const page_size = 20;
        const total = await tx.ride.count({ where });
        const page = Math.min(
          input.page,
          Math.max(1, Math.ceil(total / page_size)),
        );
        const items = await tx.ride.findMany({
          where,
          select: admin_ride_select,
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * page_size,
          take: page_size,
        });
        return {
          user,
          role: driver ? 'driver' : 'rider',
          items,
          total,
          page,
          page_size,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  readonly deactivate_user = (
    actor_id: string,
    id: string,
    input: { expected_updated_at: string; confirmation: string },
  ) =>
    this.prismaService.client.$transaction(
      async (tx) => {
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
            'Administrator access is required.',
          );
        if (id === actor_id)
          throw new AppError(
            409,
            'SELF_DEACTIVATION',
            'You cannot deactivate your own account.',
          );
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ACCOUNT_LIFECYCLE_LOCK}::integer, hashtext(${id}))`;
        const user = await tx.user.findUnique({
          where: { id },
          include: { driver_profile: true, admin_access: true },
        });
        if (!user)
          throw new AppError(404, 'USER_NOT_FOUND', 'This user was not found.');
        if (
          input.confirmation.trim().toLowerCase() !==
          (user.email ?? user.id).toLowerCase()
        )
          throw new AppError(
            422,
            'CONFIRMATION_REQUIRED',
            'Enter the displayed email or user ID to confirm deactivation.',
          );
        if (user.deleted_at || user.status === 'DELETED')
          return { id, changed: false };
        if (
          user.role === 'ADMIN' &&
          user.status === 'ACTIVE' &&
          (await tx.user.count({
            where: { role: 'ADMIN', status: 'ACTIVE', deleted_at: null },
          })) <= 1
        )
          throw new AppError(
            409,
            'LAST_ADMIN',
            'Keep at least one active administrator.',
          );
        if (user.driver_profile)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${id}))`;
        const active = await tx.ride.count({
          where: {
            OR: [
              { rider_id: id },
              ...(user.driver_profile
                ? [{ driver_id: user.driver_profile.id }]
                : []),
            ],
            status: {
              in: [
                'REQUESTED',
                'SEARCHING',
                'DRIVER_ASSIGNED',
                'DRIVER_ARRIVING',
                'DRIVER_WAITING',
                'IN_PROGRESS',
              ],
            },
          },
        });
        if (active)
          throw new AppError(
            409,
            'USER_HAS_ACTIVE_RIDE',
            'Finish or cancel this user’s active rides before deactivating the account.',
          );
        const now = new Date();
        const role =
          user.role === 'ADMIN'
            ? (user.admin_access?.previous_role ??
              (user.driver_profile ? 'DRIVER' : 'RIDER'))
            : user.role;
        const updated = await tx.user.updateMany({
          where: { id, updated_at: new Date(input.expected_updated_at) },
          data: { status: 'DELETED', deleted_at: now, role },
        });
        if (updated.count !== 1)
          throw new AppError(
            409,
            'USER_CONFLICT',
            'This user changed. Reload their details before deactivating.',
          );
        await tx.session.updateMany({
          where: { user_id: id, revoked_at: null },
          data: { revoked_at: now },
        });
        await tx.device.updateMany({
          where: { user_id: id, revoked_at: null },
          data: { revoked_at: now },
        });
        await tx.adminAccess.updateMany({
          where: { user_id: id, revoked_at: null },
          data: { revoked_at: now, revoked_by_id: actor_id },
        });
        await tx.ride.updateMany({
          where: { rider_id: id, status: 'DRAFT' },
          data: { status: 'EXPIRED' },
        });
        if (user.driver_profile) {
          await tx.driverProfile.update({
            where: { id: user.driver_profile.id },
            data: { availability: 'OFFLINE' },
          });
          await tx.rideOffer.updateMany({
            where: { driver_id: user.driver_profile.id, status: 'SENT' },
            data: { status: 'CANCELLED', responded_at: now },
          });
        }
        await create_user_log(tx, {
          actor_id,
          entity_type: 'User',
          entity_id: id,
          action: 'ADMIN_DEACTIVATE_USER',
          before_data: { role: user.role, status: user.status },
          after_data: { role, status: 'DELETED', history_retained: true },
        });
        return { id, changed: true };
      },
      { maxWait: 10000, timeout: 30000 },
    );
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
    partner_activated_at: true,
    status: true,
  } satisfies Prisma.UserSelect;

  readonly detail_select = {
    ...this.summary_select,
    phone_e164: true,
    last_known_latitude: true,
    last_known_longitude: true,
    created_at: true,
    updated_at: true,
    last_login_at: true,
    last_admin_login_at: true,
  } satisfies Prisma.UserSelect;

  readonly list_admin_users = async (input: UserListInput) => {
    const where: Prisma.UserWhereInput = {
      ...this.visible_user,
      ...(input.pending_only === 'true'
        ? {
            status: 'ACTIVE' as const,
            NOT: { partner_application: { status: 'EXITED' as const } },
            driver_profile: { vehicles: { some: pending_vehicle_where } },
            OR: [
              { role: 'DRIVER' as const },
              { partner_activated_at: { not: null } },
            ],
          }
        : {}),
      ...(input.account_type === 'driver'
        ? {
            OR: [
              { role: 'DRIVER' as const },
              { partner_activated_at: { not: null } },
            ],
          }
        : input.account_type === 'user'
          ? { role: { not: 'DRIVER' as const }, partner_activated_at: null }
          : {}),
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
      await require_active_admin(tx, actor_id);
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

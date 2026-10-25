import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../../core/error.js';
import { require_active_admin } from '../../infra/database/account_lifecycle.js';
import {
  category_fare_data,
  category_fare_values,
} from '../app_configuration/fare_calculation.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { CATEGORY_MESSAGES } from './vehicle_category.constant.js';
import type {
  CategoryInput,
  CategoryUpdateInput,
} from './vehicle_category.type.js';
@Injectable()
export class VehicleCategoryRepository {
  constructor(private readonly prismaService: PrismaService) {}
  readonly CATEGORY_INCLUDE = {
    parent: true,
    _count: { select: { children: true, vehicles: true, quotes: true } },
  } as const;

  readonly list_categories = (active_only = false) =>
    this.prismaService.client.vehicleCategory.findMany({
      where: active_only
        ? {
            is_active: true,
            OR: [{ parent_id: null }, { parent: { is_active: true } }],
          }
        : {},
      include: this.CATEGORY_INCLUDE,
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });

  readonly list_category_choices = () =>
    this.prismaService.client.vehicleCategory.findMany({
      where: {
        is_active: true,
        children: { none: {} },
        OR: [{ parent_id: null }, { parent: { is_active: true } }],
      },
      include: { parent: true },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });

  readonly write_category = async (
    actor_id: string,
    input: CategoryInput | CategoryUpdateInput,
    id?: string,
  ) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        await require_active_admin(tx, actor_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720041)`;
        const before = id
          ? await tx.vehicleCategory.findUnique({
              where: { id },
              include: this.CATEGORY_INCLUDE,
            })
          : null;
        if (id && !before)
          throw new AppError(
            404,
            'CATEGORY_NOT_FOUND',
            CATEGORY_MESSAGES.NOT_FOUND,
          );
        if (
          before &&
          'expected_updated_at' in input &&
          before.updated_at.getTime() !==
            new Date(input.expected_updated_at).getTime()
        ) {
          throw new AppError(
            409,
            'CATEGORY_CONFLICT',
            CATEGORY_MESSAGES.CONFLICT,
          );
        }
        if (
          before &&
          (before._count.vehicles > 0 || before._count.quotes > 0) &&
          input.vehicle_type !== before.vehicle_type
        ) {
          throw new AppError(
            409,
            'CATEGORY_IN_USE',
            CATEGORY_MESSAGES.TYPE_LOCKED,
          );
        }
        if (
          before &&
          input.capacity > before.capacity &&
          (await tx.vehicle.count({
            where: {
              vehicle_category_id: before.id,
              capacity: { lt: input.capacity },
            },
          })) > 0
        ) {
          throw new AppError(
            409,
            'CATEGORY_IN_USE',
            'Passenger seats cannot exceed the capacity of vehicles already registered in this category.',
          );
        }
        if (input.parent_id) {
          const parent = await tx.vehicleCategory.findUnique({
            where: { id: input.parent_id },
            include: this.CATEGORY_INCLUDE,
          });
          if (
            !parent ||
            parent.parent_id ||
            parent.id === id ||
            (before && before._count.children > 0)
          ) {
            throw new AppError(
              422,
              'CATEGORY_PARENT_INVALID',
              CATEGORY_MESSAGES.PARENT,
            );
          }
          if (parent._count.vehicles > 0)
            throw new AppError(
              409,
              'CATEGORY_IN_USE',
              CATEGORY_MESSAGES.USED_PARENT,
            );
        }
        const data = {
          name: input.name,
          description: input.description || null,
          image_url: input.image_url || null,
          parent_id: input.parent_id,
          vehicle_type: input.vehicle_type,
          capacity: input.capacity,
          base_fare: input.base_fare,
          per_kilometer: input.per_kilometer,
          per_minute: input.per_minute,
          ...(input.fare_policy !== undefined
            ? category_fare_data(input.fare_policy)
            : {}),
          is_active: input.is_active,
          sort_order: input.sort_order,
          // Bulk fare edits use the same monotonic revision rule. Preserve it
          // across both editors even when server clocks differ or writes share a millisecond.
          updated_at: before
            ? new Date(Math.max(Date.now(), before.updated_at.getTime() + 1))
            : undefined,
        };
        const category = id
          ? await tx.vehicleCategory.update({
              where: { id },
              data,
              include: this.CATEGORY_INCLUDE,
            })
          : await tx.vehicleCategory.create({
              data: {
                ...data,
                base_fare: input.base_fare ?? 0,
                per_kilometer: input.per_kilometer ?? 0,
                per_minute: input.per_minute ?? 0,
                code: `CAT-${randomBytes(5).toString('hex').toUpperCase()}`,
              },
              include: this.CATEGORY_INCLUDE,
            });
        await create_user_log(tx, {
          actor_id,
          entity_type: 'VehicleCategory',
          entity_id: category.id,
          action: id ? 'UPDATE_VEHICLE_CATEGORY' : 'CREATE_VEHICLE_CATEGORY',
          before_data: before
            ? (JSON.parse(JSON.stringify(before)) as Prisma.InputJsonObject)
            : undefined,
          after_data: JSON.parse(
            JSON.stringify(category),
          ) as Prisma.InputJsonObject,
        });
        return category;
      },
      { maxWait: 10000, timeout: 15000 },
    );

  readonly category_response = (
    category: Awaited<
      ReturnType<VehicleCategoryRepository['list_categories']>
    >[number],
  ) => ({
    ...category,
    base_fare: category.base_fare.toNumber(),
    per_kilometer: category.per_kilometer.toNumber(),
    per_minute: category.per_minute.toNumber(),
    fare_policy: category_fare_values(category),
    parent_name: category.parent?.name ?? null,
    effective_active:
      category.is_active && (category.parent?.is_active ?? true),
    is_selectable:
      category.is_active &&
      (category.parent?.is_active ?? true) &&
      category._count.children === 0,
  });
}

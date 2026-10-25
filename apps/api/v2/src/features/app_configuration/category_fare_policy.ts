import { Prisma, type RideFarePolicy } from '@prisma/client';
import type { PrismaService } from '../../infra/database/prisma.service.js';
import { require_active_admin } from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import {
  category_fare_data,
  category_fare_values,
} from './fare_calculation.js';
import {
  CONFIGURATION_KEY,
  FARE_POLICY_LOCK,
  fare_policy_input,
  type FarePolicyInput,
} from './app_configuration.type.js';

type Category = Prisma.VehicleCategoryGetPayload<{
  include: { parent: true; _count: { select: { children: true } } };
}>;
const category_query = {
  include: { parent: true, _count: { select: { children: true } } },
  orderBy: [{ sort_order: 'asc' }, { name: 'asc' }, { id: 'asc' }],
} satisfies Prisma.VehicleCategoryFindManyArgs;
export const payment_policy = (policy: RideFarePolicy | null) => ({
  arrival_radius_m: policy?.arrival_radius_m ?? 150,
  location_max_age_s: policy?.location_max_age_s ?? 60,
  matching_initial_radius_km: policy?.matching_initial_radius_km ?? 1,
  matching_max_radius_km: policy?.matching_max_radius_km ?? 10,
  matching_expansion_s: policy?.matching_expansion_s ?? 30,
  search_timeout_s: policy?.search_timeout_s ?? 180,
  offer_lifetime_s: policy?.offer_lifetime_s ?? 45,
  cash_enabled: policy?.cash_enabled ?? true,
  direct_upi_enabled: policy?.direct_upi_enabled ?? true,
  online_payment_enabled: false as const,
  commission_percent: 0 as const,
  free_cancellation_minutes: policy?.free_cancellation_minutes ?? 2,
  free_pickup_wait_minutes: policy?.free_pickup_wait_minutes ?? 5,
  cancellation_fee_percent: policy?.cancellation_fee_percent.toNumber() ?? 10,
  maximum_cancellation_fee: policy?.maximum_cancellation_fee.toNumber() ?? 100,
});
export async function fare_snapshot(db: PrismaService) {
  const policy = await db.client.rideFarePolicy.findUnique({
    where: { key: CONFIGURATION_KEY },
  });
  if (
    policy &&
    !fare_policy_input.safeParse({
      expected_version: policy.version,
      ...payment_policy(policy),
      rates: [],
      online_payment_enabled: policy.online_payment_enabled,
      commission_percent: policy.commission_percent.toNumber(),
    }).success
  )
    throw new AppError(
      409,
      'FARE_POLICY_NOT_CONFIGURED',
      'Your administrator must configure a supported Fare Policy before rides can be quoted.',
    );
  return {
    ...payment_policy(policy),
    version: policy?.version ?? 0,
    commission_percent: new Prisma.Decimal(0),
    cancellation_fee_percent:
      policy?.cancellation_fee_percent ?? new Prisma.Decimal(10),
    maximum_cancellation_fee:
      policy?.maximum_cancellation_fee ?? new Prisma.Decimal(100),
  };
}
async function present(
  db: PrismaService,
  policy: RideFarePolicy | null,
  categories: Category[],
) {
  const updated_by = policy
    ? await db.client.user.findUnique({
        where: { id: policy.updated_by_id },
        select: { id: true, first_name: true, last_name: true },
      })
    : null;
  return {
    version: policy?.version ?? 0,
    updated_at: policy?.updated_at ?? null,
    updated_by,
    ...payment_policy(policy),
    rates: categories.map((category) => ({
      category_id: category.id,
      name: category.name,
      image_url: category.image_url,
      parent_name: category.parent?.name ?? null,
      vehicle_type: category.vehicle_type,
      is_active: category.is_active,
      is_selectable:
        category.is_active &&
        (category.parent?.is_active ?? true) &&
        category._count.children === 0,
      updated_at: category.updated_at,
      fare_policy: category_fare_values(category),
    })),
  };
}
export async function read_category_fares(db: PrismaService) {
  const snapshot = await db.client.$transaction(
    async (tx) => ({
      policy: await tx.rideFarePolicy.findUnique({
        where: { key: CONFIGURATION_KEY },
      }),
      categories: await tx.vehicleCategory.findMany(category_query),
    }),
    { isolationLevel: 'RepeatableRead', maxWait: 10000, timeout: 30000 },
  );
  return present(db, snapshot.policy, snapshot.categories);
}
export async function save_category_fares(
  db: PrismaService,
  actor_id: string,
  input: FarePolicyInput,
) {
  const saved = await db.client.$transaction(
    async (tx) => {
      await require_active_admin(tx, actor_id);
      // Same category -> fare lock order as quote creation; category edits share
      // this lock so names, hierarchy and rates cannot change during the save.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720041)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${FARE_POLICY_LOCK}::integer)`;
      const before = await tx.rideFarePolicy.findUnique({
        where: { key: CONFIGURATION_KEY },
      });
      if ((before?.version ?? 0) !== input.expected_version)
        throw new AppError(
          409,
          'FARE_POLICY_CONFLICT',
          'The fare policy changed. Reload before saving.',
        );
      const categories = await tx.vehicleCategory.findMany(category_query);
      const byId = new Map(
        categories.map((category) => [category.id, category]),
      );
      for (const rate of input.rates) {
        const category = byId.get(rate.category_id);
        if (
          !category ||
          category.updated_at.getTime() !==
            new Date(rate.expected_updated_at).getTime()
        )
          throw new AppError(
            409,
            'CATEGORY_FARE_CONFLICT',
            'A vehicle category changed or was removed. Reload before saving its fare.',
          );
      }
      for (const rate of input.rates) {
        const category = byId.get(rate.category_id)!;
        if (
          JSON.stringify(category_fare_values(category)) ===
          JSON.stringify(rate.fare_policy)
        )
          continue;
        const result = await tx.vehicleCategory.updateMany({
          where: {
            id: rate.category_id,
            updated_at: new Date(rate.expected_updated_at),
          },
          data: {
            ...category_fare_data(rate.fare_policy),
            updated_at: new Date(
              Math.max(Date.now(), category.updated_at.getTime() + 1),
            ),
          },
        });
        if (result.count !== 1)
          throw new AppError(
            409,
            'CATEGORY_FARE_CONFLICT',
            'A vehicle category changed. Reload before saving its fare.',
          );
        await create_user_log(tx, {
          actor_id,
          entity_type: 'VehicleCategory',
          entity_id: category.id,
          action: 'UPDATE_CATEGORY_FARE_POLICY',
          before_data: category_fare_values(category),
          after_data: rate.fare_policy,
        });
      }
      const { expected_version: _, rates: __, ...settings } = input;
      const policy = before
        ? await tx.rideFarePolicy.update({
            where: { id: before.id },
            data: {
              ...settings,
              version: { increment: 1 },
              updated_by_id: actor_id,
            },
          })
        : await tx.rideFarePolicy.create({
            data: {
              ...settings,
              key: CONFIGURATION_KEY,
              updated_by_id: actor_id,
            },
          });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'RideFarePolicy',
        entity_id: policy.id,
        action: 'SAVE_RIDE_FARE_POLICY',
        before_data: before,
        after_data: policy,
      });
      return {
        policy,
        categories: await tx.vehicleCategory.findMany(category_query),
      };
    },
    { maxWait: 10000, timeout: 30000 },
  );
  return present(db, saved.policy, saved.categories);
}

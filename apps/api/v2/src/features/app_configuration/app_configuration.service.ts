import type { Prisma, SupportContactConfiguration } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { require_active_admin } from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import {
  fare_policy_input,
  CONFIGURATION_KEY,
  FARE_POLICY_LOCK,
  SUPPORT_CONFIGURATION_LOCK,
  type FarePolicyInput,
  type SupportContactInput,
} from './app_configuration.type.js';

type FarePolicyRow = Prisma.RideFarePolicyGetPayload<{
  include: { rates: true };
}>;
const options = { maxWait: 10000, timeout: 30000 };
const payment_policy = (policy: FarePolicyRow | null) => ({
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
@Injectable()
export class AppConfigurationService {
  constructor(private readonly database: PrismaService) {}

  async fare_snapshot() {
    const policy = await this.database.client.rideFarePolicy.findUnique({
      where: { key: CONFIGURATION_KEY },
      include: { rates: true },
    });
    if (
      !policy ||
      !fare_policy_input.safeParse({
        expected_version: policy.version,
        ...payment_policy(policy),
        online_payment_enabled: policy.online_payment_enabled,
        commission_percent: policy.commission_percent.toNumber(),
        rates: policy.rates.map((rate) => ({
          group: rate.group,
          max_profit_km: rate.max_profit_km.toNumber(),
          normal_fare_per_km: rate.normal_fare_per_km.toNumber(),
          profit_fare_per_km: rate.profit_fare_per_km.toNumber(),
        })),
      }).success
    )
      throw new AppError(
        409,
        'FARE_POLICY_NOT_CONFIGURED',
        'Your administrator must configure a supported Fare Policy before rides can be quoted.',
      );
    return policy;
  }

  async fare_policy() {
    const policy = await this.database.client.rideFarePolicy.findUnique({
      where: { key: CONFIGURATION_KEY },
      include: { rates: true },
    });
    return this.present_fare_policy(policy);
  }

  private async present_fare_policy(policy: FarePolicyRow | null) {
    const updated_by = policy
      ? await this.database.client.user.findUnique({
          where: { id: policy.updated_by_id },
          select: { id: true, first_name: true, last_name: true },
        })
      : null;
    return {
      version: policy?.version ?? 0,
      updated_at: policy?.updated_at ?? null,
      updated_by,
      ...payment_policy(policy),
      rates: (policy?.rates ?? []).map((rate) => ({
        group: rate.group,
        max_profit_km: rate.max_profit_km.toNumber(),
        normal_fare_per_km: rate.normal_fare_per_km.toNumber(),
        profit_fare_per_km: rate.profit_fare_per_km.toNumber(),
      })),
    };
  }

  async save_fare_policy(actor_id: string, input: FarePolicyInput) {
    const saved = await this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${FARE_POLICY_LOCK}::integer)`;
      const before = await tx.rideFarePolicy.findUnique({
        where: { key: CONFIGURATION_KEY },
        include: { rates: true },
      });
      if ((before?.version ?? 0) !== input.expected_version)
        throw new AppError(
          409,
          'FARE_POLICY_CONFLICT',
          'The fare policy changed. Reload before saving.',
        );
      const { expected_version: _, rates, ...policy_settings } = input;
      const row = before
        ? await tx.rideFarePolicy.update({
            where: { id: before.id },
            data: {
              ...policy_settings,
              version: { increment: 1 },
              updated_by_id: actor_id,
              rates: { deleteMany: {}, create: rates },
            },
            include: { rates: true },
          })
        : await tx.rideFarePolicy.create({
            data: {
              ...policy_settings,
              key: CONFIGURATION_KEY,
              updated_by_id: actor_id,
              rates: { create: rates },
            },
            include: { rates: true },
          });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'RideFarePolicy',
        entity_id: row.id,
        action: 'SAVE_RIDE_FARE_POLICY',
        before_data: before,
        after_data: row,
      });
      return row;
    }, options);
    return this.present_fare_policy(saved);
  }

  async support_contacts(admin = false) {
    const row =
      await this.database.client.supportContactConfiguration.findUnique({
        where: { key: CONFIGURATION_KEY },
      });
    return this.present_support_contacts(row, admin);
  }

  private async present_support_contacts(
    row: SupportContactConfiguration | null,
    admin: boolean,
  ) {
    const updated_by =
      admin && row
        ? await this.database.client.user.findUnique({
            where: { id: row.updated_by_id },
            select: { id: true, first_name: true, last_name: true },
          })
        : undefined;
    return {
      version: row?.version ?? 0,
      updated_at: row?.updated_at ?? null,
      ...(admin ? { updated_by: updated_by ?? null } : {}),
      support_phone: row?.support_phone ?? null,
      emergency_phone: row?.emergency_phone ?? null,
      whatsapp_phone: row?.whatsapp_phone ?? null,
      support_email: row?.support_email ?? null,
      support_hours: row?.support_hours ?? null,
      instructions: row?.instructions ?? null,
    };
  }

  async save_support_contacts(actor_id: string, input: SupportContactInput) {
    const saved = await this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SUPPORT_CONFIGURATION_LOCK}::integer)`;
      const before = await tx.supportContactConfiguration.findUnique({
        where: { key: CONFIGURATION_KEY },
      });
      if ((before?.version ?? 0) !== input.expected_version)
        throw new AppError(
          409,
          'SUPPORT_CONFIGURATION_CONFLICT',
          'Support contacts changed. Reload before saving.',
        );
      const { expected_version: _, ...values } = input;
      const data = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          value?.trim() || null,
        ]),
      ) as Omit<SupportContactInput, 'expected_version'>;
      const row = before
        ? await tx.supportContactConfiguration.update({
            where: { id: before.id },
            data: {
              ...data,
              version: { increment: 1 },
              updated_by_id: actor_id,
            },
          })
        : await tx.supportContactConfiguration.create({
            data: { ...data, key: CONFIGURATION_KEY, updated_by_id: actor_id },
          });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'SupportContactConfiguration',
        entity_id: row.id,
        action: 'SAVE_SUPPORT_CONTACTS',
        before_data: before,
        after_data: row,
      });
      return row;
    }, options);
    return this.present_support_contacts(saved, true);
  }
}

import { Injectable } from '@nestjs/common';
import { AppError } from '../../core/error.js';
import { requireActiveAdmin } from '../../database/account-locks.js';
import { nextEntityId } from '../../database/entity-id.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import { VehicleCategoryRepository } from '../vehicle_category/vehicle_category.repo.js';
import { category_fare_values } from './fare_calculation.js';
import {
  CONFIGURATION_KEY,
  FARE_POLICY_LOCK,
  SUPPORT_CONFIGURATION_LOCK,
  fare_policy_input,
  type FarePolicyInput,
  type SupportContactInput,
} from './app_configuration.type.js';
import {
  saveCategoryFare,
  saveFarePolicy,
  saveSupportContacts,
} from './sql/configuration.sql.js';

type Category = Awaited<
  ReturnType<VehicleCategoryRepository['list_categories']>
>[number];
type Revision = {
  id: string;
  key: string;
  version: number;
  updated_at: Date;
  updated_by_id: string;
};
type FareRow = Revision &
  Omit<
    FarePolicyInput,
    | 'expected_version'
    | 'rates'
    | 'commission_percent'
    | 'cancellation_fee_percent'
    | 'maximum_cancellation_fee'
    | 'online_payment_enabled'
  > & {
    commission_percent: string;
    cancellation_fee_percent: string;
    maximum_cancellation_fee: string;
    online_payment_enabled: boolean;
  };
type ContactRow = Revision & Omit<SupportContactInput, 'expected_version'>;
const fareConflict = () =>
  new AppError(
    409,
    'FARE_POLICY_CONFLICT',
    'The fare policy changed. Reload before saving.',
  );
const supportConflict = () =>
  new AppError(
    409,
    'SUPPORT_CONFIGURATION_CONFLICT',
    'Support contacts changed. Reload before saving.',
  );

function paymentPolicy(policy: FareRow | null) {
  return {
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
    cancellation_fee_percent: Number(policy?.cancellation_fee_percent ?? 10),
    maximum_cancellation_fee: Number(policy?.maximum_cancellation_fee ?? 100),
  };
}

function auditFare(row: FareRow | null) {
  return (
    row && {
      ...row,
      commission_percent: String(Number(row.commission_percent)),
      cancellation_fee_percent: String(Number(row.cancellation_fee_percent)),
      maximum_cancellation_fee: String(Number(row.maximum_cancellation_fee)),
    }
  );
}

@Injectable()
export class ConfigurationRepository {
  constructor(
    private readonly db: PostgresService,
    private readonly categories: VehicleCategoryRepository,
  ) {}

  private async findFare(db: SqlClient) {
    const result = await db.query<FareRow>(
      'SELECT * FROM ride_fare_policies WHERE key=$1',
      [CONFIGURATION_KEY],
    );
    return result.rows[0] ?? null;
  }

  private async findContacts(db: SqlClient) {
    const result = await db.query<ContactRow>(
      'SELECT * FROM support_contact_configurations WHERE key=$1',
      [CONFIGURATION_KEY],
    );
    return result.rows[0] ?? null;
  }

  private async editor(db: SqlClient, id: string | undefined) {
    if (!id) return null;
    const result = await db.query<{
      id: string;
      first_name: string | null;
      last_name: string | null;
    }>('SELECT id, first_name, last_name FROM users WHERE id=$1', [id]);
    return result.rows[0] ?? null;
  }

  async fareSnapshot() {
    const row = await this.findFare(this.db);
    const policy = paymentPolicy(row);
    if (
      row &&
      !fare_policy_input.safeParse({
        expected_version: row.version,
        ...policy,
        rates: [],
        online_payment_enabled: row.online_payment_enabled,
        commission_percent: Number(row.commission_percent),
      }).success
    )
      throw new AppError(
        409,
        'FARE_POLICY_NOT_CONFIGURED',
        'Your administrator must configure a supported Fare Policy before rides can be quoted.',
      );
    return { ...policy, version: row?.version ?? 0 };
  }

  private async presentFare(
    db: SqlClient,
    policy: FareRow | null,
    categories: Category[],
  ) {
    return {
      version: policy?.version ?? 0,
      updated_at: policy?.updated_at ?? null,
      updated_by: await this.editor(db, policy?.updated_by_id),
      ...paymentPolicy(policy),
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

  async readFares() {
    return this.db.transaction(
      async (tx) =>
        this.presentFare(
          tx,
          await this.findFare(tx),
          await this.categories.list_categories(false, tx),
        ),
      'REPEATABLE READ',
    );
  }

  async saveFares(actor: string, input: FarePolicyInput) {
    return this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor);
      // Match the lock order used by category edits and ride quote creation.
      await tx.query('SELECT pg_advisory_xact_lock(720041)');
      await tx.query('SELECT pg_advisory_xact_lock($1::integer)', [
        FARE_POLICY_LOCK,
      ]);
      const before = await this.findFare(tx);
      if ((before?.version ?? 0) !== input.expected_version)
        throw fareConflict();
      const categories = await this.categories.list_categories(false, tx);
      const byId = new Map(
        categories.map((category) => [category.id, category]),
      );
      for (const entry of input.rates) {
        const category = byId.get(entry.category_id);
        const expected = new Date(entry.expected_updated_at);
        if (!category || category.updated_at.getTime() !== expected.getTime())
          throw new AppError(
            409,
            'CATEGORY_FARE_CONFLICT',
            'A vehicle category changed or was removed. Reload before saving its fare.',
          );
        const fare = entry.fare_policy && {
          ...entry.fare_policy,
          commission_percent:
            entry.fare_policy.commission_percent ??
            Number(category.commission_percent),
        };
        const oldFare = category_fare_values(category);
        if (JSON.stringify(oldFare) === JSON.stringify(fare)) continue;
        const result = await tx.query(saveCategoryFare, [
          fare?.max_profit_km,
          fare?.normal_fare_per_km,
          fare?.profit_fare_per_km,
          fare?.commission_percent,
          new Date(Math.max(Date.now(), expected.getTime() + 1)),
          category.id,
          expected,
        ]);
        if (result.rowCount !== 1)
          throw new AppError(
            409,
            'CATEGORY_FARE_CONFLICT',
            'A vehicle category changed. Reload before saving its fare.',
          );
        await insertUserLog(tx, {
          actor_id: actor,
          entity_type: 'VehicleCategory',
          entity_id: category.id,
          action: 'UPDATE_CATEGORY_FARE_POLICY',
          before_data: oldFare,
          after_data: fare,
        });
      }
      const result = await tx.query<FareRow>(saveFarePolicy, [
        before?.id ?? nextEntityId(),
        CONFIGURATION_KEY,
        actor,
        input.arrival_radius_m,
        input.location_max_age_s,
        input.matching_initial_radius_km,
        input.matching_max_radius_km,
        input.matching_expansion_s,
        input.search_timeout_s,
        input.offer_lifetime_s,
        input.cash_enabled,
        input.direct_upi_enabled,
        input.online_payment_enabled,
        input.commission_percent,
        input.free_cancellation_minutes,
        input.free_pickup_wait_minutes,
        input.cancellation_fee_percent,
        input.maximum_cancellation_fee,
        input.expected_version,
      ]);
      const saved = result.rows[0];
      if (!saved) throw fareConflict();
      await insertUserLog(tx, {
        actor_id: actor,
        entity_type: 'RideFarePolicy',
        entity_id: saved.id,
        action: 'SAVE_RIDE_FARE_POLICY',
        before_data: auditFare(before),
        after_data: auditFare(saved),
      });
      return this.presentFare(
        tx,
        saved,
        await this.categories.list_categories(false, tx),
      );
    });
  }

  private async presentContacts(
    db: SqlClient,
    row: ContactRow | null,
    admin: boolean,
  ) {
    return {
      version: row?.version ?? 0,
      updated_at: row?.updated_at ?? null,
      ...(admin
        ? { updated_by: await this.editor(db, row?.updated_by_id) }
        : {}),
      support_phone: row?.support_phone ?? null,
      emergency_phone: row?.emergency_phone ?? null,
      whatsapp_phone: row?.whatsapp_phone ?? null,
      support_email: row?.support_email ?? null,
      support_hours: row?.support_hours ?? null,
      instructions: row?.instructions ?? null,
    };
  }

  async readContacts(admin: boolean) {
    return this.presentContacts(
      this.db,
      await this.findContacts(this.db),
      admin,
    );
  }

  async saveContacts(actor: string, input: SupportContactInput) {
    return this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor);
      await tx.query('SELECT pg_advisory_xact_lock($1::integer)', [
        SUPPORT_CONFIGURATION_LOCK,
      ]);
      const before = await this.findContacts(tx);
      if ((before?.version ?? 0) !== input.expected_version)
        throw supportConflict();
      const fields = [
        input.support_phone,
        input.emergency_phone,
        input.whatsapp_phone,
        input.support_email,
        input.support_hours,
        input.instructions,
      ];
      const result = await tx.query<ContactRow>(saveSupportContacts, [
        before?.id ?? nextEntityId(),
        CONFIGURATION_KEY,
        actor,
        ...fields.map((value) => value?.trim() || null),
        input.expected_version,
      ]);
      const saved = result.rows[0];
      if (!saved) throw supportConflict();
      await insertUserLog(tx, {
        actor_id: actor,
        entity_type: 'SupportContactConfiguration',
        entity_id: saved.id,
        action: 'SAVE_SUPPORT_CONTACTS',
        before_data: before,
        after_data: saved,
      });
      return this.presentContacts(tx, saved, true);
    });
  }
}

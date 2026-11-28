import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AppError } from '../../core/error.js';
import { requireActiveAdmin } from '../../database/account-locks.js';
import { nextEntityId } from '../../database/entity-id.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import { CATEGORY_MESSAGES } from './vehicle_category.constant.js';
import type {
  CategoryInput,
  CategoryUpdateInput,
} from './vehicle_category.type.js';
import {
  insertCategory,
  selectCategory,
  updateCategory,
} from './sql/vehicle-categories.sql.js';

type Category = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  vehicle_type: CategoryInput['vehicle_type'];
  capacity: number;
  base_fare: string;
  per_kilometer: string;
  per_minute: string;
  max_profit_km: string | null;
  normal_fare_per_km: string | null;
  profit_fare_per_km: string | null;
  commission_percent: string;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

type CategoryCount = { children: number; vehicles: number; quotes: number };
type CategoryRow = Category & {
  parent: Category | null;
  _count: CategoryCount;
};
const ordered = 'ORDER BY c.sort_order ASC, c.name ASC, c.id ASC';
const effective = 'c.is_active AND (c.parent_id IS NULL OR p.is_active)';

// PostgreSQL numeric values are exact at the precision declared for this table.
const decimal = (value: string | number) => String(Number(value));
const nullableDecimal = (value: string | number | null) =>
  value == null ? null : decimal(value);
function categoryFields(row: Category): Category {
  return {
    ...row,
    base_fare: decimal(row.base_fare),
    per_kilometer: decimal(row.per_kilometer),
    per_minute: decimal(row.per_minute),
    max_profit_km: nullableDecimal(row.max_profit_km),
    normal_fare_per_km: nullableDecimal(row.normal_fare_per_km),
    profit_fare_per_km: nullableDecimal(row.profit_fare_per_km),
    commission_percent: decimal(row.commission_percent),
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}
function mapCategory(row: CategoryRow): CategoryRow {
  return {
    ...row,
    ...categoryFields(row),
    parent: row.parent && categoryFields(row.parent),
  };
}

@Injectable()
export class VehicleCategoryRepository {
  constructor(private readonly db: PostgresService) {}

  async list_categories(active_only = false, db: SqlClient = this.db) {
    const result = await db.query<CategoryRow>(
      selectCategory +
        ' WHERE NOT $1::boolean OR (' +
        effective +
        ') ' +
        ordered,
      [active_only],
    );
    return result.rows.map(mapCategory);
  }

  async list_category_choices() {
    const result = await this.db.query<Omit<CategoryRow, '_count'>>(
      'SELECT c.*, to_jsonb(p) AS parent FROM vehicle_categories c ' +
        'LEFT JOIN vehicle_categories p ON p.id=c.parent_id WHERE ' +
        effective +
        ' AND NOT EXISTS (SELECT 1 FROM vehicle_categories child WHERE child.parent_id=c.id) ' +
        ordered,
    );
    return result.rows.map((row) => ({
      ...categoryFields(row),
      parent: row.parent && categoryFields(row.parent),
    }));
  }

  private async findCategory(tx: SqlClient, id: string) {
    const { rows } = await tx.query<CategoryRow>(
      selectCategory + ' WHERE c.id=$1',
      [id],
    );
    return rows[0] ? mapCategory(rows[0]) : null;
  }

  async write_category(
    actor_id: string,
    input: CategoryInput | CategoryUpdateInput,
    id?: string,
  ) {
    return this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor_id);
      await tx.query('SELECT pg_advisory_xact_lock(720041)');
      const before = id ? await this.findCategory(tx, id) : null;
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
      )
        throw new AppError(
          409,
          'CATEGORY_CONFLICT',
          CATEGORY_MESSAGES.CONFLICT,
        );
      if (
        before &&
        (before._count.vehicles > 0 || before._count.quotes > 0) &&
        input.vehicle_type !== before.vehicle_type
      )
        throw new AppError(
          409,
          'CATEGORY_IN_USE',
          CATEGORY_MESSAGES.TYPE_LOCKED,
        );
      if (before && input.capacity > before.capacity) {
        const result = await tx.query<{ found: boolean }>(
          'SELECT EXISTS (SELECT 1 FROM vehicles WHERE vehicle_category_id=$1 AND capacity<$2) AS found',
          [before.id, input.capacity],
        );
        if (result.rows[0]?.found)
          throw new AppError(
            409,
            'CATEGORY_IN_USE',
            'Passenger seats cannot exceed the capacity of vehicles already registered in this category.',
          );
      }
      if (input.parent_id) {
        const parent = await this.findCategory(tx, input.parent_id);
        if (
          !parent ||
          parent.parent_id ||
          parent.id === id ||
          (before && before._count.children > 0)
        )
          throw new AppError(
            422,
            'CATEGORY_PARENT_INVALID',
            CATEGORY_MESSAGES.PARENT,
          );
        if (parent._count.vehicles > 0)
          throw new AppError(
            409,
            'CATEGORY_IN_USE',
            CATEGORY_MESSAGES.USED_PARENT,
          );
      }
      const categoryId = id ?? nextEntityId();
      const updatedAt = new Date(
        before
          ? Math.max(Date.now(), before.updated_at.getTime() + 1)
          : Date.now(),
      );
      const values = [
        input.name,
        input.description || null,
        input.image_url || null,
        input.parent_id,
        input.vehicle_type,
        input.capacity,
        input.base_fare,
        input.per_kilometer,
        input.per_minute,
        input.is_active,
        input.sort_order,
        input.fare_policy !== undefined,
        input.fare_policy?.max_profit_km,
        input.fare_policy?.normal_fare_per_km,
        input.fare_policy?.profit_fare_per_km,
        input.fare_policy?.commission_percent,
        categoryId,
      ];
      if (id) await tx.query(updateCategory, [...values, updatedAt]);
      else
        await tx.query(insertCategory, [
          ...values,
          `CAT-${randomBytes(5).toString('hex').toUpperCase()}`,
          updatedAt,
        ]);
      const category = await this.findCategory(tx, categoryId);
      if (!category)
        throw new Error('Saved vehicle category could not be read');
      await insertUserLog(tx, {
        actor_id,
        entity_type: 'VehicleCategory',
        entity_id: category.id,
        action: id ? 'UPDATE_VEHICLE_CATEGORY' : 'CREATE_VEHICLE_CATEGORY',
        before_data: before ?? undefined,
        after_data: category,
      });
      return category;
    });
  }
}

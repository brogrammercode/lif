import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { nextEntityId } from '../../database/entity-id.js';
import {
  requireActiveAccount,
  requireActiveAdmin,
  requireDriverParticipation,
} from '../../database/account-locks.js';
import { insertUserLog } from '../../database/user-log.js';
import { AppError } from '../../core/error.js';
import type {
  BrandInput,
  ModelInput,
  CatalogQuery,
} from './vehicle_catalog.type.js';
import {
  brandFilter,
  brandIdentity,
  brandSummary,
  insertBrand,
  insertModel,
  modelFilter,
  people,
  peopleJoins,
  updateBrand,
  updateModel,
} from './sql/catalog.sql.js';

const normalize = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLowerCase();
type CatalogEntry = {
  id: string;
  requested_by_id: string | null;
  reviewed_by_id: string | null;
  reviewed_at: Date | null;
  status: string;
  is_active: boolean;
  updated_at: Date;
};
const brands = 'FROM vehicle_brands c';
const models = 'FROM vehicle_models c JOIN vehicle_brands b ON b.id=c.brand_id';
const ownFilter =
  "WHERE c.requested_by_id=$1 AND ($2::text='all' OR c.status::text=$2)";
const ownOrder = 'ORDER BY c.updated_at DESC,c.id DESC LIMIT $3 OFFSET $4';

@Injectable()
export class VehicleCatalogRepository {
  constructor(private readonly database: PostgresService) {}

  async findBrandByName(name: string) {
    const { rows } = await this.database.query<{
      id: string;
      status: string;
      is_active: boolean;
    }>(
      'SELECT id,status,is_active FROM vehicle_brands WHERE normalized_name=$1',
      [normalize(name)],
    );
    return rows[0];
  }

  async findModelByName(brand: string, name: string) {
    const { rows } = await this.database.query<{ id: string }>(
      'SELECT id FROM vehicle_models WHERE brand_id=$1 AND normalized_name=$2',
      [brand, normalize(name)],
    );
    return rows[0];
  }

  async own_requests(user: string, input: CatalogQuery) {
    const values = [
      user,
      input.status,
      input.page_size,
      (input.page - 1) * input.page_size,
    ];
    return this.database.transaction(async (tx) => {
      const brandRows = await tx.query(
        `SELECT c.* ${brands} ${ownFilter} ${ownOrder}`,
        values,
      );
      const modelRows = await tx.query(
        `SELECT c.*,jsonb_build_object('id',b.id,'name',b.name,'status',b.status) AS brand ${models} ${ownFilter} ${ownOrder}`,
        values,
      );
      const brandCount = await tx.query<{ total: number }>(
        `SELECT count(*)::int AS total ${brands} ${ownFilter}`,
        values.slice(0, 2),
      );
      const modelCount = await tx.query<{ total: number }>(
        `SELECT count(*)::int AS total ${models} ${ownFilter}`,
        values.slice(0, 2),
      );
      return {
        brands: brandRows.rows,
        models: modelRows.rows,
        brand_count: brandCount.rows[0]!.total,
        model_count: modelCount.rows[0]!.total,
        page: input.page,
        page_size: input.page_size,
      };
    }, 'REPEATABLE READ');
  }

  list_brands(input: CatalogQuery, publicOnly = false) {
    const values = [publicOnly, input.status, input.query];
    const projection = publicOnly
      ? 'c.id,c.name,c.logo_url,c.country,c.description'
      : `c.*,${people},jsonb_build_object('models',(SELECT count(*) FROM vehicle_models WHERE brand_id=c.id)) AS "_count"`;
    const joins = publicOnly ? '' : peopleJoins;
    return this.list(
      input,
      values,
      `${brands} ${brandFilter}`,
      `SELECT ${projection} ${brands} ${joins} ${brandFilter} ORDER BY c.name,c.id LIMIT $4 OFFSET $5`,
    );
  }
  list_models(input: CatalogQuery, publicOnly = false) {
    const values = [publicOnly, input.status, input.query, input.brand_id];
    const projection = publicOnly
      ? `c.id,c.brand_id,c.name,c.logo_url,c.vehicle_type,c.fuel_type,c.seating_capacity,
         c.year_from,c.year_to,c.description,${brandIdentity} AS brand`
      : `c.*,${people},${brandSummary} AS brand`;
    const joins = publicOnly ? '' : peopleJoins;
    return this.list(
      input,
      values,
      `${models} ${modelFilter}`,
      `SELECT ${projection} ${models} ${joins} ${modelFilter} ORDER BY b.name,c.name,c.id LIMIT $5 OFFSET $6`,
    );
  }

  private list(
    input: CatalogQuery,
    values: readonly unknown[],
    countSql: string,
    rowsSql: string,
  ) {
    return this.database.transaction(async (tx) => {
      const count = await tx.query<{ total: number }>(
        'SELECT count(*)::int AS total ' + countSql,
        values,
      );
      const total = count.rows[0]!.total;
      const page = Math.min(
        input.page,
        Math.max(1, Math.ceil(total / input.page_size)),
      );
      const { rows } = await tx.query(rowsSql, [
        ...values,
        input.page_size,
        (page - 1) * input.page_size,
      ]);
      return { rows, total, page, page_size: input.page_size };
    }, 'REPEATABLE READ');
  }

  private async authorize(
    tx: SqlClient,
    actor: string,
    driverRequest: boolean,
    kind: 'brand' | 'model',
  ) {
    if (driverRequest) {
      await requireActiveAccount(tx, actor);
      await tx.query('SELECT pg_advisory_xact_lock(720043,hashtext($1))', [
        actor,
      ]);
      await requireDriverParticipation(tx, actor);
    } else await requireActiveAdmin(tx, actor);
    await tx.query('SELECT pg_advisory_xact_lock(720049)');
    if (
      driverRequest &&
      !(
        await tx.query('SELECT id FROM driver_profiles WHERE user_id=$1', [
          actor,
        ])
      ).rowCount
    )
      throw new AppError(
        403,
        'DRIVER_PROFILE_REQUIRED',
        `Create a driver profile before suggesting a ${kind}.`,
      );
  }

  save_brand(
    actor_id: string,
    input: BrandInput,
    id?: string,
    driver_request = false,
  ) {
    return this.database.transaction(async (tx) => {
      await this.authorize(tx, actor_id, driver_request, 'brand');
      const before = id
        ? (
            await tx.query<CatalogEntry>(
              'SELECT * FROM vehicle_brands WHERE id=$1',
              [id],
            )
          ).rows[0]
        : null;
      if (id && !before)
        throw new AppError(404, 'BRAND_NOT_FOUND', 'This brand was not found.');
      if (
        driver_request &&
        before &&
        (before.requested_by_id !== actor_id || before.status !== 'REJECTED')
      )
        throw new AppError(
          403,
          'CATALOG_CORRECTION_DENIED',
          'Only your own rejected brand request can be corrected.',
        );
      if (
        before &&
        before.updated_at.toISOString() !== input.expected_updated_at
      )
        throw new AppError(
          409,
          'CATALOG_CONFLICT',
          'This brand changed. Reload it before saving.',
        );
      const status = driver_request ? 'REQUESTED' : input.status;
      if (status === 'REJECTED' && !input.rejection_reason)
        throw new AppError(
          422,
          'REJECTION_REASON_REQUIRED',
          'Explain why the request was rejected.',
        );
      const reviewed =
        !driver_request &&
        (!before || before.status !== status) &&
        status !== 'REQUESTED';
      const rowId = id ?? nextEntityId();
      await tx.query(before ? updateBrand : insertBrand, [
        rowId,
        input.name.trim().replace(/\s+/g, ' '),
        normalize(input.name),
        input.description,
        input.country,
        input.website_url,
        input.logo_url,
        status,
        driver_request || input.is_active,
        status === 'REJECTED' ? input.rejection_reason : null,
        before ? before.requested_by_id : driver_request ? actor_id : null,
        reviewed
          ? actor_id
          : status === 'REQUESTED'
            ? null
            : before?.reviewed_by_id,
        reviewed
          ? new Date()
          : status === 'REQUESTED'
            ? null
            : before?.reviewed_at,
      ]);
      const saved = await tx.query<CatalogEntry>(
        `SELECT c.*,${people} ${brands} ${peopleJoins} WHERE c.id=$1`,
        [rowId],
      );
      const row = saved.rows[0]!;
      await insertUserLog(tx, {
        actor_id,
        entity_type: 'VehicleBrand',
        entity_id: row.id,
        action: driver_request
          ? 'REQUEST_VEHICLE_BRAND'
          : before
            ? 'UPDATE_VEHICLE_BRAND'
            : 'CREATE_VEHICLE_BRAND',
        before_data: before,
        after_data: row,
      });
      return row;
    });
  }
  save_model(
    actor_id: string,
    input: ModelInput,
    id?: string,
    driver_request = false,
  ) {
    return this.database.transaction(async (tx) => {
      await this.authorize(tx, actor_id, driver_request, 'model');
      const before = id
        ? (
            await tx.query<CatalogEntry>(
              'SELECT * FROM vehicle_models WHERE id=$1',
              [id],
            )
          ).rows[0]
        : null;
      if (id && !before)
        throw new AppError(404, 'MODEL_NOT_FOUND', 'This model was not found.');
      if (
        driver_request &&
        before &&
        (before.requested_by_id !== actor_id || before.status !== 'REJECTED')
      )
        throw new AppError(
          403,
          'CATALOG_CORRECTION_DENIED',
          'Only your own rejected model request can be corrected.',
        );
      if (
        before &&
        before.updated_at.toISOString() !== input.expected_updated_at
      )
        throw new AppError(
          409,
          'CATALOG_CONFLICT',
          'This model changed. Reload it before saving.',
        );
      const brand = (
        await tx.query<CatalogEntry>(
          'SELECT * FROM vehicle_brands WHERE id=$1',
          [input.brand_id],
        )
      ).rows[0];
      if (!brand)
        throw new AppError(422, 'BRAND_NOT_FOUND', 'Choose an existing brand.');
      const status = driver_request ? 'REQUESTED' : input.status;
      if (
        driver_request &&
        !(brand.status === 'VERIFIED' && brand.is_active) &&
        !(brand.status === 'REQUESTED' && brand.requested_by_id === actor_id)
      )
        throw new AppError(
          422,
          'BRAND_UNAVAILABLE',
          'Choose a verified brand or your own pending brand request.',
        );
      if (status === 'VERIFIED' && brand.status !== 'VERIFIED')
        throw new AppError(
          422,
          'BRAND_REVIEW_REQUIRED',
          'Verify the brand before verifying this model.',
        );
      if (
        input.year_from !== null &&
        input.year_to !== null &&
        input.year_to < input.year_from
      )
        throw new AppError(
          422,
          'YEAR_RANGE_INVALID',
          'The final year must be after the first year.',
        );
      if (status === 'REJECTED' && !input.rejection_reason)
        throw new AppError(
          422,
          'REJECTION_REASON_REQUIRED',
          'Explain why the request was rejected.',
        );
      const reviewed =
        !driver_request &&
        (!before || before.status !== status) &&
        status !== 'REQUESTED';
      const rowId = id ?? nextEntityId();
      await tx.query(before ? updateModel : insertModel, [
        rowId,
        input.brand_id,
        input.name.trim().replace(/\s+/g, ' '),
        normalize(input.name),
        input.description,
        input.logo_url,
        input.vehicle_type,
        input.fuel_type,
        input.seating_capacity,
        input.year_from,
        input.year_to,
        status,
        driver_request || input.is_active,
        status === 'REJECTED' ? input.rejection_reason : null,
        before ? before.requested_by_id : driver_request ? actor_id : null,
        reviewed
          ? actor_id
          : status === 'REQUESTED'
            ? null
            : before?.reviewed_by_id,
        reviewed
          ? new Date()
          : status === 'REQUESTED'
            ? null
            : before?.reviewed_at,
      ]);
      const saved = await tx.query<CatalogEntry>(
        `SELECT c.*,${people},${brandIdentity} AS brand ${models} ${peopleJoins} WHERE c.id=$1`,
        [rowId],
      );
      const row = saved.rows[0]!;
      await insertUserLog(tx, {
        actor_id,
        entity_type: 'VehicleModel',
        entity_id: row.id,
        action: driver_request
          ? 'REQUEST_VEHICLE_MODEL'
          : before
            ? 'UPDATE_VEHICLE_MODEL'
            : 'CREATE_VEHICLE_MODEL',
        before_data: before,
        after_data: row,
      });
      return row;
    });
  }
}

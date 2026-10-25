import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { create_user_log } from '../../infra/database/user_log.js';
import {
  require_active_account,
  require_driver_participation,
  require_active_admin,
} from '../../infra/database/account_lifecycle.js';
import { AppError } from '../../core/error.js';
import type {
  BrandInput,
  ModelInput,
  CatalogQuery,
} from './vehicle_catalog.type.js';
const identity = {
  id: true,
  email: true,
  first_name: true,
  last_name: true,
} as const;
const include = {
  requested_by: { select: identity },
  reviewed_by: { select: identity },
} as const;
const normalize = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLowerCase();
const tx_options = { maxWait: 10000, timeout: 30000 };
@Injectable()
export class VehicleCatalogRepository {
  constructor(private readonly database: PrismaService) {}
  async own_requests(user_id: string, input: CatalogQuery) {
    const where = {
      requested_by_id: user_id,
      ...(input.status === 'all' ? {} : { status: input.status }),
    };
    return this.database.client.$transaction(
      async (tx) => {
        const [brands, models, brand_count, model_count] = await Promise.all([
          tx.vehicleBrand.findMany({
            where,
            orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
            skip: (input.page - 1) * input.page_size,
            take: input.page_size,
          }),
          tx.vehicleModel.findMany({
            where,
            include: {
              brand: { select: { id: true, name: true, status: true } },
            },
            orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
            skip: (input.page - 1) * input.page_size,
            take: input.page_size,
          }),
          tx.vehicleBrand.count({ where }),
          tx.vehicleModel.count({ where }),
        ]);
        return {
          brands,
          models,
          brand_count,
          model_count,
          page: input.page,
          page_size: input.page_size,
        };
      },
      {
        ...tx_options,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
  }
  list_brands(input: CatalogQuery, public_only = false) {
    const where: Prisma.VehicleBrandWhereInput = {
      ...(public_only
        ? { status: 'VERIFIED', is_active: true }
        : input.status !== 'all'
          ? { status: input.status }
          : {}),
      ...(input.query
        ? { name: { contains: input.query, mode: 'insensitive' } }
        : {}),
    };
    return this.database.client.$transaction(
      async (tx) => {
        const total = await tx.vehicleBrand.count({ where });
        const page = Math.min(
          input.page,
          Math.max(1, Math.ceil(total / input.page_size)),
        );
        const rows = await tx.vehicleBrand.findMany({
          where,
          include: public_only
            ? undefined
            : { ...include, _count: { select: { models: true } } },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take: input.page_size,
          skip: (page - 1) * input.page_size,
        });
        return {
          rows: public_only
            ? rows.map((row) => ({
                id: row.id,
                name: row.name,
                logo_url: row.logo_url,
                country: row.country,
                description: row.description,
              }))
            : rows,
          total,
          page,
          page_size: input.page_size,
        };
      },
      {
        ...tx_options,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
  }
  list_models(input: CatalogQuery, public_only = false) {
    const where: Prisma.VehicleModelWhereInput = {
      ...(input.brand_id ? { brand_id: input.brand_id } : {}),
      ...(public_only
        ? {
            status: 'VERIFIED',
            is_active: true,
            brand: { status: 'VERIFIED', is_active: true },
          }
        : input.status !== 'all'
          ? { status: input.status }
          : {}),
      ...(input.query
        ? { name: { contains: input.query, mode: 'insensitive' } }
        : {}),
    };
    return this.database.client.$transaction(
      async (tx) => {
        const total = await tx.vehicleModel.count({ where });
        const page = Math.min(
          input.page,
          Math.max(1, Math.ceil(total / input.page_size)),
        );
        const rows = await tx.vehicleModel.findMany({
          where,
          include: {
            ...(!public_only ? include : {}),
            brand: {
              select: {
                id: true,
                name: true,
                status: true,
                is_active: true,
                logo_url: true,
              },
            },
          },
          orderBy: [{ brand: { name: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
          take: input.page_size,
          skip: (page - 1) * input.page_size,
        });
        return {
          rows: public_only
            ? rows.map(
                ({
                  id,
                  brand_id,
                  name,
                  logo_url,
                  vehicle_type,
                  fuel_type,
                  seating_capacity,
                  year_from,
                  year_to,
                  description,
                  brand,
                }) => ({
                  id,
                  brand_id,
                  name,
                  logo_url,
                  vehicle_type,
                  fuel_type,
                  seating_capacity,
                  year_from,
                  year_to,
                  description,
                  brand: { id: brand.id, name: brand.name },
                }),
              )
            : rows,
          total,
          page,
          page_size: input.page_size,
        };
      },
      {
        ...tx_options,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
  }
  save_brand(
    actor_id: string,
    input: BrandInput,
    id?: string,
    driver_request = false,
  ) {
    return this.database.client.$transaction(async (tx) => {
      if (driver_request) {
        await require_active_account(tx, actor_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${actor_id}))`;
        await require_driver_participation(tx, actor_id);
      } else await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720049)`;
      if (
        driver_request &&
        !(await tx.driverProfile.findUnique({
          where: { user_id: actor_id },
          select: { id: true },
        }))
      )
        throw new AppError(
          403,
          'DRIVER_PROFILE_REQUIRED',
          'Create a driver profile before suggesting a brand.',
        );
      const before = id
        ? await tx.vehicleBrand.findUnique({ where: { id } })
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
      const data = {
        name: input.name.trim().replace(/\s+/g, ' '),
        normalized_name: normalize(input.name),
        description: input.description,
        country: input.country,
        website_url: input.website_url,
        logo_url: input.logo_url,
        status,
        is_active: driver_request ? true : input.is_active,
        rejection_reason: status === 'REJECTED' ? input.rejection_reason : null,
        ...(!before
          ? { requested_by_id: driver_request ? actor_id : null }
          : {}),
        ...(reviewed
          ? { reviewed_by_id: actor_id, reviewed_at: new Date() }
          : status === 'REQUESTED'
            ? { reviewed_by_id: null, reviewed_at: null }
            : {}),
      };
      const row = before
        ? await tx.vehicleBrand.update({ where: { id }, data, include })
        : await tx.vehicleBrand.create({ data, include });
      await create_user_log(tx, {
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
    }, tx_options);
  }
  save_model(
    actor_id: string,
    input: ModelInput,
    id?: string,
    driver_request = false,
  ) {
    return this.database.client.$transaction(async (tx) => {
      if (driver_request) {
        await require_active_account(tx, actor_id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${actor_id}))`;
        await require_driver_participation(tx, actor_id);
      } else await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720049)`;
      if (
        driver_request &&
        !(await tx.driverProfile.findUnique({
          where: { user_id: actor_id },
          select: { id: true },
        }))
      )
        throw new AppError(
          403,
          'DRIVER_PROFILE_REQUIRED',
          'Create a driver profile before suggesting a model.',
        );
      const before = id
        ? await tx.vehicleModel.findUnique({ where: { id } })
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
      const brand = await tx.vehicleBrand.findUnique({
        where: { id: input.brand_id },
      });
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
      const data = {
        brand_id: input.brand_id,
        name: input.name.trim().replace(/\s+/g, ' '),
        normalized_name: normalize(input.name),
        description: input.description,
        logo_url: input.logo_url,
        vehicle_type: input.vehicle_type,
        fuel_type: input.fuel_type,
        seating_capacity: input.seating_capacity,
        year_from: input.year_from,
        year_to: input.year_to,
        status,
        is_active: driver_request ? true : input.is_active,
        rejection_reason: status === 'REJECTED' ? input.rejection_reason : null,
        ...(!before
          ? { requested_by_id: driver_request ? actor_id : null }
          : {}),
        ...(reviewed
          ? { reviewed_by_id: actor_id, reviewed_at: new Date() }
          : status === 'REQUESTED'
            ? { reviewed_by_id: null, reviewed_at: null }
            : {}),
      };
      const row = before
        ? await tx.vehicleModel.update({
            where: { id },
            data,
            include: {
              ...include,
              brand: { select: { id: true, name: true } },
            },
          })
        : await tx.vehicleModel.create({
            data,
            include: {
              ...include,
              brand: { select: { id: true, name: true } },
            },
          });
      await create_user_log(tx, {
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
    }, tx_options);
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { TransactionClient } from '../../infra/database/client.js';
import {
  require_active_account,
  require_active_admin,
  require_driver_participation,
} from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import { convert_image_to_webp } from '../../infra/media/image_transform.js';
import type { ImageUpload } from '../../infra/media/image_upload.js';
import type { CatalogQuery } from '../vehicle_catalog/vehicle_catalog.type.js';
import {
  is_vehicle_eligible,
  MATCHING_VEHICLE_INCLUDE,
} from '../vehicle_category/vehicle_category.security.js';
import {
  read_vehicle_fields,
  matches_vehicle_submission,
  has_approved_vehicle_fields,
  vehicle_document_keys,
  vehicle_labels,
  type VehicleField,
  type VehicleReview,
  type VehicleSubmission,
} from './vehicle_verification.type.js';

const options = { maxWait: 10000, timeout: 30000 };
const include = {
  ...MATCHING_VEHICLE_INCLUDE,
  brand: {
    select: { ...MATCHING_VEHICLE_INCLUDE.brand.select, logo_url: true },
  },
  catalog_model: {
    select: {
      ...MATCHING_VEHICLE_INCLUDE.catalog_model.select,
      logo_url: true,
    },
  },
  verification_assets: {
    select: { id: true, field_key: true, file_name: true },
  },
} as const;
const present_vehicle = (
  vehicle: Prisma.VehicleGetPayload<{ include: typeof include }>,
) => ({
  ...vehicle,
  is_eligible:
    vehicle.verification_version > 0 &&
    is_vehicle_eligible(
      vehicle,
      vehicle.vehicle_category
        ? {
            vehicle_category_id: vehicle.vehicle_category.id,
            vehicle_type: vehicle.type,
            category_snapshot: null,
          }
        : undefined,
      vehicle.driver_id,
    ),
});
const conflict = () =>
  new AppError(
    409,
    'VEHICLE_VERIFICATION_CONFLICT',
    'This vehicle changed. Reload it before continuing.',
  );
const usable = (
  entry: { status: string; is_active: boolean; requested_by_id: string | null },
  owner: string,
) =>
  entry.is_active &&
  (entry.status === 'VERIFIED' ||
    (entry.status === 'REQUESTED' && entry.requested_by_id === owner));

@Injectable()
export class VehicleVerificationService {
  constructor(private readonly database: PrismaService) {}
  private async driver(tx: TransactionClient, user_id: string) {
    await require_active_account(tx, user_id);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
    await require_driver_participation(tx, user_id);
    const user = await tx.user.findUniqueOrThrow({
      where: { id: user_id },
      select: { role: true, partner_activated_at: true },
    });
    if (!user.partner_activated_at && user.role !== 'DRIVER')
      throw new AppError(
        403,
        'PARTNER_ACTIVATION_REQUIRED',
        'Activate your driver account before registering a vehicle.',
      );
    return tx.driverProfile.upsert({
      where: { user_id },
      create: { user_id },
      update: {},
    });
  }
  async mine(user_id: string) {
    await this.database.client.$transaction(
      (tx) => this.driver(tx, user_id),
      options,
    );
    const result = await this.list(user_id);
    const pending_assets =
      await this.database.client.vehicleVerificationAsset.findMany({
        where: {
          owner_id: user_id,
          vehicle_id: null,
          created_at: { gte: new Date(Date.now() - 86400000) },
        },
        select: { id: true, field_key: true, created_at: true },
      });
    return { ...result, pending_assets };
  }
  async list(user_id: string) {
    const user = await this.database.client.user.findFirst({
      where: { id: user_id, deleted_at: null },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        avatar_url: true,
        status: true,
        role: true,
        partner_activated_at: true,
      },
    });
    if (!user)
      throw new AppError(404, 'USER_NOT_FOUND', 'This user was not found.');
    if (user.role !== 'DRIVER' && !user.partner_activated_at)
      throw new AppError(
        403,
        'DRIVER_ACCOUNT_REQUIRED',
        'Vehicle verification is available for driver accounts only.',
      );
    const vehicles = await this.database.client.vehicle.findMany({
      where: { driver: { user_id } },
      include,
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
    });
    return {
      user,
      vehicles: vehicles.map(present_vehicle),
    };
  }
  async catalog(user_id: string, input: CatalogQuery) {
    await this.database.client.$transaction(
      (tx) => this.driver(tx, user_id),
      options,
    );
    const allowed = {
      is_active: true,
      OR: [
        { status: 'VERIFIED' as const },
        { status: 'REQUESTED' as const, requested_by_id: user_id },
      ],
    };
    const search = input.query
      ? { name: { contains: input.query, mode: 'insensitive' as const } }
      : {};
    if (input.brand_id) {
      const where = {
        ...allowed,
        ...search,
        brand_id: input.brand_id,
        brand: allowed,
      };
      const [rows, total] = await Promise.all([
        this.database.client.vehicleModel.findMany({
          where,
          select: {
            id: true,
            brand_id: true,
            name: true,
            description: true,
            logo_url: true,
            status: true,
            vehicle_type: true,
            fuel_type: true,
            seating_capacity: true,
            year_from: true,
            year_to: true,
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (input.page - 1) * input.page_size,
          take: input.page_size,
        }),
        this.database.client.vehicleModel.count({ where }),
      ]);
      return { rows, total, page: input.page, page_size: input.page_size };
    }
    const where = { ...allowed, ...search };
    const [rows, total] = await Promise.all([
      this.database.client.vehicleBrand.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          country: true,
          website_url: true,
          logo_url: true,
          status: true,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.page_size,
        take: input.page_size,
      }),
      this.database.client.vehicleBrand.count({ where }),
    ]);
    return { rows, total, page: input.page, page_size: input.page_size };
  }
  async upload(
    user_id: string,
    input: { field_key: string; image_upload: ImageUpload },
  ) {
    // Keep each request below the serverless request limit, including base64 overhead.
    if (
      Buffer.byteLength(
        input.image_upload.data_url.split(',')[1] ?? '',
        'base64',
      ) > 3000000
    )
      throw new AppError(
        422,
        'VEHICLE_IMAGE_TOO_LARGE',
        'Choose an image smaller than 3 MB.',
      );
    await this.database.client.$transaction(
      (tx) => this.driver(tx, user_id),
      options,
    );
    const pdf = input.image_upload.data_url.startsWith('data:application/pdf;');
    if (pdf && ['front_image', 'back_image'].includes(input.field_key))
      throw new AppError(
        422,
        'VEHICLE_IMAGE_REQUIRED',
        'Vehicle front and back must be images.',
      );
    const converted = pdf
      ? input.image_upload.data_url
      : await convert_image_to_webp(input.image_upload);
    const bytes = Buffer.from(converted.split(',')[1]!, 'base64');
    if (
      pdf &&
      (bytes.toString('ascii', 0, 5) !== '%PDF-' ||
        !bytes.subarray(-2048).toString('ascii').includes('%%EOF') ||
        bytes.toString('base64') !== input.image_upload.data_url.split(',')[1])
    )
      throw new AppError(
        422,
        'VEHICLE_PDF_INVALID',
        'Choose a valid PDF document.',
      );
    if (bytes.length > 3000000)
      throw new AppError(
        422,
        'VEHICLE_IMAGE_TOO_LARGE',
        'Choose an image smaller than 3 MB.',
      );
    return this.database.client.$transaction(async (tx) => {
      await this.driver(tx, user_id);
      await tx.vehicleVerificationAsset.deleteMany({
        where: {
          owner_id: user_id,
          vehicle_id: null,
          created_at: { lt: new Date(Date.now() - 86400000) },
        },
      });
      const existing = await tx.vehicleVerificationAsset.findFirst({
        where: {
          owner_id: user_id,
          vehicle_id: null,
          field_key: input.field_key,
          bytes,
        },
        select: { id: true, file_name: true, field_key: true },
      });
      if (existing) return existing;
      if (
        (await tx.vehicleVerificationAsset.count({
          where: { owner_id: user_id, vehicle_id: null },
        })) >= 24
      )
        throw new AppError(
          422,
          'VEHICLE_UPLOAD_LIMIT',
          'Too many unused images. Submit your pending vehicle or retry after 24 hours.',
        );
      return tx.vehicleVerificationAsset.create({
        data: {
          owner_id: user_id,
          field_key: input.field_key,
          file_name: `${input.field_key}.${pdf ? 'pdf' : 'webp'}`,
          bytes,
        },
        select: { id: true, file_name: true, field_key: true },
      });
    }, options);
  }
  async asset(actor_id: string, id: string) {
    const actor = await this.database.client.user.findUnique({
      where: { id: actor_id },
      select: { role: true, status: true, deleted_at: true },
    });
    const asset = await this.database.client.vehicleVerificationAsset.findFirst(
      {
        where: {
          id,
          ...(actor?.role === 'ADMIN'
            ? { OR: [{ owner_id: actor_id }, { vehicle_id: { not: null } }] }
            : { owner_id: actor_id }),
        },
      },
    );
    if (!actor || actor.status !== 'ACTIVE' || actor.deleted_at || !asset)
      throw new AppError(
        404,
        'VEHICLE_ASSET_NOT_FOUND',
        'This attachment is unavailable.',
      );
    return {
      file_name: asset.file_name,
      mime_type: asset.file_name.endsWith('.pdf')
        ? 'application/pdf'
        : 'image/webp',
      data_url: `data:${asset.file_name.endsWith('.pdf') ? 'application/pdf' : 'image/webp'};base64,${Buffer.from(asset.bytes).toString('base64')}`,
    };
  }
  async discard_upload(user_id: string, id: string) {
    return this.database.client.$transaction(async (tx) => {
      await this.driver(tx, user_id);
      // Submitted images are retained even when replaced, preserving review history.
      const result = await tx.vehicleVerificationAsset.deleteMany({
        where: { id, owner_id: user_id, vehicle_id: null },
      });
      return { discarded: result.count > 0 };
    }, options);
  }
  async renew(
    user_id: string,
    id: string,
    input: { expected_version: number; field_key: string; asset_id: string },
  ) {
    return this.database.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
      const driver = await this.driver(tx, user_id);
      const vehicle = await tx.vehicle.findFirst({
        where: { id, driver_id: driver.id },
      });
      if (!vehicle)
        throw new AppError(
          404,
          'VEHICLE_NOT_FOUND',
          'This vehicle was not found.',
        );
      const fields = read_vehicle_fields(vehicle.verification_fields);
      const field = fields.find((v) => v.key === input.field_key);
      if (!field) throw conflict();
      if (field.value === input.asset_id)
        return { id, version: vehicle.verification_version };
      if (vehicle.verification_version !== input.expected_version)
        throw conflict();
      if (field.status !== 'APPROVED')
        throw new AppError(
          409,
          'VEHICLE_RENEWAL_UNAVAILABLE',
          'Use the existing correction form for a pending or rejected document.',
        );
      const trip = await tx.ride.findFirst({
        where: {
          vehicle_id: id,
          status: {
            in: [
              'DRIVER_ASSIGNED',
              'DRIVER_ARRIVING',
              'DRIVER_WAITING',
              'IN_PROGRESS',
            ],
          },
        },
        select: { id: true },
      });
      if (trip)
        throw new AppError(
          409,
          'VEHICLE_ON_TRIP',
          'Finish the current trip before replacing vehicle documents.',
        );
      const asset = await tx.vehicleVerificationAsset.findFirst({
        where: {
          id: input.asset_id,
          owner_id: user_id,
          field_key: input.field_key,
          vehicle_id: null,
        },
      });
      if (!asset)
        throw new AppError(
          422,
          'VEHICLE_ASSET_INVALID',
          'Upload this document again before submitting.',
        );
      const updated = fields.map((v) =>
        v.key === input.field_key
          ? {
              ...v,
              value: asset.id,
              display: asset.file_name,
              status: 'PENDING',
              reviewed_at: null,
              reviewed_by: null,
              rejection_reason: null,
            }
          : v,
      );
      await tx.vehicle.update({
        where: { id },
        data: {
          verification_fields: updated as unknown as Prisma.InputJsonValue,
          verification_version: { increment: 1 },
          status: 'UNDER_REVIEW',
        },
      });
      await tx.vehicleVerificationAsset.update({
        where: { id: asset.id },
        data: { vehicle_id: id },
      });
      if (driver.active_vehicle_id === id)
        await tx.driverProfile.update({
          where: { id: driver.id },
          data: {
            availability:
              driver.availability === 'SUSPENDED' ? 'SUSPENDED' : 'OFFLINE',
          },
        });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'Vehicle',
        entity_id: id,
        action: 'RENEW_VEHICLE_DOCUMENT',
        before_data: { field_key: field.key, asset_id: field.value },
        after_data: { field_key: field.key, asset_id: asset.id },
      });
      return { id, version: vehicle.verification_version + 1 };
    }, options);
  }
  async submit(user_id: string, input: VehicleSubmission, id?: string) {
    return this.database.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
      const profile = await this.driver(tx, user_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720049)`;
      const previous = id
        ? await tx.vehicle.findFirst({ where: { id, driver_id: profile.id } })
        : await tx.vehicle.findUnique({
            where: { registration_key: input.registration_key },
          });
      if (!id && previous) {
        if (previous.driver_id !== profile.id) throw conflict();
        if (!matches_vehicle_submission(previous.verification_fields, input))
          throw conflict();
        return previous;
      }
      if (id && !previous)
        throw new AppError(
          404,
          'VEHICLE_NOT_FOUND',
          'This vehicle was not found.',
        );
      if (
        id &&
        previous &&
        previous.verification_version === (input.expected_version ?? -2) + 1 &&
        matches_vehicle_submission(previous.verification_fields, input)
      )
        return previous;
      if (
        previous &&
        previous.verification_version > 0 &&
        (previous.status === 'ACTIVE' || previous.status === 'INACTIVE')
      )
        throw new AppError(
          409,
          'VEHICLE_LOCKED',
          'Approved vehicles cannot be edited. Contact your administrator.',
        );
      if (previous && previous.verification_version !== input.expected_version)
        throw conflict();
      if (previous && previous.verification_version === 0) {
        const active_ride = await tx.ride.findFirst({
          where: {
            vehicle_id: previous.id,
            status: {
              in: [
                'DRIVER_ASSIGNED',
                'DRIVER_ARRIVING',
                'DRIVER_WAITING',
                'IN_PROGRESS',
              ],
            },
          },
          select: { id: true },
        });
        if (active_ride)
          throw new AppError(
            409,
            'VEHICLE_ON_TRIP',
            'Finish the current ride before submitting vehicle verification.',
          );
        await tx.driverProfile.updateMany({
          where: { id: profile.id, active_vehicle_id: previous.id },
          data: { active_vehicle_id: null, availability: 'OFFLINE' },
        });
      }
      const brand = await tx.vehicleBrand.findUnique({
        where: { id: input.brand_id },
      });
      const model = await tx.vehicleModel.findUnique({
        where: { id: input.model_id },
      });
      const category = await tx.vehicleCategory.findUnique({
        where: { id: input.vehicle_category_id },
        include: { parent: true, _count: { select: { children: true } } },
      });
      if (
        !brand ||
        !model ||
        !usable(brand, user_id) ||
        !usable(model, user_id) ||
        model.brand_id !== brand.id
      )
        throw new AppError(
          422,
          'VEHICLE_CATALOG_UNAVAILABLE',
          'Choose a verified brand and model, or your own pending requests.',
        );
      if (
        !category ||
        !category.is_active ||
        category.parent?.is_active === false ||
        category._count.children ||
        category.vehicle_type !== model.vehicle_type ||
        category.capacity > model.seating_capacity
      )
        throw new AppError(
          422,
          'VEHICLE_CATEGORY_INCOMPATIBLE',
          'Choose an active category compatible with this model.',
        );
      // Older app versions stored spaces and hyphens in plates. Compare the
      // canonical value as well, so that formatting cannot register it twice.
      const [duplicate] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM vehicles
        WHERE regexp_replace(upper(plate_number), '[^A-Z0-9]', '', 'g') = ${input.plate_number}
          AND id <> ${previous?.id ?? ''}
        LIMIT 1
      `;
      if (duplicate && duplicate.id !== previous?.id)
        throw new AppError(
          409,
          'VEHICLE_PLATE_EXISTS',
          'This registration number is already registered.',
        );
      const old_fields = read_vehicle_fields(
        previous?.verification_fields ?? [],
      );
      const values: Record<string, string> = {
        brand_id: brand.id,
        model_id: model.id,
        vehicle_category_id: category.id,
        plate_number: input.plate_number,
        color: input.color,
        ...input.documents,
      };
      const displays: Record<string, string> = {
        brand_id: brand.name,
        model_id: model.name,
        vehicle_category_id: category.parent
          ? `${category.parent.name} / ${category.name}`
          : category.name,
      };
      const fields: VehicleField[] = Object.entries(vehicle_labels).map(
        ([key, label]) => {
          const before = old_fields.find((f) => f.key === key);
          if (before?.status === 'APPROVED' && before.value !== values[key])
            throw new AppError(
              409,
              'VEHICLE_FIELD_LOCKED',
              `${label} is already approved. Contact your administrator to change it.`,
            );
          if (before && before.value === values[key]) return before;
          return {
            key,
            label,
            value: values[key]!,
            display: displays[key] ?? values[key]!,
            status: 'PENDING',
            rejection_reason: null,
            reviewed_by: null,
            reviewed_at: null,
          };
        },
      );
      const assets = await tx.vehicleVerificationAsset.findMany({
        where: {
          id: { in: Object.values(input.documents) },
          owner_id: user_id,
          OR: [
            {
              vehicle_id: null,
              created_at: { gte: new Date(Date.now() - 86400000) },
            },
            ...(previous ? [{ vehicle_id: previous.id }] : []),
          ],
        },
        select: { id: true, field_key: true },
      });
      for (const key of vehicle_document_keys) {
        const asset = assets.find(
          (asset) =>
            asset.id === input.documents[key] && asset.field_key === key,
        );
        if (!asset)
          throw new AppError(
            422,
            'VEHICLE_ASSET_INVALID',
            `Upload a valid ${vehicle_labels[key]} image for this vehicle.`,
          );
      }
      const data = {
        brand_id: brand.id,
        model_id: model.id,
        make: brand.name,
        model: model.name,
        type: model.vehicle_type,
        capacity: model.seating_capacity,
        vehicle_category_id: category.id,
        plate_number: input.plate_number,
        color: input.color,
        verification_fields: fields as unknown as Prisma.InputJsonValue,
      };
      const vehicle = previous
        ? await tx.vehicle.update({
            where: { id: previous.id },
            data: {
              ...data,
              status: fields.some((f) => f.status === 'REJECTED')
                ? 'REJECTED'
                : 'UNDER_REVIEW',
              verification_version: { increment: 1 },
            },
          })
        : await tx.vehicle.create({
            data: {
              ...data,
              driver_id: profile.id,
              registration_key: input.registration_key,
              verification_version: 1,
            },
          });
      await tx.vehicleVerificationAsset.updateMany({
        where: {
          id: { in: Object.values(input.documents) },
          owner_id: user_id,
        },
        data: { vehicle_id: vehicle.id },
      });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'Vehicle',
        entity_id: vehicle.id,
        action: previous
          ? 'RESUBMIT_VEHICLE_VERIFICATION'
          : 'SUBMIT_VEHICLE_VERIFICATION',
        before_data: previous
          ? { version: previous.verification_version }
          : undefined,
        after_data: {
          version: vehicle.verification_version,
          fields: fields as unknown as Prisma.InputJsonValue,
        },
      });
      return vehicle;
    }, options);
  }
  async review(
    actor_id: string,
    user_id: string,
    id: string,
    input: VehicleReview,
  ) {
    return this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      await require_active_account(tx, user_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720049)`;
      await require_driver_participation(tx, user_id);
      const vehicle = await tx.vehicle.findFirst({
        where: { id, driver: { user_id } },
        include: { brand: true, catalog_model: true },
      });
      if (!vehicle)
        throw new AppError(
          404,
          'VEHICLE_NOT_FOUND',
          'This vehicle was not found.',
        );
      if (vehicle.verification_version !== input.expected_version)
        throw conflict();
      if (
        (vehicle.status === 'ACTIVE' || vehicle.status === 'INACTIVE') &&
        input.decision !== 'REJECTED'
      )
        throw new AppError(
          409,
          'VEHICLE_LOCKED',
          'This vehicle review is complete. Request a correction to reopen verification.',
        );
      if (vehicle.status === 'ACTIVE' || vehicle.status === 'INACTIVE') {
        const active_ride = await tx.ride.findFirst({
          where: {
            vehicle_id: id,
            status: {
              in: [
                'DRIVER_ASSIGNED',
                'DRIVER_ARRIVING',
                'DRIVER_WAITING',
                'IN_PROGRESS',
              ],
            },
          },
          select: { id: true },
        });
        if (active_ride)
          throw new AppError(
            409,
            'VEHICLE_ON_TRIP',
            'This vehicle is on a ride. Finish the ride before requesting re-verification.',
          );
      }
      const fields = read_vehicle_fields(vehicle.verification_fields);
      const field = fields.find((f) => f.key === input.field_key);
      if (!field)
        throw new AppError(
          422,
          'VEHICLE_FIELD_NOT_FOUND',
          'This field is unavailable for review.',
        );
      const before_field = { ...field };
      if (
        input.decision === 'APPROVED' &&
        ['brand_id', 'model_id'].includes(field.key)
      ) {
        const entry =
          field.key === 'brand_id' ? vehicle.brand : vehicle.catalog_model;
        if (!entry?.is_active || entry.status !== 'VERIFIED')
          throw new AppError(
            422,
            'CATALOG_REVIEW_REQUIRED',
            'Verify this catalog request in App > User > Vehicle Models before approving this field.',
          );
      }
      field.status = input.decision;
      field.rejection_reason =
        input.decision === 'REJECTED' ? input.rejection_reason! : null;
      field.reviewed_by = actor_id;
      field.reviewed_at = new Date().toISOString();
      const approved = has_approved_vehicle_fields(fields);
      if (approved) {
        const model = vehicle.catalog_model;
        const category = await tx.vehicleCategory.findUnique({
          where: { id: vehicle.vehicle_category_id! },
          include: { parent: true, _count: { select: { children: true } } },
        });
        if (
          !model ||
          model.brand_id !== vehicle.brand_id ||
          model.vehicle_type !== vehicle.type ||
          model.seating_capacity !== vehicle.capacity ||
          !category?.is_active ||
          category.parent?.is_active === false ||
          category._count.children > 0 ||
          category.vehicle_type !== vehicle.type ||
          category.capacity > vehicle.capacity
        )
          throw new AppError(
            422,
            'VEHICLE_CONFIGURATION_CHANGED',
            'The model or category configuration changed. Request a correction to the affected fields before approving this vehicle.',
          );
      }
      if (
        approved &&
        (!vehicle.brand?.is_active ||
          vehicle.brand.status !== 'VERIFIED' ||
          !vehicle.catalog_model?.is_active ||
          vehicle.catalog_model.status !== 'VERIFIED')
      )
        throw new AppError(
          422,
          'CATALOG_REVIEW_REQUIRED',
          'Brand and model must both be verified before vehicle approval.',
        );
      const status = approved
        ? 'ACTIVE'
        : fields.some((f) => f.status === 'REJECTED')
          ? 'REJECTED'
          : 'UNDER_REVIEW';
      const updated = await tx.vehicle.updateMany({
        where: { id, verification_version: input.expected_version },
        data: {
          status,
          verification_version: { increment: 1 },
          verification_fields: fields as unknown as Prisma.InputJsonValue,
        },
      });
      if (updated.count !== 1) throw conflict();
      if (
        (vehicle.status === 'ACTIVE' || vehicle.status === 'INACTIVE') &&
        input.decision === 'REJECTED'
      ) {
        await tx.driverProfile.updateMany({
          where: { id: vehicle.driver_id, active_vehicle_id: id },
          data: { active_vehicle_id: null, availability: 'OFFLINE' },
        });
      }
      if (approved) {
        const profile = await tx.driverProfile.findUniqueOrThrow({
          where: { id: vehicle.driver_id },
          include: { active_vehicle: { include: MATCHING_VEHICLE_INCLUDE } },
        });
        const current_category = profile.active_vehicle?.vehicle_category;
        const current_is_usable = is_vehicle_eligible(
          profile.active_vehicle,
          current_category
            ? {
                vehicle_category_id: current_category.id,
                vehicle_type: current_category.vehicle_type,
                category_snapshot: null,
              }
            : undefined,
          profile.id,
        );
        if (
          !current_is_usable &&
          !['EN_ROUTE', 'ON_TRIP'].includes(profile.availability)
        ) {
          await tx.driverProfile.update({
            where: { id: profile.id },
            data: { active_vehicle_id: id },
          });
        }
      }
      await create_user_log(tx, {
        actor_id,
        entity_type: 'Vehicle',
        entity_id: id,
        action: 'REVIEW_VEHICLE_FIELD',
        before_data: {
          field: before_field,
          vehicle_status: vehicle.status,
          version: input.expected_version,
        },
        after_data: {
          field_key: field.key,
          decision: field.status,
          rejection_reason: field.rejection_reason,
          vehicle_status: status,
          version: input.expected_version + 1,
        },
      });
      return present_vehicle(
        await tx.vehicle.findUniqueOrThrow({ where: { id }, include }),
      );
    }, options);
  }
}

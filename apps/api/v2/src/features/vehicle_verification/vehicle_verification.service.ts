import { Injectable } from '@nestjs/common';
import type { Vehicle } from '../vehicle_category/vehicle.rows.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import {
  requireActiveAccount,
  requireActiveAdmin,
  requireDriverParticipation,
} from '../../database/account-locks.js';
import { nextEntityId } from '../../database/entity-id.js';
import { insertUserLog } from '../../database/user-log.js';
import {
  findDriverActiveRide,
  findDriverMatchingProfile,
} from '../driver/sql/driver-profile.sql.js';
import { AppError } from '../../core/error.js';
import { convert_image_to_webp } from '../../infra/media/image_transform.js';
import type { ImageUpload } from '../../infra/media/image_upload.js';
import type { CatalogQuery } from '../vehicle_catalog/vehicle_catalog.type.js';
import {
  is_vehicle_eligible,
  type MatchingVehicle,
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
import {
  pendingVerificationAssets,
  readVerificationAsset,
  verificationBrandFields,
  verificationBrandFilter,
  verificationCategory,
  verificationModelFields,
  verificationModelFilter,
  verificationOwner,
  verificationVehicleById,
  verificationVehicles,
} from './sql/vehicle-verification-read.sql.js';

const sqlOptions = { checkoutMs: 10000, statementMs: 30000 };
type VerificationVehicle = MatchingVehicle & {
  verification_assets: { id: string; field_key: string; file_name: string }[];
};
const present_vehicle = (vehicle: VerificationVehicle) => ({
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

type VerificationCategory = {
  id: string;
  name: string;
  is_active: boolean;
  vehicle_type: string;
  capacity: number;
  parent: { name: string; is_active: boolean } | null;
  _count: { children: number };
};

type CatalogBrand = {
  id: string;
  name: string;
  status: string;
  is_active: boolean;
  requested_by_id: string | null;
};
type CatalogModel = CatalogBrand & {
  brand_id: string;
  vehicle_type: string;
  seating_capacity: number;
};

@Injectable()
export class VehicleVerificationService {
  constructor(private readonly db: PostgresService) {}

  private async ensureDriverProfile(tx: SqlClient, userId: string) {
    await requireActiveAccount(tx, userId);
    await tx.query('SELECT pg_advisory_xact_lock(720043,hashtext($1))', [
      userId,
    ]);
    await requireDriverParticipation(tx, userId);
    const {
      rows: [activated],
    } = await tx.query(
      "SELECT id FROM users WHERE id=$1 AND (role='DRIVER' OR partner_activated_at IS NOT NULL)",
      [userId],
    );
    if (!activated)
      throw new AppError(
        403,
        'PARTNER_ACTIVATION_REQUIRED',
        'Activate your driver account before registering a vehicle.',
      );
    await tx.query(
      `INSERT INTO driver_profiles (id,user_id,updated_at) VALUES ($1,$2,clock_timestamp())
      ON CONFLICT(user_id) DO NOTHING`,
      [nextEntityId(), userId],
    );
    const {
      rows: [profile],
    } = await tx.query<{ id: string; active_vehicle_id: string | null }>(
      'SELECT id,active_vehicle_id FROM driver_profiles WHERE user_id=$1',
      [userId],
    );
    if (!profile)
      throw new Error('Driver profile unavailable after registration');
    return profile;
  }
  async mine(user_id: string) {
    await this.db.transaction((tx) => this.ensureDriverProfile(tx, user_id));
    const result = await this.list(user_id);
    const { rows: pending_assets } = await this.db.query(
      pendingVerificationAssets,
      [user_id, new Date(Date.now() - 86400000)],
    );
    return { ...result, pending_assets };
  }
  async remove(user_id: string, id: string) {
    return this.db.transaction(
      async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
        const driver = await this.ensureDriverProfile(tx, user_id);
        const {
          rows: [vehicle],
        } = await tx.query<{ status: string; verification_version: number }>(
          'SELECT status,verification_version FROM vehicles WHERE id=$1 AND driver_id=$2',
          [id, driver.id],
        );
        if (!vehicle)
          throw new AppError(
            404,
            'VEHICLE_NOT_FOUND',
            'This vehicle was not found.',
          );
        if ((await tx.query(findDriverActiveRide, [driver.id])).rowCount)
          throw new AppError(
            409,
            'DRIVER_ON_TRIP',
            'Finish your current ride before removing a vehicle.',
          );
        if (vehicle.status !== 'INACTIVE') {
          const updated = await tx.query(
            `UPDATE vehicles SET status='INACTIVE',verification_version=verification_version+1,
            updated_at=clock_timestamp() WHERE id=$1 AND driver_id=$2 AND verification_version=$3`,
            [id, driver.id, vehicle.verification_version],
          );
          if (updated.rowCount !== 1) throw conflict();
        }
        const wasActive = driver.active_vehicle_id === id;
        if (wasActive)
          await tx.query(
            `UPDATE driver_profiles SET active_vehicle_id=NULL,availability='OFFLINE',updated_at=clock_timestamp()
            WHERE id=$1 AND active_vehicle_id=$2`,
            [driver.id, id],
          );
        await insertUserLog(tx, {
          actor_id: user_id,
          entity_type: 'Vehicle',
          entity_id: id,
          action: 'REMOVE_VEHICLE',
          before_data: { status: vehicle.status, active_vehicle: wasActive },
          after_data: {
            status: 'INACTIVE',
            active_vehicle: false,
            ride_history_retained: true,
          },
        });
        return { id, status: 'INACTIVE', removed: true };
      },
      'READ COMMITTED',
      sqlOptions,
    );
  }

  async list(user_id: string) {
    return this.db.transaction(async (tx) => {
      const {
        rows: [user],
      } = await tx.query<{ role: string; partner_activated_at: Date | null }>(
        verificationOwner,
        [user_id],
      );
      if (!user)
        throw new AppError(404, 'USER_NOT_FOUND', 'This user was not found.');
      if (user.role !== 'DRIVER' && !user.partner_activated_at)
        throw new AppError(
          403,
          'DRIVER_ACCOUNT_REQUIRED',
          'Vehicle verification is available for driver accounts only.',
        );
      const { rows } = await tx.query<{
        vehicle: Parameters<typeof present_vehicle>[0];
      }>(verificationVehicles, [user_id]);
      return {
        user,
        vehicles: rows.map(({ vehicle }) => present_vehicle(vehicle)),
      };
    }, 'REPEATABLE READ');
  }

  async catalog(user_id: string, input: CatalogQuery) {
    await this.db.transaction((tx) => this.ensureDriverProfile(tx, user_id));
    return this.db.transaction(async (tx) => {
      const model = !!input.brand_id;
      const params = model
        ? [user_id, input.query, input.brand_id]
        : [user_id, input.query];
      const where = model ? verificationModelFilter : verificationBrandFilter;
      const fields = model ? verificationModelFields : verificationBrandFields;
      const alias = model ? 'm' : 'b';
      const {
        rows: [count],
      } = await tx.query<{ total: number }>(
        `SELECT count(*)::int AS total ${where}`,
        params,
      );
      const { rows } = await tx.query(
        `SELECT ${fields} ${where} ORDER BY ${alias}.name,${alias}.id
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, input.page_size, (input.page - 1) * input.page_size],
      );
      return {
        rows,
        total: count?.total ?? 0,
        page: input.page,
        page_size: input.page_size,
      };
    }, 'REPEATABLE READ');
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
    await this.db.transaction((tx) => this.ensureDriverProfile(tx, user_id));
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
    return this.db.transaction(
      async (tx) => {
        await this.ensureDriverProfile(tx, user_id);
        await tx.query(
          'DELETE FROM vehicle_verification_assets WHERE owner_id=$1 AND vehicle_id IS NULL AND created_at<$2',
          [user_id, new Date(Date.now() - 86400000)],
        );
        const {
          rows: [existing],
        } = await tx.query<{
          id: string;
          file_name: string;
          field_key: string;
        }>(
          `SELECT id,file_name,field_key FROM vehicle_verification_assets
          WHERE owner_id=$1 AND vehicle_id IS NULL AND field_key=$2 AND bytes=$3 LIMIT 1`,
          [user_id, input.field_key, bytes],
        );
        if (existing) return existing;
        const {
          rows: [count],
        } = await tx.query<{ total: number }>(
          'SELECT count(*)::int AS total FROM vehicle_verification_assets WHERE owner_id=$1 AND vehicle_id IS NULL',
          [user_id],
        );
        if ((count?.total ?? 0) >= 24)
          throw new AppError(
            422,
            'VEHICLE_UPLOAD_LIMIT',
            'Too many unused images. Submit your pending vehicle or retry after 24 hours.',
          );
        const id = nextEntityId();
        const file_name = `${input.field_key}.${pdf ? 'pdf' : 'webp'}`;
        await tx.query(
          'INSERT INTO vehicle_verification_assets (id,owner_id,field_key,file_name,bytes) VALUES ($1,$2,$3,$4,$5)',
          [id, user_id, input.field_key, file_name, bytes],
        );
        return { id, file_name, field_key: input.field_key };
      },
      'READ COMMITTED',
      sqlOptions,
    );
  }

  async asset(actor_id: string, id: string) {
    const {
      rows: [asset],
    } = await this.db.query<{ file_name: string; bytes: Buffer }>(
      readVerificationAsset,
      [actor_id, id],
    );
    if (!asset)
      throw new AppError(
        404,
        'VEHICLE_ASSET_NOT_FOUND',
        'This attachment is unavailable.',
      );
    const mime_type = asset.file_name.endsWith('.pdf')
      ? 'application/pdf'
      : 'image/webp';
    return {
      file_name: asset.file_name,
      mime_type,
      data_url: `data:${mime_type};base64,${asset.bytes.toString('base64')}`,
    };
  }

  async discard_upload(user_id: string, id: string) {
    return this.db.transaction(
      async (tx) => {
        await this.ensureDriverProfile(tx, user_id);
        // Retain submitted images for verification history even when documents are replaced.
        const deleted = await tx.query(
          'DELETE FROM vehicle_verification_assets WHERE id=$1 AND owner_id=$2 AND vehicle_id IS NULL',
          [id, user_id],
        );
        return { discarded: Boolean(deleted.rowCount) };
      },
      'READ COMMITTED',
      sqlOptions,
    );
  }

  async renew(
    user_id: string,
    id: string,
    input: { expected_version: number; field_key: string; asset_id: string },
  ) {
    return this.db.transaction(
      async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
        const driver = await this.ensureDriverProfile(tx, user_id);
        const {
          rows: [vehicle],
        } = await tx.query<{
          verification_version: number;
          verification_fields: unknown;
        }>(
          'SELECT verification_version,verification_fields FROM vehicles WHERE id=$1 AND driver_id=$2',
          [id, driver.id],
        );
        if (!vehicle)
          throw new AppError(
            404,
            'VEHICLE_NOT_FOUND',
            'This vehicle was not found.',
          );
        const fields = read_vehicle_fields(vehicle.verification_fields);
        const field = fields.find((entry) => entry.key === input.field_key);
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
        const active = await tx.query(
          `SELECT id FROM rides WHERE vehicle_id=$1 AND
          status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_WAITING','IN_PROGRESS') LIMIT 1`,
          [id],
        );
        if (active.rowCount)
          throw new AppError(
            409,
            'VEHICLE_ON_TRIP',
            'Finish the current trip before replacing vehicle documents.',
          );

        const {
          rows: [asset],
        } = await tx.query<{ id: string; file_name: string }>(
          `SELECT id,file_name FROM vehicle_verification_assets
          WHERE id=$1 AND owner_id=$2 AND field_key=$3 AND vehicle_id IS NULL`,
          [input.asset_id, user_id, input.field_key],
        );
        if (!asset)
          throw new AppError(
            422,
            'VEHICLE_ASSET_INVALID',
            'Upload this document again before submitting.',
          );
        const updated = fields.map((entry) =>
          entry.key === input.field_key
            ? {
                ...entry,
                value: asset.id,
                display: asset.file_name,
                status: 'PENDING',
                reviewed_at: null,
                reviewed_by: null,
                rejection_reason: null,
              }
            : entry,
        );
        const saved = await tx.query(
          `UPDATE vehicles SET verification_fields=$3::jsonb,verification_version=verification_version+1,
          status='UNDER_REVIEW',updated_at=clock_timestamp() WHERE id=$1 AND verification_version=$2`,
          [id, vehicle.verification_version, JSON.stringify(updated)],
        );
        if (saved.rowCount !== 1) throw conflict();
        await tx.query(
          'UPDATE vehicle_verification_assets SET vehicle_id=$2 WHERE id=$1 AND owner_id=$3 AND vehicle_id IS NULL',
          [asset.id, id, user_id],
        );
        if (driver.active_vehicle_id === id)
          await tx.query(
            `UPDATE driver_profiles SET availability=CASE WHEN availability='SUSPENDED' THEN availability ELSE 'OFFLINE' END,
            updated_at=clock_timestamp() WHERE id=$1 AND active_vehicle_id=$2`,
            [driver.id, id],
          );
        await insertUserLog(tx, {
          actor_id: user_id,
          entity_type: 'Vehicle',
          entity_id: id,
          action: 'RENEW_VEHICLE_DOCUMENT',
          before_data: { field_key: field.key, asset_id: field.value },
          after_data: { field_key: field.key, asset_id: asset.id },
        });
        return { id, version: vehicle.verification_version + 1 };
      },
      'READ COMMITTED',
      sqlOptions,
    );
  }

  async submit(user_id: string, input: VehicleSubmission, id?: string) {
    return this.db.transaction(
      async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
        const profile = await this.ensureDriverProfile(tx, user_id);
        await tx.query('SELECT pg_advisory_xact_lock(720049)');
        const {
          rows: [previous],
        } = id
          ? await tx.query<Vehicle>(
              'SELECT * FROM vehicles WHERE id=$1 AND driver_id=$2',
              [id, profile.id],
            )
          : await tx.query<Vehicle>(
              'SELECT * FROM vehicles WHERE registration_key=$1',
              [input.registration_key],
            );
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
          previous.verification_version ===
            (input.expected_version ?? -2) + 1 &&
          matches_vehicle_submission(previous.verification_fields, input)
        )
          return previous;
        if (
          previous &&
          previous.verification_version !== input.expected_version
        )
          throw conflict();
        if (
          previous &&
          matches_vehicle_submission(previous.verification_fields, input)
        )
          return previous;
        if (previous) {
          if ((await tx.query(findDriverActiveRide, [profile.id])).rowCount)
            throw new AppError(
              409,
              'VEHICLE_ON_TRIP',
              'Finish your current ride before changing vehicle details.',
            );
        }
        const {
          rows: [brand],
        } = await tx.query<CatalogBrand>(
          'SELECT id,name,status,is_active,requested_by_id FROM vehicle_brands WHERE id=$1',
          [input.brand_id],
        );
        const {
          rows: [model],
        } = await tx.query<CatalogModel>(
          `SELECT id,name,status,is_active,requested_by_id,brand_id,vehicle_type,seating_capacity
          FROM vehicle_models WHERE id=$1`,
          [input.model_id],
        );
        const {
          rows: [category],
        } = await tx.query<VerificationCategory>(verificationCategory, [
          input.vehicle_category_id,
        ]);
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
        const {
          rows: [duplicate],
        } = await tx.query<{ id: string }>(
          `SELECT id FROM vehicles WHERE regexp_replace(upper(plate_number),'[^A-Z0-9]','','g')=$1
          AND id<>$2 LIMIT 1`,
          [input.plate_number, previous?.id ?? ''],
        );
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
        const ids = Object.values(input.documents);
        const { rows: assets } = await tx.query<{
          id: string;
          field_key: string;
        }>(
          `SELECT id,field_key FROM vehicle_verification_assets WHERE id=ANY($1::text[]) AND owner_id=$2
          AND ((vehicle_id IS NULL AND created_at>=$3) OR vehicle_id=$4)`,
          [ids, user_id, new Date(Date.now() - 86400000), previous?.id ?? null],
        );
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
        if (previous)
          await tx.query(
            `UPDATE driver_profiles SET active_vehicle_id=NULL,
            availability=CASE WHEN availability='SUSPENDED' THEN availability ELSE 'OFFLINE' END,
            updated_at=clock_timestamp() WHERE id=$1 AND active_vehicle_id=$2`,
            [profile.id, previous.id],
          );
        const vehicleData = [
          brand.id,
          model.id,
          brand.name,
          model.name,
          model.vehicle_type,
          model.seating_capacity,
          category.id,
          input.plate_number,
          input.color,
          JSON.stringify(fields),
        ];
        const {
          rows: [vehicle],
        } = previous
          ? await tx.query<Vehicle>(
              `UPDATE vehicles SET brand_id=$1,model_id=$2,make=$3,model=$4,type=$5,capacity=$6,
            vehicle_category_id=$7,plate_number=$8,color=$9,verification_fields=$10::jsonb,status=$11,
            verification_version=verification_version+1,updated_at=clock_timestamp()
            WHERE id=$12 AND verification_version=$13 RETURNING *`,
              [
                ...vehicleData,
                fields.some((field) => field.status === 'REJECTED')
                  ? 'REJECTED'
                  : 'UNDER_REVIEW',
                previous.id,
                previous.verification_version,
              ],
            )
          : await tx.query<Vehicle>(
              `INSERT INTO vehicles (brand_id,model_id,make,model,type,capacity,vehicle_category_id,
            plate_number,color,verification_fields,id,driver_id,registration_key,verification_version,updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,1,clock_timestamp()) RETURNING *`,
              [
                ...vehicleData,
                nextEntityId(),
                profile.id,
                input.registration_key,
              ],
            );
        if (!vehicle) throw conflict();
        await tx.query(
          'UPDATE vehicle_verification_assets SET vehicle_id=$2 WHERE id=ANY($1::text[]) AND owner_id=$3',
          [ids, vehicle.id, user_id],
        );
        await insertUserLog(tx, {
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
            fields,
          },
        });
        return vehicle;
      },
      'READ COMMITTED',
      sqlOptions,
    );
  }
  async review(
    actor_id: string,
    user_id: string,
    id: string,
    input: VehicleReview,
  ) {
    return this.db.transaction(
      async (tx) => {
        await requireActiveAdmin(tx, actor_id);
        await requireActiveAccount(tx, user_id);
        await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
        await tx.query('SELECT pg_advisory_xact_lock(720043,hashtext($1))', [
          user_id,
        ]);
        await tx.query('SELECT pg_advisory_xact_lock(720049)');
        await requireDriverParticipation(tx, user_id);
        const {
          rows: [vehicle],
        } = await tx.query<
          Vehicle & {
            brand: Pick<CatalogBrand, 'is_active' | 'status'> | null;
            catalog_model: Pick<
              CatalogModel,
              | 'is_active'
              | 'status'
              | 'brand_id'
              | 'vehicle_type'
              | 'seating_capacity'
            > | null;
          }
        >(
          `SELECT v.*,CASE WHEN b.id IS NOT NULL THEN jsonb_build_object('is_active',b.is_active,'status',b.status) END AS brand,
          CASE WHEN m.id IS NOT NULL THEN jsonb_build_object('is_active',m.is_active,'status',m.status,
            'brand_id',m.brand_id,'vehicle_type',m.vehicle_type,'seating_capacity',m.seating_capacity) END AS catalog_model
          FROM vehicles v JOIN driver_profiles p ON p.id=v.driver_id LEFT JOIN vehicle_brands b ON b.id=v.brand_id
          LEFT JOIN vehicle_models m ON m.id=v.model_id WHERE v.id=$1 AND p.user_id=$2`,
          [id, user_id],
        );
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
          const active_ride = await tx.query(
            `SELECT id FROM rides WHERE vehicle_id=$1 AND
            status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_WAITING','IN_PROGRESS') LIMIT 1`,
            [id],
          );
          if (active_ride.rowCount)
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
          const {
            rows: [category],
          } = await tx.query<VerificationCategory>(verificationCategory, [
            vehicle.vehicle_category_id,
          ]);
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
        const updated = await tx.query(
          `UPDATE vehicles SET status=$3,verification_version=verification_version+1,
          verification_fields=$4::jsonb,updated_at=clock_timestamp() WHERE id=$1 AND verification_version=$2`,
          [id, input.expected_version, status, JSON.stringify(fields)],
        );
        if (updated.rowCount !== 1) throw conflict();
        if (
          (vehicle.status === 'ACTIVE' || vehicle.status === 'INACTIVE') &&
          input.decision === 'REJECTED'
        ) {
          await tx.query(
            `UPDATE driver_profiles SET active_vehicle_id=NULL,availability='OFFLINE',updated_at=clock_timestamp()
            WHERE id=$1 AND active_vehicle_id=$2`,
            [vehicle.driver_id, id],
          );
        }
        if (approved) {
          const {
            rows: [profile],
          } = await tx.query<{
            id: string;
            availability: string;
            active_vehicle: Parameters<typeof present_vehicle>[0] | null;
          }>(findDriverMatchingProfile, [user_id]);
          if (!profile)
            throw new Error('Driver profile unavailable during vehicle review');
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
            await tx.query(
              'UPDATE driver_profiles SET active_vehicle_id=$2,updated_at=clock_timestamp() WHERE id=$1',
              [profile.id, id],
            );
          }
        }
        await insertUserLog(tx, {
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
        const {
          rows: [saved],
        } = await tx.query<{ vehicle: Parameters<typeof present_vehicle>[0] }>(
          verificationVehicleById,
          [id],
        );
        if (!saved) throw conflict();
        return present_vehicle(saved.vehicle);
      },
      'READ COMMITTED',
      sqlOptions,
    );
  }
}

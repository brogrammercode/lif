import assert from 'node:assert/strict';
import { it } from 'node:test';
import sharp from 'sharp';
import { PrismaService } from '../infra/database/prisma.service.js';
import { AppError } from '../core/error.js';
import { VehicleVerificationService } from '../features/vehicle_verification/vehicle_verification.service.js';
import {
  has_approved_vehicle_fields,
  matches_vehicle_submission,
  vehicle_labels,
  vehicle_review,
  vehicle_submission,
} from '../features/vehicle_verification/vehicle_verification.type.js';
import { is_vehicle_eligible } from '../features/vehicle_category/vehicle_category.security.js';

const key = 'd09a9a92-6dbb-4288-b651-cb121b986a03';
function input() {
  return vehicle_submission.parse({
    registration_key: key,
    expected_version: 4,
    brand_id: 'brand',
    model_id: 'model',
    vehicle_category_id: 'category',
    plate_number: 'br-01 aa 1234',
    color: 'Red',
    documents: Object.fromEntries(
      [
        'front_image',
        'back_image',
        'rc_front',
        'rc_back',
        'insurance',
        'pollution',
      ].map((k) => [k, `asset-${k}`]),
    ),
  });
}
function fixture(existing = true) {
  const brand = {
    id: 'brand',
    name: 'Brand',
    status: 'VERIFIED',
    is_active: true,
    requested_by_id: 'someone-else',
  };
  const model = {
    id: 'model',
    brand_id: 'brand',
    name: 'Model',
    vehicle_type: 'BIKE',
    seating_capacity: 1,
    status: 'VERIFIED',
    is_active: true,
    requested_by_id: 'someone-else',
  };
  const category = {
    id: 'category',
    name: 'Bike',
    parent: null,
    is_active: true,
    vehicle_type: 'BIKE',
    capacity: 1,
    _count: { children: 0 },
  };
  const submission = input();
  const values: Record<string, string> = {
    ...submission,
    ...submission.documents,
  } as unknown as Record<string, string>;
  const fields = Object.entries(vehicle_labels).map(([k, label]) => ({
    key: k,
    label,
    value: values[k],
    display: values[k],
    status: k === 'color' ? 'PENDING' : 'APPROVED',
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
  }));
  const vehicle = {
    id: 'vehicle',
    driver_id: 'profile',
    registration_key: key,
    verification_version: 4,
    verification_fields: fields,
    status: 'UNDER_REVIEW',
    brand_id: 'brand',
    model_id: 'model',
    type: 'BIKE',
    capacity: 1,
    vehicle_category_id: 'category',
    plate_number: 'BR01AA1234',
    color: 'Red',
    make: 'Brand',
    model: 'Model',
    brand,
    catalog_model: model,
    vehicle_category: category,
  };
  const state = {
    vehicle: existing ? vehicle : null,
    profile: {
      id: 'profile',
      user_id: 'driver',
      availability: 'OFFLINE',
      active_vehicle_id: 'legacy',
      active_vehicle: {
        ...vehicle,
        id: 'legacy',
        verification_version: 0,
        status: 'UNDER_REVIEW',
      },
    },
    assets: Object.entries(submission.documents).map(([field_key, id]) => ({
      id,
      field_key,
      owner_id: 'driver',
      vehicle_id: existing ? 'vehicle' : null,
      file_name: `${field_key}.webp`,
      bytes: Buffer.from('image'),
      created_at: new Date(),
    })),
    audits: [] as unknown[],
    writes: 0,
    role: 'DRIVER',
    activated: true,
    exited: false,
    activeRide: false,
  };
  const writeVehicle = (data: Record<string, unknown>) => {
    if (!state.vehicle) throw new Error('Missing vehicle');
    const version = data.verification_version as
      { increment?: number } | number | undefined;
    Object.assign(state.vehicle, data, {
      verification_version:
        typeof version === 'object'
          ? state.vehicle.verification_version + (version.increment ?? 0)
          : (version ?? state.vehicle.verification_version),
    });
    state.writes++;
    return state.vehicle;
  };
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => (state.vehicle ? [{ id: state.vehicle.id }] : []),
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        role: where.id === 'admin' ? 'ADMIN' : state.role,
        status: 'ACTIVE',
        deleted_at: null,
      }),
      findUniqueOrThrow: async () => ({
        role: state.role,
        partner_activated_at: state.activated ? new Date() : null,
      }),
    },
    partnerApplication: {
      findUnique: async () => ({
        status: state.exited ? 'EXITED' : 'ACTIVATED',
      }),
    },
    driverProfile: {
      upsert: async () => state.profile,
      findUniqueOrThrow: async () => state.profile,
      updateMany: async ({
        where,
        data,
      }: {
        where: { active_vehicle_id: string };
        data: Record<string, unknown>;
      }) => {
        if (state.profile.active_vehicle_id !== where.active_vehicle_id)
          return { count: 0 };
        Object.assign(state.profile, data);
        return { count: 1 };
      },
      update: async ({ data }: { data: Record<string, unknown> }) =>
        Object.assign(state.profile, data),
    },
    vehicleBrand: { findUnique: async () => brand },
    vehicleModel: { findUnique: async () => model },
    vehicleCategory: { findUnique: async () => category },
    ride: { findFirst: async () => (state.activeRide ? { id: 'ride' } : null) },
    vehicle: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; driver_id?: string };
      }) =>
        where.id === state.vehicle?.id ? structuredClone(state.vehicle) : null,
      findUnique: async () => structuredClone(state.vehicle),
      findUniqueOrThrow: async () => state.vehicle,
      update: async ({ data }: { data: Record<string, unknown> }) =>
        writeVehicle(data),
      updateMany: async ({
        where,
        data,
      }: {
        where: { verification_version: number };
        data: Record<string, unknown>;
      }) => {
        if (state.vehicle?.verification_version !== where.verification_version)
          return { count: 0 };
        writeVehicle(data);
        return { count: 1 };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.vehicle = { ...vehicle, ...data } as typeof vehicle;
        state.writes++;
        return state.vehicle;
      },
    },
    vehicleVerificationAsset: {
      findMany: async ({
        where,
      }: {
        where: {
          owner_id: string;
          id: { in: string[] };
          OR: {
            vehicle_id: string | null;
            created_at?: { gte: Date };
          }[];
        };
      }) =>
        state.assets.filter(
          (a) =>
            a.owner_id === where.owner_id &&
            where.id.in.includes(a.id) &&
            where.OR.some(
              (rule) =>
                rule.vehicle_id === a.vehicle_id &&
                (!rule.created_at || a.created_at >= rule.created_at.gte),
            ),
        ),
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string;
          owner_id?: string;
          field_key?: string;
          vehicle_id?: unknown;
          bytes?: Uint8Array;
        };
      }) =>
        state.assets.find(
          (a) =>
            (!where.id || a.id === where.id) &&
            (!where.owner_id || a.owner_id === where.owner_id) &&
            (!where.field_key || a.field_key === where.field_key) &&
            (where.vehicle_id !== null || a.vehicle_id === null) &&
            (!where.bytes ||
              Buffer.from(a.bytes).equals(Buffer.from(where.bytes))),
        ) ?? null,
      deleteMany: async ({
        where,
      }: {
        where: { id?: string; owner_id: string; vehicle_id: null };
      }) => {
        if (!where.id) return { count: 0 };
        const old = state.assets.length;
        state.assets = state.assets.filter(
          (a) =>
            !(
              a.id === where.id &&
              a.owner_id === where.owner_id &&
              a.vehicle_id === null
            ),
        );
        return { count: old - state.assets.length };
      },
      count: async () =>
        state.assets.filter((a) => a.vehicle_id === null).length,
      create: async ({
        data,
      }: {
        data: {
          owner_id: string;
          field_key: string;
          file_name: string;
          bytes: Buffer<ArrayBuffer>;
        };
      }) => {
        const asset = {
          ...data,
          id: `upload-${state.assets.length}`,
          vehicle_id: null,
          created_at: new Date(),
        };
        state.assets.push(asset);
        return asset;
      },
      updateMany: async () => ({ count: 6 }),
    },
    userLog: {
      create: async ({ data }: { data: unknown }) => {
        state.audits.push(data);
        return {};
      },
    },
  };
  const database = new PrismaService();
  Object.defineProperty(database, 'client', {
    value: {
      $transaction: async (
        action: (transaction: typeof tx) => Promise<unknown>,
      ) => action(tx),
      ...tx,
    },
  });
  return {
    state,
    brand,
    model,
    category,
    vehicle,
    service: new VehicleVerificationService(database),
  };
}
const code = (expected: string) => (error: unknown) =>
  error instanceof AppError && error.error_code === expected;

it('normalizes plates and rejects empty plates or missing rejection reasons', () => {
  assert.equal(input().plate_number, 'BR01AA1234');
  assert.equal(
    vehicle_submission.safeParse({ ...input(), plate_number: ' --- ' }).success,
    false,
  );
  assert.equal(
    vehicle_review.safeParse({
      expected_version: 4,
      field_key: 'color',
      decision: 'REJECTED',
      rejection_reason: ' ',
    }).success,
    false,
  );
});
it('requires exactly one approval for every known vehicle field', () => {
  const { vehicle } = fixture();
  const fields = vehicle.verification_fields.map((f) => ({
    ...f,
    status: 'APPROVED',
  }));
  assert.equal(has_approved_vehicle_fields(fields), true);
  assert.equal(
    has_approved_vehicle_fields([...fields.slice(1), fields[1]]),
    false,
  );
  assert.equal(has_approved_vehicle_fields(fields.slice(1)), false);
});
it('deduplicates an identical create retry but rejects changed retry payloads', async () => {
  const { state, service } = fixture();
  await service.submit('driver', input());
  assert.equal(state.writes, 0);
  await assert.rejects(
    service.submit('driver', { ...input(), color: 'Blue' }),
    code('VEHICLE_VERIFICATION_CONFLICT'),
  );
});
it('recognizes a committed correction retry without resetting later reviews', async () => {
  const { state, service } = fixture();
  state.vehicle!.verification_version = 5;
  state.vehicle!.verification_fields[4]!.status = 'APPROVED';
  await service.submit('driver', input(), 'vehicle');
  assert.equal(state.writes, 0);
  assert.equal(state.vehicle!.verification_fields[4]!.status, 'APPROVED');
});
it('rejects stale corrections and changes to previously approved values', async () => {
  const { service } = fixture();
  await assert.rejects(
    service.submit('driver', { ...input(), expected_version: 2 }, 'vehicle'),
    code('VEHICLE_VERIFICATION_CONFLICT'),
  );
  await assert.rejects(
    service.submit(
      'driver',
      { ...input(), plate_number: 'BR02AA4321' },
      'vehicle',
    ),
    code('VEHICLE_FIELD_LOCKED'),
  );
});
it('allows own requested catalog entries but never other drivers pending entries', async () => {
  const { service, brand, model, state } = fixture(false);
  Object.assign(brand, { status: 'REQUESTED', requested_by_id: 'driver' });
  Object.assign(model, { status: 'REQUESTED', requested_by_id: 'driver' });
  await service.submit('driver', input());
  assert.equal(state.vehicle!.status, 'UNDER_REVIEW');
  assert.equal(brand.status, 'REQUESTED');
  const other = fixture(false);
  Object.assign(other.brand, {
    status: 'REQUESTED',
    requested_by_id: 'other-driver',
  });
  await assert.rejects(
    other.service.submit('driver', input()),
    code('VEHICLE_CATALOG_UNAVAILABLE'),
  );
});
it('rejects foreign document ownership and prevents premature catalog approval', async () => {
  const f = fixture(false);
  f.state.assets[0]!.owner_id = 'other-driver';
  await assert.rejects(
    f.service.submit('driver', input()),
    code('VEHICLE_ASSET_INVALID'),
  );
  const review = fixture();
  review.brand.status = 'REQUESTED';
  await assert.rejects(
    review.service.review('admin', 'driver', 'vehicle', {
      expected_version: 4,
      field_key: 'brand_id',
      decision: 'APPROVED',
    }),
    code('CATALOG_REVIEW_REQUIRED'),
  );
});
it('finishes the review and replaces an unusable legacy selection', async () => {
  const { service, state } = fixture();
  const result = await service.review('admin', 'driver', 'vehicle', {
    expected_version: 4,
    field_key: 'color',
    decision: 'APPROVED',
  });
  assert.equal(state.vehicle!.status, 'ACTIVE');
  assert.equal(state.vehicle!.verification_version, 5);
  assert.equal(state.profile.active_vehicle_id, 'vehicle');
  assert.equal(state.audits.length, 1);
  assert.equal(result.is_eligible, true);
});
it('does not switch vehicles during an active trip', async () => {
  const { service, state } = fixture();
  state.profile.availability = 'ON_TRIP';
  await service.review('admin', 'driver', 'vehicle', {
    expected_version: 4,
    field_key: 'color',
    decision: 'APPROVED',
  });
  assert.equal(state.profile.active_vehicle_id, 'legacy');
});
it('reopens an approved vehicle for corrections and removes its active selection', async () => {
  const { state, service } = fixture();
  state.vehicle!.status = 'ACTIVE';
  state.vehicle!.verification_fields.forEach((f) => (f.status = 'APPROVED'));
  state.profile.active_vehicle_id = 'vehicle';
  state.profile.availability = 'AVAILABLE';
  const result = await service.review('admin', 'driver', 'vehicle', {
    expected_version: 4,
    field_key: 'insurance',
    decision: 'REJECTED',
    rejection_reason: 'Please provide the renewed policy.',
  });
  assert.equal(state.vehicle!.status, 'REJECTED');
  assert.equal(state.profile.active_vehicle_id, null);
  assert.equal(state.profile.availability, 'OFFLINE');
  assert.equal(result.is_eligible, false);
});
it('rejects expired pending attachments but retains older submitted documents for corrections', async () => {
  const pending = fixture(false);
  pending.state.assets[0]!.created_at = new Date(Date.now() - 86400001);
  await assert.rejects(
    pending.service.submit('driver', input()),
    code('VEHICLE_ASSET_INVALID'),
  );
  assert.equal(pending.state.writes, 0);
  const bound = fixture();
  bound.state.assets.forEach((asset) => {
    asset.created_at = new Date(Date.now() - 7 * 86400000);
  });
  await bound.service.submit(
    'driver',
    { ...input(), color: 'Blue' },
    'vehicle',
  );
  assert.equal(bound.state.vehicle!.color, 'Blue');
});
it('does not interrupt an active ride when reopening vehicle verification', async () => {
  const { state, service } = fixture();
  state.vehicle!.status = 'ACTIVE';
  state.activeRide = true;
  await assert.rejects(
    service.review('admin', 'driver', 'vehicle', {
      expected_version: 4,
      field_key: 'insurance',
      decision: 'REJECTED',
      rejection_reason: 'New policy needed.',
    }),
    code('VEHICLE_ON_TRIP'),
  );
  assert.equal(state.writes, 0);
  assert.equal(state.vehicle!.status, 'ACTIVE');
});
it('preserves correction reasons and rejects stale field reviews', async () => {
  const { service, state } = fixture();
  await service.review('admin', 'driver', 'vehicle', {
    expected_version: 4,
    field_key: 'color',
    decision: 'REJECTED',
    rejection_reason: 'Match the RC color.',
  });
  assert.equal(state.vehicle!.status, 'REJECTED');
  assert.equal(
    state.vehicle!.verification_fields[4]!.rejection_reason,
    'Match the RC color.',
  );
  await assert.rejects(
    service.review('admin', 'driver', 'vehicle', {
      expected_version: 4,
      field_key: 'color',
      decision: 'APPROVED',
    }),
    code('VEHICLE_VERIFICATION_CONFLICT'),
  );
});
it('blocks driver writes after exit or before activation', async () => {
  const f = fixture(false);
  f.state.exited = true;
  await assert.rejects(
    f.service.submit('driver', input()),
    code('DRIVER_EXITED'),
  );
  f.state.exited = false;
  f.state.role = 'RIDER';
  f.state.activated = false;
  await assert.rejects(
    f.service.submit('driver', input()),
    code('PARTNER_ACTIVATION_REQUIRED'),
  );
});
it('checks current catalog state and field approval when matching verified vehicles', () => {
  const { vehicle, brand, model } = fixture();
  vehicle.status = 'ACTIVE';
  vehicle.verification_fields.forEach((f) => (f.status = 'APPROVED'));
  const matching = vehicle as unknown as Parameters<
    typeof is_vehicle_eligible
  >[0];
  const quote = {
    vehicle_category_id: 'category',
    vehicle_type: 'BIKE' as const,
    category_snapshot: null,
  };
  assert.equal(is_vehicle_eligible(matching, quote, 'profile'), true);
  brand.is_active = false;
  assert.equal(is_vehicle_eligible(matching, quote, 'profile'), false);
  brand.is_active = true;
  model.status = 'REJECTED';
  assert.equal(is_vehicle_eligible(matching, quote, 'profile'), false);
  model.status = 'VERIFIED';
  vehicle.verification_fields[0]!.status = 'REJECTED';
  assert.equal(is_vehicle_eligible(matching, quote, 'profile'), false);
});
it('rejects changed payloads when matching a submission replay', () => {
  const { vehicle } = fixture();
  assert.equal(
    matches_vehicle_submission(vehicle.verification_fields, input()),
    true,
  );
  assert.equal(
    matches_vehicle_submission(vehicle.verification_fields, {
      ...input(),
      documents: { ...input().documents, insurance: 'different' },
    }),
    false,
  );
});
it('rejects source images above the mobile limit before converting or opening transactions', async () => {
  const { service } = fixture(false);
  await assert.rejects(
    service.upload('driver', {
      field_key: 'insurance',
      image_upload: {
        file_name: 'big.png',
        data_url: `data:image/png;base64,${Buffer.alloc(3000001).toString('base64')}`,
      },
    }),
    code('VEHICLE_IMAGE_TOO_LARGE'),
  );
});
it('discards only owned unused uploads and preserves submitted or foreign images', async () => {
  const { service, state } = fixture(false);
  state.assets[1]!.owner_id = 'someone-else';
  state.assets[2]!.vehicle_id = 'vehicle';
  assert.deepEqual(
    await service.discard_upload('driver', state.assets[1]!.id),
    { discarded: false },
  );
  assert.deepEqual(
    await service.discard_upload('driver', state.assets[2]!.id),
    { discarded: false },
  );
  const id = state.assets[0]!.id;
  assert.deepEqual(await service.discard_upload('driver', id), {
    discarded: true,
  });
  assert.equal(
    state.assets.some((asset) => asset.id === id),
    false,
  );
});
it('reuses a pending converted image on an upload retry', async () => {
  const { service, state } = fixture(false);
  state.assets = [];
  const source = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  })
    .png()
    .toBuffer();
  const image_upload = {
    file_name: 'tiny.png',
    data_url: `data:image/png;base64,${source.toString('base64')}`,
  };
  const first = await service.upload('driver', {
    field_key: 'front_image',
    image_upload,
  });
  const again = await service.upload('driver', {
    field_key: 'front_image',
    image_upload,
  });
  assert.equal(first.id, again.id);
  assert.equal(state.assets.length, 1);
});

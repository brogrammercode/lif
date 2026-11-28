import assert from 'node:assert/strict';
import { it } from 'node:test';
import sharp from 'sharp';
import type { PostgresService } from '../database/postgres.service.js';
import { AppError } from '../core/error.js';
import { VehicleVerificationService } from '../features/vehicle_verification/vehicle_verification.service.js';
import {
  has_approved_vehicle_fields,
  matches_vehicle_submission,
  vehicle_labels,
  vehicle_review,
  vehicle_submission,
  vehicle_asset,
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
  const query = async (sql: string, params: unknown[] = []) => {
    const [first, second, third, fourth] = params;
    const result = (rows: unknown[]) => ({ rows, rowCount: rows.length });
    if (sql.includes('pg_advisory_xact_lock')) return result([]);
    if (sql.includes('SELECT status, deleted_at, role FROM users'))
      return result([
        {
          role: first === 'admin' ? 'ADMIN' : state.role,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
    if (sql.includes('FROM partner_applications'))
      return result([{ status: state.exited ? 'EXITED' : 'ACTIVATED' }]);
    if (sql.startsWith('SELECT id FROM users'))
      return result(
        state.role === 'DRIVER' || state.activated ? [{ id: first }] : [],
      );
    if (sql.startsWith('INSERT INTO driver_profiles')) return result([]);
    if (
      sql.startsWith('SELECT id,active_vehicle_id FROM driver_profiles') ||
      sql.includes('AS active_vehicle')
    )
      return result([state.profile]);
    if (sql.includes('FROM rides'))
      return result(state.activeRide ? [{ id: 'ride' }] : []);
    if (sql.includes('FROM vehicle_categories c')) return result([category]);
    if (sql.includes('FROM vehicle_models WHERE')) return result([model]);
    if (sql.includes('FROM vehicle_brands WHERE')) return result([brand]);
    if (sql.includes('WHERE regexp_replace')) return result([]);
    if (sql.startsWith('SELECT * FROM vehicles WHERE registration_key'))
      return result(
        state.vehicle?.registration_key === first
          ? [structuredClone(state.vehicle)]
          : [],
      );
    if (sql.includes('FROM vehicles')) {
      const current =
        state.vehicle?.id === first ? structuredClone(state.vehicle) : null;
      return result(
        current
          ? [sql.includes('AS vehicle') ? { vehicle: current } : current]
          : [],
      );
    }
    if (sql.startsWith('UPDATE driver_profiles')) {
      if (
        sql.includes('active_vehicle_id=NULL') &&
        state.profile.active_vehicle_id === second
      ) {
        Object.assign(state.profile, {
          active_vehicle_id: null,
          availability:
            state.profile.availability === 'SUSPENDED'
              ? 'SUSPENDED'
              : 'OFFLINE',
        });
      } else if (sql.includes('active_vehicle_id=$2,updated_at')) {
        state.profile.active_vehicle_id = second as string;
      } else if (
        sql.includes("availability=CASE WHEN availability='SUSPENDED'") &&
        state.profile.availability !== 'SUSPENDED'
      ) {
        state.profile.availability = 'OFFLINE';
      }
      return result([]);
    }
    if (
      sql.startsWith('INSERT INTO vehicles') ||
      sql.startsWith('UPDATE vehicles SET brand_id')
    ) {
      const data = {
        brand_id: first,
        model_id: second,
        make: third,
        model: fourth,
        type: params[4],
        capacity: params[5],
        vehicle_category_id: params[6],
        plate_number: params[7],
        color: params[8],
        verification_fields: JSON.parse(String(params[9])),
      };
      if (sql.startsWith('INSERT INTO vehicles')) {
        state.vehicle = {
          ...vehicle,
          ...data,
          id: params[10],
          driver_id: params[11],
          registration_key: params[12],
          verification_version: 1,
        } as typeof vehicle;
        state.writes++;
        return result([state.vehicle]);
      }
      return result([
        writeVehicle({
          ...data,
          status: params[10],
          verification_version: { increment: 1 },
        }),
      ]);
    }
    if (
      sql.startsWith('UPDATE vehicles SET verification_fields') ||
      sql.startsWith('UPDATE vehicles SET status=$3')
    ) {
      const renewal = sql.startsWith('UPDATE vehicles SET verification_fields');
      if (
        state.vehicle?.id !== first ||
        state.vehicle?.verification_version !== second
      )
        return result([]);
      return result([
        writeVehicle({
          status: renewal ? 'UNDER_REVIEW' : third,
          verification_fields: JSON.parse(String(renewal ? third : fourth)),
          verification_version: { increment: 1 },
        }),
      ]);
    }
    if (sql.includes('FROM vehicle_verification_assets')) {
      if (sql.includes('id=ANY')) {
        const ids = first as string[];
        return result(
          state.assets.filter(
            (row) =>
              row.owner_id === second &&
              ids.includes(row.id) &&
              ((row.vehicle_id === null && row.created_at >= (third as Date)) ||
                (fourth && row.vehicle_id === fourth)),
          ),
        );
      }
      if (sql.startsWith('SELECT id,file_name FROM'))
        return result(
          state.assets.filter(
            (row) =>
              row.id === first &&
              row.owner_id === second &&
              row.field_key === third &&
              row.vehicle_id === null,
          ),
        );
      const pending = state.assets.filter(
        (row) => row.owner_id === first && row.vehicle_id === null,
      );
      if (sql.startsWith('SELECT count'))
        return result([{ total: pending.length }]);
      if (sql.startsWith('SELECT id,file_name,field_key'))
        return result(
          pending.filter(
            (row) =>
              row.field_key === second && row.bytes.equals(third as Buffer),
          ),
        );
      if (sql.includes('WHERE id=$1 AND owner_id=$2')) {
        const previous = state.assets.length;
        state.assets = state.assets.filter(
          (row) =>
            row.id !== first ||
            row.owner_id !== second ||
            row.vehicle_id !== null,
        );
        return { rows: [], rowCount: previous - state.assets.length };
      }
      if (sql.startsWith('DELETE FROM vehicle_verification_assets'))
        return result([]);
    }
    if (sql.startsWith('INSERT INTO vehicle_verification_assets')) {
      const [id, owner_id, field_key, file_name, bytes] = params as [
        string,
        string,
        string,
        string,
        Buffer<ArrayBuffer>,
      ];
      state.assets.push({
        id,
        owner_id,
        field_key,
        file_name,
        bytes,
        vehicle_id: null,
        created_at: new Date(),
      });
      return result([]);
    }
    if (sql.startsWith('UPDATE vehicle_verification_assets')) {
      const ids = Array.isArray(first) ? first : [first];
      for (const row of state.assets) {
        if (ids.includes(row.id) && row.owner_id === third)
          row.vehicle_id = second as string;
      }
      return result([]);
    }
    if (sql.startsWith('INSERT INTO user_logs')) {
      state.audits.push(params);
      return result([]);
    }
    throw new Error('Unexpected vehicle verification fixture query: ' + sql);
  };
  const postgres = {
    transaction: (work: (client: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService;
  return {
    state,
    brand,
    model,
    category,
    vehicle,
    service: new VehicleVerificationService(postgres),
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
it('rejects stale vehicle corrections', async () => {
  const { service } = fixture();
  await assert.rejects(
    service.submit('driver', { ...input(), expected_version: 2 }, 'vehicle'),
    code('VEHICLE_VERIFICATION_CONFLICT'),
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

it('vehicle documents accept genuine PDF while front/back remain image-only', async () => {
  const f = fixture();
  const bytes = Buffer.from('%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF\n');
  const upload = {
    file_name: 'insurance.pdf',
    data_url: 'data:application/pdf;base64,' + bytes.toString('base64'),
  };
  assert.equal(
    vehicle_asset.safeParse({ field_key: 'front_image', image_upload: upload })
      .success,
    false,
  );
  const asset = await f.service.upload(
    'driver',
    vehicle_asset.parse({ field_key: 'insurance', image_upload: upload }),
  );
  assert.equal(asset.file_name, 'insurance.pdf');
  assert.ok(
    f.state.assets.some(
      (v) => v.id === asset.id && Buffer.from(v.bytes).equals(bytes),
    ),
  );
  await assert.rejects(
    () =>
      f.service.upload('driver', {
        field_key: 'insurance',
        image_upload: {
          ...upload,
          data_url:
            'data:application/pdf;base64,' +
            Buffer.from('%PDF-invalid').toString('base64'),
        },
      }),
    { error_code: 'VEHICLE_PDF_INVALID' },
  );
});

it('manual document renewal preserves other reviews, blocks active trips and safely replays', async () => {
  const f = fixture();
  const vehicle = f.state.vehicle!;
  f.state.profile.active_vehicle_id = 'vehicle';
  f.state.assets.push({
    ...f.state.assets[0]!,
    id: 'replacement',
    field_key: 'insurance',
    vehicle_id: null,
  });
  const input = {
    expected_version: 4,
    field_key: 'insurance',
    asset_id: 'replacement',
  };
  f.state.activeRide = true;
  await assert.rejects(() => f.service.renew('driver', 'vehicle', input), {
    error_code: 'VEHICLE_ON_TRIP',
  });
  f.state.activeRide = false;
  await assert.rejects(
    () =>
      f.service.renew('driver', 'vehicle', { ...input, expected_version: 3 }),
    { error_code: 'VEHICLE_VERIFICATION_CONFLICT' },
  );
  const before = structuredClone(
    vehicle.verification_fields.filter((v) => v.key !== 'insurance'),
  );
  await f.service.renew('driver', 'vehicle', input);
  assert.deepEqual(
    vehicle.verification_fields.filter((v) => v.key !== 'insurance'),
    before,
  );
  assert.equal(
    vehicle.verification_fields.find((v) => v.key === 'insurance')?.status,
    'PENDING',
  );
  assert.equal(vehicle.status, 'UNDER_REVIEW');
  assert.equal(
    vehicle.verification_fields.find((v) => v.key === 'insurance')?.display,
    f.state.assets.find((v) => v.id === 'replacement')?.file_name,
  );
  assert.equal(f.state.profile.availability, 'OFFLINE');
  const writes = f.state.writes;
  await f.service.renew('driver', 'vehicle', input);
  assert.equal(f.state.writes, writes);
});

it('admin vehicle verification refuses a rider account before loading its vehicles', async () => {
  let reads = 0;
  const query = async (sql: string) => {
    if (sql.includes('FROM users'))
      return {
        rows: [{ id: 'rider', role: 'RIDER', partner_activated_at: null }],
      };
    reads++;
    return { rows: [] };
  };
  const service = new VehicleVerificationService({
    transaction: (work: (tx: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService);
  await assert.rejects(
    service.list('rider'),
    (error: unknown) =>
      error instanceof AppError &&
      error.status_code === 403 &&
      error.error_code === 'DRIVER_ACCOUNT_REQUIRED',
  );
  assert.equal(reads, 0);
});

import type { ConfigurationRepository } from '../features/app_configuration/configuration.repository.js';
import type { PostgresService } from '../database/postgres.service.js';
import { DriverOperationsService } from '../features/driver_operations/driver_operations.service.js';
import assert from 'node:assert/strict';
import { it, mock } from 'node:test';
import {
  RideRepository,
  type FareCalculation,
} from '../features/ride/ride.repo.js';
import { AppConfigurationService } from '../features/app_configuration/app_configuration.service.js';
import { RideService } from '../features/ride/ride.service.js';
import { GeocodeService } from '../features/geocode/geocode.service.js';
import { VehicleCategoryRepository } from '../features/vehicle_category/vehicle_category.repo.js';
import {
  availability_schema,
  create_ride_schema,
} from '../features/ride/ride.type.js';

it('validates passenger counts and bounds public availability inputs', () => {
  assert.equal(
    create_ride_schema.parse({ draft_ride_id: 'draft', quote_id: 'quote' })
      .passenger_count,
    1,
  );
  for (const value of [0, -1, 1.5, 101]) {
    assert.equal(
      create_ride_schema.safeParse({
        draft_ride_id: 'draft',
        quote_id: 'quote',
        passenger_count: value,
      }).success,
      false,
    );
  }
  assert.equal(
    availability_schema.parse({
      draft_ride_id: 'draft',
      quote_id: 'quote',
      passenger_count: '2',
    }).passenger_count,
    2,
  );
  assert.equal(
    availability_schema.safeParse({
      draft_ride_id: 'draft',
      quote_id: 'quote',
      rider_id: 'foreign',
    }).success,
    false,
  );
});

it('availability rejects foreign/expired drafts and returns only bounded public preview data', async () => {
  let owned = false;
  const vehicle = {
    id: 'vehicle',
    driver_id: 'driver',
    type: 'BIKE',
    capacity: 1,
    status: 'ACTIVE',
    verification_version: 0,
    vehicle_category_id: 'bike',
    vehicle_category: {
      id: 'bike',
      vehicle_type: 'BIKE',
      capacity: 1,
      is_active: true,
      parent: null,
      _count: { children: 0 },
    },
    make: 'Brand',
    model: 'Model',
    color: 'Black',
    plate_number: 'PRIVATE-PLATE',
    brand: {
      name: 'Catalog Brand',
      logo_url: 'https://example.test/logo.webp',
    },
  };
  let queried = false;
  const postgres = sqlDb(async (sql, params) => {
    if (sql.includes('FROM ride_fare_policies')) return { rows: [] };
    if (sql.includes('JOIN fare_quotes')) {
      assert.deepEqual(params, ['draft', 'rider', 'quote']);
      assert.match(sql, /r.status='DRAFT'/);
      assert.match(sql, /q.expires_at>statement_timestamp/);
      return {
        rows: owned
          ? [
              {
                pickup_latitude: '25',
                pickup_longitude: '86',
                vehicle_category_id: 'bike',
                vehicle_type: 'BIKE',
                category_snapshot: { capacity: 1 },
              },
            ]
          : [],
      };
    }
    queried = true;
    assert.match(sql, /LIMIT 100/);
    assert.match(sql, /p.availability='AVAILABLE'/);
    return {
      rows: Array.from({ length: 12 }, () => ({
        id: 'driver',
        user_id: 'driver-user',
        current_latitude: '25.001',
        current_longitude: '86.001',
        first_name: 'Driver',
        avatar_url: null,
        phone_e164: 'PRIVATE-PHONE',
        rating_average: '4.5',
        ratings_count: 2,
        active_vehicle: vehicle,
      })),
    };
  });
  const service = new DriverOperationsService(new GeocodeService(), postgres);
  const input = {
    draft_ride_id: 'draft',
    quote_id: 'quote',
    payment_preference: 'CASH' as const,
    passenger_count: 1,
  };
  await assert.rejects(service.rider_availability('rider', input), {
    error_code: 'QUOTE_UNAVAILABLE',
  });
  assert.equal(queried, false);
  owned = true;
  const result = await service.rider_availability('rider', input);
  assert.equal(result.items.length, 8);
  const firstPreview = result.items[0];
  assert.ok(firstPreview);
  assert.equal(firstPreview.distance_m % 50, 0);
  assert.deepEqual(firstPreview.vehicle.brand, {
    name: 'Catalog Brand',
    logo_url: 'https://example.test/logo.webp',
  });
  const json = JSON.stringify(result);
  for (const value of [
    'PRIVATE-PHONE',
    'PRIVATE-PLATE',
    'current_latitude',
    'driver-user',
  ])
    assert.equal(json.includes(value), false);
});

function sqlDb(query: (sql: string, params: unknown[]) => Promise<unknown>) {
  return {
    query,
    transaction: (work: (tx: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService;
}

it('live location reads retain the newest bounded tail in chronological order and reject unrelated riders', async () => {
  const query = async (sql: string, args: unknown[]) => {
    if (sql.includes('FROM rides WHERE'))
      return { rowCount: args[1] === 'rider' ? 1 : 0 };
    assert.match(sql, /ORDER BY recorded_at DESC,id DESC LIMIT 500/);
    assert.match(sql, /ORDER BY recorded_at,id/);
    return {
      rows: Array.from({ length: 500 }, (_, i) => ({ id: String(i + 701) })),
    };
  };
  const repo = new RideRepository(sqlDb(query));
  const points = await repo.list_ride_locations('rider', 'ride');
  assert.equal(points?.length, 500);
  assert.equal(points?.at(-1)?.id, '1200');
  assert.equal(points?.at(0)?.id, '701');
  assert.equal(await repo.list_ride_locations('other-rider', 'ride'), null);
});

it('advances matching and reloads the rider status even without a mounted action panel', async () => {
  const rides = new RideRepository({} as PostgresService);
  const operations = new DriverOperationsService(
    new GeocodeService(),
    sqlDb(async () => ({ rows: [] })),
  );
  let status = 'SEARCHING';
  const read = mock.method(
    rides,
    'find_ride_for_user',
    async () =>
      ({ id: 'ride', status }) as Awaited<
        ReturnType<RideRepository['find_ride_for_user']>
      >,
  );
  const dispatch = mock.method(operations, 'dispatch', async () => {
    status = 'NO_DRIVER_FOUND';
  });
  const service = new RideService(
    new VehicleCategoryRepository({} as PostgresService),
    new GeocodeService(),
    rides,
    new AppConfigurationService({} as ConfigurationRepository),
    operations,
  );
  assert.equal(
    (await service.get_ride('rider', 'ride')).status,
    'NO_DRIVER_FOUND',
  );
  assert.equal(dispatch.mock.callCount(), 1);
  assert.equal(read.mock.callCount(), 2);
  await service.get_ride('rider', 'ride');
  assert.equal(dispatch.mock.callCount(), 1);
});

it('rounds the distance-only fare using saved profit and normal rates', async () => {
  const categories = new VehicleCategoryRepository({} as PostgresService);
  const geocode = new GeocodeService();
  const rides = new RideRepository({} as PostgresService);
  const configuration = new AppConfigurationService(
    {} as ConfigurationRepository,
  );
  mock.method(
    configuration,
    'fare_snapshot',
    async () =>
      ({
        id: 'policy',
        key: 'default',
        updated_by_id: 'admin',
        created_at: new Date(),
        updated_at: new Date(),
        arrival_radius_m: 150,
        location_max_age_s: 60,
        matching_initial_radius_km: 1,
        matching_max_radius_km: 10,
        matching_expansion_s: 30,
        search_timeout_s: 180,
        offer_lifetime_s: 45,
        version: 1,
        cash_enabled: true,
        direct_upi_enabled: true,
        online_payment_enabled: false,
        commission_percent: 0,
        free_cancellation_minutes: 2,
        free_pickup_wait_minutes: 5,
        cancellation_fee_percent: 10,
        maximum_cancellation_fee: 100,
      }) as Awaited<ReturnType<AppConfigurationService['fare_snapshot']>>,
  );
  const category = {
    id: 'category',
    code: 'FIXTURE',
    name: 'Fixture',
    description: null,
    image_url: null,
    parent_id: null,
    vehicle_type: 'SEDAN' as const,
    capacity: 4,
    base_fare: String(0),
    per_kilometer: String('2.01'),
    per_minute: String('2.01'),
    max_profit_km: String(3),
    profit_fare_per_km: String('2.01'),
    normal_fare_per_km: String('2.01'),
    commission_percent: String('12.50'),
    is_active: true,
    sort_order: 0,
    created_at: new Date(),
    updated_at: new Date(),
    parent: null,
  };
  mock.method(categories, 'list_category_choices', async () => [
    category,
    {
      ...category,
      id: 'premium',
      name: 'Premium Sedan',
      profit_fare_per_km: String(20),
      commission_percent: String(5),
    },
    {
      ...category,
      id: 'child',
      name: 'Airport',
      parent_id: 'parent',
      parent: { ...category, id: 'parent' },
      profit_fare_per_km: String(30),
    },
    {
      ...category,
      id: 'unpriced',
      max_profit_km: null,
      normal_fare_per_km: null,
      profit_fare_per_km: null,
    },
  ]);
  mock.method(geocode, 'driving_route', async () => ({
    distance_m: 500,
    duration_s: 30,
    geometry: [
      [0, 0],
      [1, 1],
    ],
  }));
  let captured: FareCalculation[] = [];
  const stop = new Error('Quote captured before persistence');
  mock.method(
    rides,
    'create_quote',
    async (...args: Parameters<RideRepository['create_quote']>) => {
      captured = args[2];
      throw stop;
    },
  );
  try {
    await assert.rejects(
      new RideService(
        categories,
        geocode,
        rides,
        configuration,
        new DriverOperationsService(
          geocode,
          sqlDb(async () => ({ rows: [] })),
        ),
      ).build_quote('rider', {
        pickup: { address: 'Pickup', latitude: 0, longitude: 0 },
        dropoff: { address: 'Dropoff', latitude: 1, longitude: 1 },
      }),
      (error) => error === stop,
    );
    assert.equal(captured[0]?.distance_fare, 1.01);
    assert.equal(captured[0]?.time_fare, 0);
    assert.equal(captured[0]?.total_fare, 1.01);
    assert.equal(captured.length, 3);
    assert.equal(captured[1]?.total_fare, 10);
    assert.equal(captured[2]?.total_fare, 15);
    assert.equal(captured[1]?.vehicle_type, captured[0]?.vehicle_type);
    assert.equal(
      (
        captured[0]?.category_snapshot.payment_policy as {
          commission_percent?: number;
        }
      ).commission_percent,
      12.5,
    );
    assert.equal(
      (
        captured[1]?.category_snapshot.payment_policy as {
          commission_percent?: number;
        }
      ).commission_percent,
      5,
    );
    assert.equal(captured[1]?.category_snapshot.fare_category_id, 'premium');
    assert.equal(captured[2]?.category_snapshot.parent_name, 'Fixture');
    assert.equal('fare_group' in captured[0]!.category_snapshot, false);
  } finally {
    mock.restoreAll();
  }
});

it('a configured category can persist quotes with default shared settings, but a concurrent settings change invalidates construction', async () => {
  const updated = new Date('2026-10-25T00:00:00Z');
  let policy: { version: number } | null = null;
  let writes = 0;
  const db = sqlDb(async (sql) => {
    if (sql.includes('FROM users'))
      return { rows: [{ status: 'ACTIVE', role: 'RIDER', deleted_at: null }] };
    if (sql.includes('FROM ride_fare_policies'))
      return { rows: policy ? [policy] : [] };
    if (sql.includes('FROM vehicle_categories c'))
      return {
        rows: [{ id: 'category', vehicle_type: 'SEDAN', updated_at: updated }],
      };
    if (sql.startsWith('INSERT INTO rides')) writes++;
    if (sql.includes('FROM rides r WHERE')) return { rows: [{ id: 'draft' }] };
    return { rows: [] };
  });
  const calculation: FareCalculation = {
    vehicle_category_id: 'category',
    vehicle_type: 'SEDAN',
    category_updated_at: updated.toISOString(),
    fare_policy_version: 0,
    category_snapshot: { fare_category_id: 'category', fare_policy_version: 0 },
    distance_m: 1000,
    duration_s: 60,
    pickup_eta_s: 0,
    base_fare: 0,
    distance_fare: 12,
    time_fare: 0,
    total_fare: 12,
  };
  const input = {
    pickup: { address: 'Pickup', latitude: 25, longitude: 86 },
    dropoff: { address: 'Dropoff', latitude: 25.1, longitude: 86.1 },
  };
  const repo = new RideRepository(db);
  assert.equal(
    (
      await repo.create_quote(
        'rider',
        input,
        [calculation],
        new Date(Date.now() + 60000),
        [],
      )
    ).id,
    'draft',
  );
  policy = { version: 1 };
  await assert.rejects(
    repo.create_quote(
      'rider',
      input,
      [calculation],
      new Date(Date.now() + 60000),
      [],
    ),
    { error_code: 'FARE_POLICY_CHANGED' },
  );
  assert.equal(writes, 1);
});

it('a deleted category cannot turn an unbooked quote into a family-wide booking', async () => {
  const db = sqlDb(async (sql) => {
    if (sql.includes('FROM users'))
      return { rows: [{ status: 'ACTIVE', role: 'RIDER', deleted_at: null }] };
    if (sql.startsWith('SELECT id,status,rider_note'))
      return { rows: [{ id: 'draft', status: 'DRAFT' }] };
    if (sql.includes('FROM fare_quotes'))
      return {
        rows: [
          {
            id: 'quote',
            expires_at: new Date(Date.now() + 60000),
            vehicle_category_id: null,
            category_snapshot: null,
          },
        ],
      };
    return { rows: [], rowCount: 0 };
  });
  assert.deepEqual(
    await new RideRepository(db).request_ride('rider', {
      draft_ride_id: 'draft',
      quote_id: 'quote',
    }),
    { kind: 'quote_unavailable' },
  );
});

it('serializes driver reviews and updates rating statistics in the review transaction', async () => {
  const steps: string[] = [];
  const db = sqlDb(async (sql, args) => {
    if (sql.includes('pg_advisory')) steps.push('lock');
    if (sql.includes('FROM rides r'))
      return { rows: [{ status: 'COMPLETED', driver_user: 'driver-user' }] };
    if (sql.startsWith('INSERT INTO reviews')) {
      steps.push('review');
      return { rows: [{ id: 'review', score: 5 }] };
    }
    if (sql.startsWith('UPDATE driver_profiles')) {
      assert.match(sql, /round\(avg\(score\),2\)/);
      assert.deepEqual(args, ['driver-user']);
      steps.push('rating');
      return { rows: [{ rating_average: '4.34', ratings_count: 200 }] };
    }
    if (sql.startsWith('INSERT INTO user_logs')) steps.push('audit');
    return { rows: [] };
  });
  const result = await new RideRepository(db).create_review('rider', 'ride', {
    reviewee_id: 'driver-user',
    score: 5,
  });
  assert.equal(result.kind, 'success');
  assert.deepEqual(steps, ['lock', 'lock', 'review', 'rating', 'audit']);
});

it('a rating retry returns the original review and rejects an altered score without changing aggregates', async () => {
  const saved = { id: 'review', score: 5, comment: 'Good ride' };
  const db = sqlDb(async (sql) => {
    if (sql.includes('FROM rides r'))
      return { rows: [{ status: 'COMPLETED', driver_user: 'driver' }] };
    if (sql.includes('FROM reviews')) return { rows: [saved] };
    return { rows: [] };
  });
  const repo = new RideRepository(db);
  const result = await repo.create_review('rider', 'ride', {
    reviewee_id: 'driver',
    score: 5,
    comment: 'Good ride',
  });
  assert.deepEqual(result, { kind: 'success', review: saved });
  await assert.rejects(
    () =>
      repo.create_review('rider', 'ride', {
        reviewee_id: 'driver',
        score: 4,
        comment: 'Good ride',
      }),
    { error_code: 'REVIEW_ALREADY_SUBMITTED' },
  );
});

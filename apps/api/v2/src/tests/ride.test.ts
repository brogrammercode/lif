import { DriverOperationsService } from '../features/driver_operations/driver_operations.service.js';
import assert from 'node:assert/strict';
import { it, mock } from 'node:test';
import {
  RideRepository,
  type FareCalculation,
} from '../features/ride/ride.repo.js';
import { PrismaService } from '../infra/database/prisma.service.js';
import { Prisma } from '@prisma/client';
import { AppConfigurationService } from '../features/app_configuration/app_configuration.service.js';
import { RideService } from '../features/ride/ride.service.js';
import { GeocodeService } from '../features/geocode/geocode.service.js';
import { VehicleCategoryRepository } from '../features/vehicle_category/vehicle_category.repo.js';

it('live location reads retain the newest bounded tail in chronological order and reject unrelated riders', async () => {
  let take = 0;
  const db = new PrismaService();
  Object.defineProperty(db, 'client', {
    value: {
      ride: {
        findFirst: async ({ where }: { where: { rider_id: string } }) =>
          where.rider_id === 'rider' ? { id: 'ride' } : null,
      },
      rideLocation: {
        findMany: async (args: { take: number; orderBy: unknown }) => {
          take = args.take;
          assert.deepEqual(args.orderBy, [
            { recorded_at: 'desc' },
            { id: 'desc' },
          ]);
          return Array.from({ length: 1200 }, (_, i) => ({
            id: String(1200 - i),
            recorded_at: new Date((1200 - i) * 1000),
          })).slice(0, args.take);
        },
      },
    },
  });
  const repo = new RideRepository(db);
  const points = await repo.list_ride_locations('rider', 'ride');
  assert.equal(take, 500);
  assert.equal(points?.length, 500);
  assert.equal(points?.at(-1)?.id, '1200');
  assert.equal(points?.at(0)?.id, '701');
  assert.equal(await repo.list_ride_locations('other-rider', 'ride'), null);
});

it('advances matching and reloads the rider status even without a mounted action panel', async () => {
  const database = new PrismaService();
  const rides = new RideRepository(database);
  const operations = new DriverOperationsService(
    database,
    new GeocodeService(),
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
    new VehicleCategoryRepository(database),
    new GeocodeService(),
    rides,
    new AppConfigurationService(database),
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
  const database = new PrismaService();
  const categories = new VehicleCategoryRepository(database);
  const geocode = new GeocodeService();
  const rides = new RideRepository(database);
  const configuration = new AppConfigurationService(database);
  mock.method(
    configuration,
    'fare_snapshot',
    async () =>
      ({
        version: 1,
        cash_enabled: true,
        direct_upi_enabled: true,
        online_payment_enabled: false,
        commission_percent: new Prisma.Decimal(0),
        free_cancellation_minutes: 2,
        free_pickup_wait_minutes: 5,
        cancellation_fee_percent: new Prisma.Decimal(10),
        maximum_cancellation_fee: new Prisma.Decimal(100),
        rates: [
          {
            group: 'CAR',
            max_profit_km: new Prisma.Decimal(3),
            profit_fare_per_km: new Prisma.Decimal('2.01'),
            normal_fare_per_km: new Prisma.Decimal('2.01'),
          },
        ],
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
    base_fare: new Prisma.Decimal(0),
    per_kilometer: new Prisma.Decimal('2.01'),
    per_minute: new Prisma.Decimal('2.01'),
    is_active: true,
    sort_order: 0,
    created_at: new Date(),
    updated_at: new Date(),
    parent: null,
  };
  mock.method(categories, 'list_category_choices', async () => [category]);
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
        new DriverOperationsService(database, geocode),
      ).build_quote('rider', {
        pickup: { address: 'Pickup', latitude: 0, longitude: 0 },
        dropoff: { address: 'Dropoff', latitude: 1, longitude: 1 },
      }),
      (error) => error === stop,
    );
    assert.equal(captured[0]?.distance_fare, 1.01);
    assert.equal(captured[0]?.time_fare, 0);
    assert.equal(captured[0]?.total_fare, 1.01);
  } finally {
    mock.restoreAll();
  }
});

it('serializes driver reviews and updates rating statistics in the review transaction', async () => {
  const steps: string[] = [];
  const transaction = {
    $executeRaw: async () => {
      steps.push('lock');
      return 1;
    },
    ride: {
      findFirst: async () => ({
        status: 'COMPLETED',
        driver: { user_id: 'driver-user' },
      }),
    },
    review: {
      findUnique: async () => null,
      create: async () => {
        steps.push('review');
        return { id: 'review', score: 5 };
      },
      aggregate: async () => {
        steps.push('aggregate');
        return { _avg: { score: 4.335 }, _count: { _all: 200 } };
      },
    },
    driverProfile: {
      update: async ({
        data,
      }: {
        data: { rating_average: number; ratings_count: number };
      }) => {
        assert.deepEqual(data, { rating_average: 4.34, ratings_count: 200 });
        steps.push('rating');
        return { rating_average: new Prisma.Decimal(4.34), ratings_count: 200 };
      },
    },
    userLog: {
      create: async () => {
        steps.push('audit');
        return {};
      },
    },
  };
  const database = new PrismaService();
  Object.defineProperty(database, 'client', {
    value: {
      $transaction: async (
        action: (tx: typeof transaction) => Promise<unknown>,
      ) => action(transaction),
    },
  });
  const result = await new RideRepository(database).create_review(
    'rider',
    'ride',
    { reviewee_id: 'driver-user', score: 5 },
  );
  assert.equal(result.kind, 'success');
  assert.deepEqual(steps, [
    'lock',
    'lock',
    'review',
    'aggregate',
    'rating',
    'audit',
  ]);
});

it('a rating retry returns the original review and rejects an altered score without changing aggregates', async () => {
  const saved = { id: 'review', score: 5, comment: 'Good ride' };
  const tx = {
    $executeRaw: async () => 1,
    ride: {
      findFirst: async () => ({
        status: 'COMPLETED',
        driver: { user_id: 'driver' },
      }),
    },
    review: { findUnique: async () => saved },
  };
  const database = new PrismaService();
  Object.defineProperty(database, 'client', {
    value: {
      $transaction: async (action: (client: typeof tx) => Promise<unknown>) =>
        action(tx),
    },
  });
  const repo = new RideRepository(database);
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

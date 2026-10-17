import assert from 'node:assert/strict';
import { it, mock } from 'node:test';
import {
  RideRepository,
  type FareCalculation,
} from '../features/ride/ride.repo.js';
import { PrismaService } from '../infra/database/prisma.service.js';
import { Prisma } from '@prisma/client';
import { RideService } from '../features/ride/ride.service.js';
import { GeocodeService } from '../features/geocode/geocode.service.js';
import { VehicleCategoryRepository } from '../features/vehicle_category/vehicle_category.repo.js';

it('rounds fractional distance and time fares using decimal arithmetic', async () => {
  const database = new PrismaService();
  const categories = new VehicleCategoryRepository(database);
  const geocode = new GeocodeService();
  const rides = new RideRepository(database);
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
      new RideService(categories, geocode, rides).build_quote('rider', {
        pickup: { address: 'Pickup', latitude: 0, longitude: 0 },
        dropoff: { address: 'Dropoff', latitude: 1, longitude: 1 },
      }),
      (error) => error === stop,
    );
    assert.equal(captured[0]?.distance_fare, 1.01);
    assert.equal(captured[0]?.time_fare, 1.01);
    assert.equal(captured[0]?.total_fare, 2.02);
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

it('reads current verification after acquiring the driver lock during cancellation', async () => {
  const steps: string[] = [];
  const transaction = {
    $executeRaw: async () => {
      steps.push('lock');
      return 1;
    },
    ride: {
      findFirst: async () => ({
        id: 'ride',
        rider_id: 'rider',
        status: 'DRIVER_ASSIGNED',
        driver: {
          id: 'driver',
          user_id: 'driver-user',
          verification_status: 'VERIFIED',
          user: { status: 'ACTIVE' },
        },
      }),
      update: async () => ({ id: 'ride', status: 'CANCELLED' }),
    },
    driverProfile: {
      findUniqueOrThrow: async () => {
        steps.push('fresh-driver');
        return { verification_status: 'REJECTED', user: { status: 'ACTIVE' } };
      },
      update: async ({ data }: { data: { availability: string } }) => {
        assert.equal(data.availability, 'OFFLINE');
        steps.push('update-driver');
        return {};
      },
    },
    rideOffer: { updateMany: async () => ({ count: 0 }) },
    rideEvent: { create: async () => ({}) },
    userLog: { create: async () => ({}) },
  };
  const database = new PrismaService();
  Object.defineProperty(database, 'client', {
    value: {
      $transaction: async (
        action: (tx: typeof transaction) => Promise<unknown>,
      ) => action(transaction),
    },
  });
  const result = await new RideRepository(database).cancel_ride(
    'rider',
    'ride',
    { cancel_reason: 'Change of plans' },
  );
  assert.equal(result.kind, 'success');
  assert.deepEqual(steps, ['lock', 'lock', 'fresh-driver', 'update-driver']);
});

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service.js';
import { AppConfigurationService } from '../features/app_configuration/app_configuration.service.js';
import {
  fare_policy_input,
  support_contact_input,
} from '../features/app_configuration/app_configuration.type.js';
import { calculate_distance_fare } from '../features/app_configuration/fare_calculation.js';
import { require_supported_ride_payment } from '../features/app_configuration/payment_policy.js';
import { availability_after_trip } from '../features/driver/driver_eligibility.js';
import { PaymentRepository } from '../features/payment/payment.repo.js';

const settings = fare_policy_input.parse({
  expected_version: 1,
  cash_enabled: true,
  direct_upi_enabled: true,
  online_payment_enabled: false,
  commission_percent: 0,
  free_cancellation_minutes: 2,
  free_pickup_wait_minutes: 5,
  cancellation_fee_percent: 10,
  maximum_cancellation_fee: 100,
  rates: ['AUTO_TOTO', 'BIKE_SCOOTER', 'CAR'].map((group) => ({
    group,
    max_profit_km: 2,
    normal_fare_per_km: 10,
    profit_fare_per_km: 20,
  })),
});
const row = () => ({
  id: 'policy',
  key: 'default',
  version: 1,
  updated_by_id: 'admin',
  created_at: new Date(),
  updated_at: new Date(),
  ...settings,
  commission_percent: new Prisma.Decimal(0),
  cancellation_fee_percent: new Prisma.Decimal(10),
  maximum_cancellation_fee: new Prisma.Decimal(100),
  rates: settings.rates.map((rate) => ({
    ...rate,
    max_profit_km: new Prisma.Decimal(rate.max_profit_km),
    normal_fare_per_km: new Prisma.Decimal(rate.normal_fare_per_km),
    profit_fare_per_km: new Prisma.Decimal(rate.profit_fare_per_km),
  })),
});
const database = (client: unknown) => {
  const db = new PrismaService();
  Object.defineProperty(db, 'client', { value: client });
  return db;
};

it('prices both distance bands and rounds once after summing', () => {
  const rates = row().rates[0]!;
  assert.equal(calculate_distance_fare(1500, rates).toString(), '30');
  assert.equal(calculate_distance_fare(2000, rates).toString(), '40');
  assert.equal(calculate_distance_fare(2500, rates).toString(), '45');
  assert.equal(
    calculate_distance_fare(1000, {
      max_profit_km: new Prisma.Decimal('0.5'),
      profit_fare_per_km: new Prisma.Decimal('0.01'),
      normal_fare_per_km: new Prisma.Decimal('0.01'),
    }).toString(),
    '0.01',
  );
  for (const invalid of [-1, NaN, Infinity])
    assert.throws(() => calculate_distance_fare(invalid, rates), {
      error_code: 'ROUTE_DISTANCE_INVALID',
    });
});

it('rejects missing/duplicate groups, unsupported charges and disabled payment channels', () => {
  assert.equal(
    fare_policy_input.safeParse({
      ...settings,
      rates: [settings.rates[0], settings.rates[0], settings.rates[2]],
    }).success,
    false,
  );
  assert.equal(
    fare_policy_input.safeParse({ ...settings, commission_percent: 1 }).success,
    false,
  );
  assert.equal(
    fare_policy_input.safeParse({
      ...settings,
      cash_enabled: false,
      direct_upi_enabled: false,
    }).success,
    false,
  );
});

it('normalizes support contact whitespace including blank optional channels', () => {
  const input = support_contact_input.parse({
    expected_version: 0,
    support_phone: '  +919999999999  ',
    emergency_phone: ' 112 ',
    whatsapp_phone: '   ',
    support_email: ' help@example.test ',
    support_hours: '   ',
    instructions: null,
  });
  assert.equal(input.support_phone, '+919999999999');
  assert.equal(input.emergency_phone, '112');
  assert.equal(input.whatsapp_phone, '');
  assert.equal(input.support_email, 'help@example.test');
});

it('rejects corrupt stored rates and policies before quoting', async () => {
  for (const policy of [
    null,
    { ...row(), rates: [] },
    { ...row(), cash_enabled: false, direct_upi_enabled: false },
    {
      ...row(),
      rates: row().rates.map((rate) => ({
        ...rate,
        normal_fare_per_km: new Prisma.Decimal(-1),
      })),
    },
  ]) {
    const service = new AppConfigurationService(
      database({ rideFarePolicy: { findUnique: async () => policy } }),
    );
    await assert.rejects(service.fare_snapshot(), {
      error_code: 'FARE_POLICY_NOT_CONFIGURED',
    });
  }
});

it('acknowledges the committed fare version and rejects a stale admin edit', async () => {
  let writes = 0;
  let logs = 0;
  const tx = {
    $executeRaw: async () => 1,
    user: {
      findUnique: async () => ({
        id: 'admin',
        status: 'ACTIVE',
        role: 'ADMIN',
        deleted_at: null,
      }),
    },
    rideFarePolicy: {
      findUnique: async () => row(),
      update: async () => {
        writes++;
        return { ...row(), version: 2 };
      },
    },
    userLog: {
      create: async () => {
        logs++;
      },
    },
  };
  const service = new AppConfigurationService(
    database({
      $transaction: async (action: (client: typeof tx) => Promise<unknown>) =>
        action(tx),
      user: tx.user,
      // A second read could observe another administrator's subsequent write.
      rideFarePolicy: { findUnique: async () => ({ ...row(), version: 3 }) },
    }),
  );
  const saved = await service.save_fare_policy('admin', settings);
  assert.equal(saved.version, 2);
  assert.equal(writes, 1);
  assert.equal(logs, 1);
  await assert.rejects(
    service.save_fare_policy('admin', { ...settings, expected_version: 0 }),
    { error_code: 'FARE_POLICY_CONFLICT' },
  );
  assert.equal(writes, 1);
});

it('honors quote payment snapshots while keeping legacy cash and completed history intact', () => {
  assert.doesNotThrow(() => require_supported_ride_payment(null, 'CASH'));
  assert.doesNotThrow(() =>
    require_supported_ride_payment(
      {
        fare_policy_version: 1,
        payment_policy: { cash_enabled: true, direct_upi_enabled: true },
      },
      'CASH',
    ),
  );
  assert.throws(
    () =>
      require_supported_ride_payment(
        {
          fare_policy_version: 1,
          payment_policy: { cash_enabled: false, direct_upi_enabled: true },
        },
        'CASH',
      ),
    { error_code: 'PAYMENT_METHOD_DISABLED' },
  );
  assert.throws(
    () => require_supported_ride_payment({ fare_policy_version: 1 }, 'CASH'),
    { error_code: 'QUOTE_PAYMENT_POLICY_INVALID' },
  );
  assert.throws(() => require_supported_ride_payment(null, 'UPI'), {
    error_code: 'PAYMENT_PROVIDER_UNAVAILABLE',
  });
});

it('preserves suspensions and checks current vehicle/account eligibility after a trip ends', () => {
  type Profile = Parameters<typeof availability_after_trip>[0];
  const profile = {
    id: 'driver',
    availability: 'ON_TRIP',
    verification_status: 'VERIFIED',
    user: { status: 'ACTIVE' },
    active_vehicle: {
      id: 'vehicle',
      driver_id: 'driver',
      status: 'ACTIVE',
      type: 'BIKE',
      capacity: 1,
      vehicle_category_id: 'bike',
      verification_version: 0,
      vehicle_category: {
        id: 'bike',
        vehicle_type: 'BIKE',
        is_active: true,
        capacity: 1,
        parent: null,
        _count: { children: 0 },
      },
    },
  } as Profile;
  assert.equal(availability_after_trip(profile), 'AVAILABLE');
  assert.equal(
    availability_after_trip({ ...profile, availability: 'SUSPENDED' }),
    'SUSPENDED',
  );
  assert.equal(
    availability_after_trip({ ...profile, user: { status: 'SUSPENDED' } }),
    'OFFLINE',
  );
  assert.equal(
    availability_after_trip({ ...profile, active_vehicle: null }),
    'OFFLINE',
  );
  assert.equal(
    availability_after_trip({
      ...profile,
      active_vehicle: { ...profile.active_vehicle!, status: 'REJECTED' },
    }),
    'OFFLINE',
  );
});

it('cash checkout rejects a disabled selected-quote policy before writing a payment', async () => {
  let writes = 0;
  const tx = {
    $executeRaw: async () => 1,
    ride: {
      findFirst: async () => ({
        id: 'ride',
        status: 'COMPLETED',
        final_fare: new Prisma.Decimal(50),
        quotes: [
          {
            category_snapshot: {
              fare_policy_version: 1,
              payment_policy: { cash_enabled: false, direct_upi_enabled: true },
            },
          },
        ],
      }),
    },
    payment: {
      findUnique: async () => null,
      upsert: async () => {
        writes++;
      },
    },
    paymentMethod: { findFirst: async () => ({ id: 'cash', type: 'CASH' }) },
  };
  const repository = new PaymentRepository(
    database({
      $transaction: async (action: (client: typeof tx) => Promise<unknown>) =>
        action(tx),
    }),
  );
  await assert.rejects(
    repository.create_checkout('rider', {
      ride_id: 'ride',
      payment_method_id: 'cash',
    }),
    { error_code: 'PAYMENT_METHOD_DISABLED' },
  );
  assert.equal(writes, 0);
});

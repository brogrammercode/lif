import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mock } from 'node:test';
import { TravelContextService } from '../features/travel_context/travel_context.service.js';
import { DriverRepository } from '../features/driver/driver.repo.js';
import { Prisma, type RideStartVerification } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service.js';
import { GeocodeService } from '../features/geocode/geocode.service.js';
import { DriverOperationsService } from '../features/driver_operations/driver_operations.service.js';
import {
  new_trip_code,
  reveal_trip_code,
  search_radius_km,
} from '../features/driver_operations/trip.rules.js';
import {
  trip_collection_input,
  trip_code_input,
} from '../features/driver_operations/driver_operations.type.js';

const decimal = (n: number) => new Prisma.Decimal(n);
function fixture() {
  const driver = {
    id: 'driver',
    user_id: 'driver-user',
    verification_status: 'VERIFIED',
    availability: 'EN_ROUTE',
    completed_rides: 0,
    current_latitude: decimal(25.23),
    current_longitude: decimal(86.95),
    last_location_at: new Date(),
    last_location_accuracy_m: 10,
    user: {
      id: 'driver-user',
      first_name: 'Driver',
      last_name: 'Fixture',
      status: 'ACTIVE',
      phone_e164: '+919999999998',
    },
    active_vehicle: {
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
    },
  };
  const trip = {
    id: 'ride',
    rider_id: 'rider',
    driver_id: 'driver',
    collection_preference: 'CASH',
    status: 'DRIVER_WAITING',
    matched_at: new Date(),
    arrived_at: new Date(),
    started_at: null as Date | null,
    completed_at: null as Date | null,
    pickup_latitude: decimal(25.23),
    pickup_longitude: decimal(86.95),
    dropoff_latitude: decimal(25.24),
    dropoff_longitude: decimal(86.96),
    estimated_fare: decimal(50),
    final_fare: null as Prisma.Decimal | null,
    actual_distance_m: null as number | null,
    currency: 'INR',
    rider: {
      id: 'rider',
      first_name: 'Rider',
      last_name: 'Fixture',
      phone_e164: '+919999999999',
    },
    driver,
    quotes: [
      {
        vehicle_category_id: 'bike',
        vehicle_type: 'BIKE',
        category_snapshot: {
          payment_policy: {
            cash_enabled: true,
            direct_upi_enabled: true,
            free_pickup_wait_minutes: 5,
            free_cancellation_minutes: 2,
            cancellation_fee_percent: 10,
            maximum_cancellation_fee: 100,
          },
        },
      },
    ],
    start_verification: {
      ride_id: 'ride',
      driver_id: 'driver',
      assignment_at: new Date(),
      ...new_trip_code('ride'),
      rider_confirmed_at: null,
      driver_verified_at: null,
      used_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as RideStartVerification,
    payment: null as null | {
      id: string;
      status: string;
      amount: Prisma.Decimal;
      collection_method?: string;
      recipient_upi?: string | null;
      unpaid_reason?: string | null;
      provider?: string | null;
      provider_payment_id?: string | null;
    },
    settlement_review: null as null | Record<string, unknown>,
    search_radius_km: null,
  };
  trip.start_verification.assignment_at = trip.matched_at;
  const events: {
    event_type: string;
    actor_id?: string;
    metadata?: unknown;
  }[] = [];
  let completions = 0;
  let otherActiveTrip = false;
  let readSnapshots = 0;
  const locations: {
    latitude: Prisma.Decimal;
    longitude: Prisma.Decimal;
    recorded_at: Date;
  }[] = [];
  let actorRole = 'DRIVER';
  let driverLockHook: (() => void) | undefined;
  const tx = {
    $executeRaw: async (parts: TemplateStringsArray) => {
      if (parts.join('').includes('720043')) driverLockHook?.();
      return 1;
    },
    user: {
      findUnique: async () => ({
        role: actorRole,
        status: 'ACTIVE',
        deleted_at: null,
      }),
    },
    rideFarePolicy: { findUnique: async () => null },
    driverPayoutChange: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    partnerApplication: {
      findUnique: async () => ({
        status: 'ACTIVATED',
        fields: [
          {
            value: 'driver@upi',
            definition: {
              label: 'UPI ID',
              key: 'upi_id',
              field_type: 'STRING',
            },
          },
        ],
      }),
    },
    ride: {
      count: async () => (otherActiveTrip ? 1 : 0),
      findFirst: async ({
        where,
      }: {
        where: { OR: { rider_id?: string; driver?: { user_id: string } }[] };
      }) =>
        where.OR.some(
          (v) => v.rider_id === 'rider' || v.driver?.user_id === 'driver-user',
        )
          ? { ...trip, driver: { ...driver } }
          : null,
      update: async ({ data }: { data: Partial<typeof trip> }) => {
        Object.assign(trip, data);
        return trip;
      },
    },
    driverProfile: {
      update: async ({
        data,
      }: {
        data: {
          availability?: string;
          completed_rides?: { increment: number };
        };
      }) => {
        if (data.availability) driver.availability = data.availability;
        if (data.completed_rides) completions += data.completed_rides.increment;
        return driver;
      },
    },
    rideStartVerification: {
      update: async ({
        data,
      }: {
        data: Omit<Partial<RideStartVerification>, 'attempts'> & {
          attempts?: number | { increment: number };
        };
      }) => {
        const { attempts, ...rest } = data;
        Object.assign(trip.start_verification, rest);
        if (attempts !== undefined)
          trip.start_verification.attempts =
            typeof attempts === 'number'
              ? attempts
              : trip.start_verification.attempts + attempts.increment;
        return { ...trip.start_verification };
      },
      upsert: async ({
        create,
        update,
      }: {
        create: RideStartVerification;
        update: Partial<RideStartVerification>;
      }) => {
        trip.start_verification = trip.start_verification
          ? { ...trip.start_verification, ...update }
          : create;
        return trip.start_verification;
      },
      deleteMany: async () => ({ count: 1 }),
    },
    rideEvent: {
      create: async ({ data }: { data: (typeof events)[number] }) => {
        events.push(data);
        return data;
      },
      findFirst: async ({ where }: { where: { event_type: string } }) =>
        events.find((v) => v.event_type === where.event_type) ?? null,
    },
    notification: { create: async () => ({}) },
    userLog: { create: async () => ({}) },
    rideLocation: { findMany: async () => locations },
    rideOffer: { updateMany: async () => ({ count: 0 }) },
    payment: {
      findUnique: async () => trip.payment,
      update: async ({
        data,
      }: {
        data: Partial<NonNullable<typeof trip.payment>>;
      }) => {
        if (trip.payment) Object.assign(trip.payment, data);
        return trip.payment;
      },
      upsert: async ({
        create,
        update,
      }: {
        create: NonNullable<typeof trip.payment>;
        update: Partial<NonNullable<typeof trip.payment>>;
      }) => {
        trip.payment = trip.payment
          ? { ...trip.payment, ...update }
          : { ...create, id: 'payment' };
        return trip.payment;
      },
    },
    rideSettlementReview: {
      findUnique: async () => trip.settlement_review,
      findUniqueOrThrow: async () => trip.settlement_review,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        const { version, ...rest } = data;
        const saved = trip.settlement_review!;
        Object.assign(saved, rest);
        if (version) saved.version = Number(saved.version ?? 1) + 1;
        return saved;
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (
          trip.settlement_review &&
          !['WAIVED', 'REJECTED', 'SETTLED'].includes(
            String(trip.settlement_review.status),
          )
        ) {
          Object.assign(trip.settlement_review, data);
        }
        return { count: trip.settlement_review ? 1 : 0 };
      },
      upsert: async ({ create }: { create: Record<string, unknown> }) =>
        (trip.settlement_review ??= create),
      create: async ({ data }: { data: Record<string, unknown> }) =>
        (trip.settlement_review = data),
    },
  };
  const db = new PrismaService();
  Object.defineProperty(db, 'client', {
    value: {
      ...tx,
      $transaction: async (
        action: (client: typeof tx) => Promise<unknown>,
        options?: { isolationLevel?: string },
      ) => {
        if (options?.isolationLevel === 'RepeatableRead') readSnapshots++;
        return action(tx);
      },
    },
  });
  const routing = new GeocodeService();
  return {
    service: new DriverOperationsService(db, routing),
    routing,
    trip,
    driver,
    events,
    locations,
    completions: () => completions,
    withOtherActiveTrip: () => {
      otherActiveTrip = true;
    },
    readSnapshots: () => readSnapshots,
    admin: () => {
      actorRole = 'ADMIN';
    },
    onDriverLock: (action: () => void) => {
      driverLockHook = action;
    },
  };
}

const driver_maintenance_writes: [
  string,
  (repo: DriverRepository) => Promise<unknown>,
][] = [
  [
    'profile creation',
    (repo) =>
      repo.create_driver_profile('driver-user', {
        license_number: 'fixture-license',
      }),
  ],
  [
    'vehicle creation',
    (repo) =>
      repo.create_vehicle('driver-user', {
        make: 'Fixture',
        model: 'Bike',
        plate_number: 'BR10AA1234',
        type: 'BIKE',
      }),
  ],
  [
    'category change',
    (repo) => repo.change_vehicle_category('driver-user', 'vehicle', 'bike'),
  ],
  [
    'active vehicle selection',
    (repo) => repo.select_active_vehicle('driver-user', 'vehicle'),
  ],
  ['offer rejection', (repo) => repo.reject_offer('driver-user', 'offer')],
];
for (const [name, action] of driver_maintenance_writes) {
  it(`driver ${name} rechecks account status under the lifecycle lock before resource access`, async () => {
    for (const inactive of [
      null,
      { status: 'DEACTIVATED', deleted_at: null },
      { status: 'SUSPENDED', deleted_at: null },
      { status: 'ACTIVE', deleted_at: new Date() },
    ]) {
      const locks: unknown[][] = [];
      let user: unknown = {
        role: 'DRIVER',
        status: 'ACTIVE',
        deleted_at: null,
      };
      let reads = 0;
      const tx = {
        $executeRaw: async (
          _sql: TemplateStringsArray,
          ...values: unknown[]
        ) => {
          locks.push(values);
          // Model a request whose HTTP guard passed before deactivation committed.
          user = inactive;
          return 1;
        },
        user: {
          findUnique: async () => {
            reads++;
            return user;
          },
        },
      };
      const db = new PrismaService();
      Object.defineProperty(db, 'client', {
        value: {
          $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        },
      });
      await assert.rejects(() => action(new DriverRepository(db)), {
        status_code: 403,
        error_code: 'USER_INACTIVE',
      });
      assert.equal(reads, 1);
      assert.deepEqual(locks, [[720050, 'driver-user']]);
    }
  });
}

it('an active driver can still select an eligible vehicle after the lifecycle recheck', async () => {
  const f = fixture();
  const writes: unknown[] = [];
  const tx = {
    $executeRaw: async () => 1,
    user: {
      findUnique: async () => ({
        role: 'DRIVER',
        status: 'ACTIVE',
        deleted_at: null,
      }),
    },
    partnerApplication: { findUnique: async () => ({ status: 'ACTIVATED' }) },
    vehicle: { findFirst: async () => f.driver.active_vehicle },
    driverProfile: {
      findUniqueOrThrow: async () => ({
        id: 'driver',
        active_vehicle_id: null,
      }),
      update: async ({ data }: { data: unknown }) => {
        writes.push(data);
        return data;
      },
    },
    ride: { count: async () => 0 },
    userLog: { create: async () => ({}) },
  };
  const db = new PrismaService();
  Object.defineProperty(db, 'client', {
    value: {
      $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    },
  });
  await new DriverRepository(db).select_active_vehicle(
    'driver-user',
    'vehicle',
  );
  assert.deepEqual(writes, [{ active_vehicle_id: 'vehicle' }]);
});

it('expands matching independently of arrival radius, without exceeding its cap', () => {
  assert.equal(search_radius_km(0, 1, 10, 30), 1);
  assert.equal(search_radius_km(30, 1, 10, 30), 2);
  assert.equal(search_radius_km(60, 1, 10, 30), 4);
  assert.equal(search_radius_km(300, 1, 10, 30), 10);
});

it('trip context keeps display and controls on one snapshot without exposing rider contact in history', async () => {
  const f = fixture();
  const driver = await f.service.context('driver-user', 'ride');
  assert.equal(f.readSnapshots(), 1);
  assert.equal(driver.trip.id, 'ride');
  assert.equal(driver.trip.status, driver.status);
  assert.equal(driver.trip.arrived_at, driver.arrived_at);
  assert.equal('phone_e164' in driver.trip.rider, false);
  assert.equal(driver.driver_has_active_trip, true);
  f.trip.status = 'COMPLETED';
  f.driver.availability = 'SUSPENDED';
  f.withOtherActiveTrip();
  const history = await f.service.context('driver-user', 'ride');
  assert.equal(history.driver_has_active_trip, true);
  assert.equal(history.contact, null);
  const rider = await f.service.context('rider', 'ride');
  assert.equal(rider.driver_has_active_trip, false);
});
it('requires both proofs when the rider confirms first and never exposes the code to the driver', async () => {
  const f = fixture();
  const code = reveal_trip_code(f.trip.start_verification.code_ciphertext);
  const context = await f.service.start_proof('rider', 'ride');
  assert.equal(f.trip.status, 'DRIVER_WAITING');
  assert.equal(context.start.rider_confirmed, true);
  const driver = await f.service.context('driver-user', 'ride');
  assert.equal(driver.start.code, null);
  await f.service.start_proof('driver-user', 'ride', code);
  assert.equal(f.trip.status, 'IN_PROGRESS');
  assert.equal(f.driver.availability, 'ON_TRIP');
  assert.equal(f.trip.start_verification.code_ciphertext, '');
  await f.service.start_proof('driver-user', 'ride', code);
  assert.equal(
    f.events.filter((v) => v.event_type === 'TRIP_STARTED').length,
    1,
  );
});
it('requires rider confirmation when the assigned driver verifies first', async () => {
  const f = fixture();
  await f.service.start_proof(
    'driver-user',
    'ride',
    reveal_trip_code(f.trip.start_verification.code_ciphertext),
  );
  assert.equal(f.trip.status, 'DRIVER_WAITING');
  await f.service.start_proof('rider', 'ride');
  assert.equal(f.trip.status, 'IN_PROGRESS');
});
it('commits wrong-code attempts and locks the challenge after five guesses', async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      f.service.start_proof('driver-user', 'ride', '000000'),
      { error_code: 'TRIP_CODE_INVALID' },
    );
  assert.equal(f.trip.start_verification.attempts, 5);
  await assert.rejects(f.service.start_proof('driver-user', 'ride', '000000'), {
    error_code: 'TRIP_CODE_LOCKED',
  });
  assert.equal(f.trip.status, 'DRIVER_WAITING');
});
it('rejects expired codes and a proof belonging to an earlier assignment', async () => {
  const f = fixture();
  f.trip.start_verification.expires_at = new Date(0);
  await assert.rejects(f.service.start_proof('rider', 'ride'), {
    error_code: 'TRIP_CODE_EXPIRED',
  });
  f.trip.start_verification.expires_at = new Date(Date.now() + 60000);
  f.trip.start_verification.driver_id = 'previous';
  await assert.rejects(f.service.start_proof('rider', 'ride'), {
    error_code: 'TRIP_CODE_EXPIRED',
  });
});
it('requires a fresh accurate pickup fix and emits one arrival notification/event', async () => {
  const f = fixture();
  f.trip.status = 'DRIVER_ASSIGNED';
  f.driver.last_location_at = new Date(0);
  await assert.rejects(f.service.arrive('driver-user', 'ride'), {
    error_code: 'FRESH_LOCATION_REQUIRED',
  });
  f.driver.last_location_at = new Date();
  f.driver.current_latitude = decimal(26);
  await assert.rejects(f.service.arrive('driver-user', 'ride'), {
    error_code: 'OUTSIDE_PICKUP_RADIUS',
  });
  f.driver.current_latitude = decimal(25.23);
  await f.service.arrive('driver-user', 'ride');
  await f.service.arrive('driver-user', 'ride');
  assert.equal(
    f.events.filter((v) => v.event_type === 'DRIVER_WAITING').length,
    1,
  );
});
it('completion is idempotent and uses the accepted fare, not driver input or invented GPS distance', async () => {
  const f = fixture();
  f.trip.status = 'IN_PROGRESS';
  f.trip.started_at = new Date(Date.now() - 60000);
  await f.service.complete('driver-user', 'ride');
  await f.service.complete('driver-user', 'ride');
  assert.equal(f.trip.final_fare?.toString(), '50');
  assert.equal(f.trip.payment?.status, 'PENDING');
  assert.equal(f.completions(), 1);
  assert.equal(f.driver.availability, 'AVAILABLE');
});

it('GPS jumps do not become a fabricated zero-distance trip or change the accepted fare', async () => {
  const f = fixture();
  f.trip.status = 'IN_PROGRESS';
  f.trip.started_at = new Date(Date.now() - 60000);
  f.locations.push(
    {
      latitude: decimal(25.23),
      longitude: decimal(86.95),
      recorded_at: f.trip.started_at,
    },
    {
      latitude: decimal(50),
      longitude: decimal(86.95),
      recorded_at: new Date(),
    },
  );
  await f.service.complete('driver-user', 'ride');
  assert.equal(f.trip.actual_distance_m, null);
  assert.equal(f.trip.final_fare?.toString(), '50');
});
it('a UPI intent stays pending until the assigned driver confirms actual receipt', async () => {
  const f = fixture();
  f.trip.status = 'COMPLETED';
  f.trip.final_fare = decimal(50);
  await f.service.payment('rider', 'ride', 'UPI');
  assert.equal(f.trip.payment?.status, 'PENDING');
  assert.equal(f.trip.payment?.recipient_upi, 'driver@upi');
  await assert.rejects(
    f.service.payment('rider', 'ride', 'UPI', { received: true }),
    { error_code: 'ASSIGNED_DRIVER_REQUIRED' },
  );
  await f.service.payment('driver-user', 'ride', 'UPI', { received: true });
  assert.equal(f.trip.payment?.status, 'CAPTURED');
  assert.equal(f.trip.payment?.amount.toString(), '50');
});
it('rejects unrelated trip access and forged manual fare/collection payloads', async () => {
  const f = fixture();
  await assert.rejects(f.service.context('stranger', 'ride'), {
    error_code: 'RIDE_NOT_FOUND',
  });
  assert.equal(
    trip_collection_input.safeParse({
      method: 'CASH',
      received: true,
      amount: 1,
    }).success,
    false,
  );
  assert.equal(trip_code_input.safeParse({}).success, false);
});
it('no-show cannot bypass the free waiting period or missing contact evidence', async () => {
  const f = fixture();
  await assert.rejects(
    f.service.report_issue(
      'driver-user',
      'ride',
      'NO_SHOW',
      'Passenger absent',
    ),
    { error_code: 'WAITING_PERIOD_ACTIVE' },
  );
  f.trip.arrived_at = new Date(Date.now() - 6 * 60000);
  await assert.rejects(
    f.service.report_issue(
      'driver-user',
      'ride',
      'NO_SHOW',
      'Passenger absent',
    ),
    { error_code: 'NO_SHOW_EVIDENCE_REQUIRED' },
  );
});

it('a verified no-show proposes one capped charge and a cancellation retry never adds another', async () => {
  const f = fixture();
  f.trip.status = 'DRIVER_ASSIGNED';
  await f.service.arrive('driver-user', 'ride');
  f.trip.arrived_at = new Date(Date.now() - 6 * 60000);
  await f.service.contact_attempt('driver-user', 'ride');
  await f.service.report_issue(
    'driver-user',
    'ride',
    'NO_SHOW',
    'Passenger did not arrive after calling',
  );
  assert.equal(f.trip.status, 'CANCELLED');
  assert.equal(String(f.trip.settlement_review?.fee_amount), '5');
  assert.equal(f.trip.settlement_review?.status, 'REQUESTED');
  await f.service.report_issue(
    'driver-user',
    'ride',
    'CANCELLATION',
    'Retry after network interruption',
  );
  assert.equal(String(f.trip.settlement_review?.fee_amount), '5');
  assert.equal(
    f.events.filter((e) => e.event_type === 'PASSENGER_NO_SHOW_REPORTED')
      .length,
    1,
  );
});

it('cancellation rereads eligibility after the driver lock and preserves suspension', async () => {
  for (const suspended of [false, true]) {
    const f = fixture();
    f.trip.status = 'DRIVER_ASSIGNED';
    f.onDriverLock(() => {
      f.driver.verification_status = 'REJECTED';
      if (suspended) f.driver.availability = 'SUSPENDED';
    });
    await f.service.report_issue(
      'rider',
      'ride',
      'CANCELLATION',
      'Change of plans',
    );
    assert.equal(f.driver.availability, suspended ? 'SUSPENDED' : 'OFFLINE');
    assert.equal(f.trip.status, 'CANCELLED');
  }
});

it('a confirmed fare closes an earlier unpaid report so it cannot become a second debt', async () => {
  const f = fixture();
  f.trip.status = 'COMPLETED';
  f.trip.final_fare = decimal(50);
  await f.service.payment('driver-user', 'ride', 'CASH', {
    received: false,
    reason: 'Passenger has not paid yet',
  });
  assert.equal(f.trip.settlement_review?.kind, 'UNPAID');
  await f.service.payment('driver-user', 'ride', 'CASH', { received: true });
  assert.equal(f.trip.payment?.status, 'CAPTURED');
  assert.equal(f.trip.settlement_review?.status, 'SETTLED');
});

it('a waived fare cannot be reopened by changing the collection method', async () => {
  const f = fixture();
  f.trip.status = 'COMPLETED';
  f.trip.final_fare = decimal(50);
  f.trip.payment = { id: 'payment', amount: decimal(50), status: 'CANCELLED' };
  await assert.rejects(f.service.payment('rider', 'ride', 'UPI'), {
    error_code: 'FARE_WAIVED',
  });
});

it('admin settlement uses version checks, requires prior approval and cannot be collected twice', async () => {
  const f = fixture();
  f.admin();
  f.trip.settlement_review = {
    id: 'review',
    ride_id: 'ride',
    kind: 'UNPAID',
    status: 'REQUESTED',
    version: 1,
  };
  f.trip.payment = { id: 'payment', status: 'PENDING', amount: decimal(50) };
  const input = {
    expected_version: 1,
    status: 'SETTLED' as const,
    note: 'Verified original driver receipt',
  };
  await assert.rejects(f.service.review('admin', 'review', input), {
    error_code: 'APPROVAL_REQUIRED',
  });
  await f.service.review('admin', 'review', { ...input, status: 'APPROVED' });
  await assert.rejects(f.service.review('admin', 'review', input), {
    error_code: 'REVIEW_CONFLICT',
  });
  await f.service.review('admin', 'review', { ...input, expected_version: 2 });
  assert.equal(f.trip.payment.status, 'CAPTURED');
  await assert.rejects(
    f.service.review('admin', 'review', { ...input, expected_version: 3 }),
    { error_code: 'REVIEW_CLOSED' },
  );
});

it('waiving an unpaid review closes collection and leaves its audit history', async () => {
  const f = fixture();
  f.admin();
  f.trip.settlement_review = {
    id: 'review',
    ride_id: 'ride',
    kind: 'UNPAID',
    status: 'REQUESTED',
    version: 1,
  };
  f.trip.payment = { id: 'payment', status: 'PENDING', amount: decimal(50) };
  await f.service.review('admin', 'review', {
    expected_version: 1,
    status: 'WAIVED',
    note: 'Valid passenger concern verified',
  });
  assert.equal(f.trip.payment.status, 'CANCELLED');
  assert.equal(f.trip.settlement_review.status, 'WAIVED');
});

it('an obsolete unpaid review cannot waive or collect a payment that is already refunded', async () => {
  const f = fixture();
  f.admin();
  f.trip.payment = { id: 'payment', status: 'REFUNDED', amount: decimal(50) };
  f.trip.settlement_review = {
    id: 'review',
    ride_id: 'ride',
    kind: 'UNPAID',
    status: 'APPROVED',
    version: 1,
  };
  for (const status of ['WAIVED', 'SETTLED'] as const) {
    await assert.rejects(
      f.service.review('admin', 'review', {
        expected_version: 1,
        status,
        note: 'Obsolete report after resolution',
      }),
      { error_code: 'REVIEW_PAYMENT_STATE_CHANGED' },
    );
    assert.equal(f.trip.payment.status, 'REFUNDED');
  }
});

it('refunded, authorized and provider-managed payments cannot be reset to direct collection', async () => {
  for (const status of ['REFUNDED', 'PARTIALLY_REFUNDED', 'AUTHORIZED']) {
    const f = fixture();
    f.trip.status = 'COMPLETED';
    f.trip.final_fare = decimal(50);
    f.trip.payment = { id: 'payment', amount: decimal(50), status };
    await assert.rejects(
      f.service.payment('driver-user', 'ride', 'CASH', { received: true }),
      { error_code: 'PAYMENT_REVIEW_REQUIRED' },
    );
    assert.equal(f.trip.payment.status, status);
  }
  const f = fixture();
  f.trip.status = 'COMPLETED';
  f.trip.final_fare = decimal(50);
  f.trip.payment = {
    id: 'payment',
    amount: decimal(50),
    status: 'PENDING',
    provider: 'gateway',
  };
  await assert.rejects(f.service.payment('rider', 'ride', 'CASH'), {
    error_code: 'PAYMENT_REVIEW_REQUIRED',
  });
});

it('trip context marks inaccurate GPS stale and does not offer unsupported legacy UPI', async () => {
  const f = fixture();
  f.driver.last_location_accuracy_m = 1000;
  f.trip.quotes[0]!.category_snapshot.payment_policy.direct_upi_enabled = false;
  const context = await f.service.context('rider', 'ride');
  assert.equal(context.driver_location_fresh, false);
  assert.equal(context.payment_options.upi, false);
});

function matchingFixture() {
  const base = fixture();
  const candidates = Array.from({ length: 10 }, (_, i) => ({
    ...base.driver,
    id: `driver-${i}`,
    user_id: `user-${i}`,
    availability: 'AVAILABLE',
    current_latitude: decimal(25.23 + i * 0.0001),
    active_vehicle: { ...base.driver.active_vehicle, driver_id: `driver-${i}` },
  }));
  const sent: string[] = [];
  const rejected = new Set<string>();
  const upiUsers = new Set<string>();
  let upiReads = 0;
  const ride = {
    ...base.trip,
    status: 'SEARCHING',
    requested_at: new Date(),
    created_at: new Date(),
    next_dispatch_at: null,
  };
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [{ locked: true }],
    rideFarePolicy: { findUnique: async () => null },
    ride: { findUnique: async () => ride, update: async () => ride },
    driverProfile: { findMany: async () => candidates },
    driverPayoutChange: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    partnerApplication: {
      findMany: async () => {
        upiReads++;
        return [...upiUsers].map((user_id) => ({
          user_id,
          fields: [
            {
              value: 'driver@upi',
              definition: {
                key: 'upi_id',
                label: 'UPI ID',
                field_type: 'STRING',
              },
            },
          ],
        }));
      },
    },
    rideOffer: {
      findUnique: async ({
        where,
      }: {
        where: { ride_id_driver_id: { driver_id: string } };
      }) =>
        rejected.has(where.ride_id_driver_id.driver_id)
          ? { status: 'REJECTED' }
          : null,
      create: async ({ data }: { data: { driver_id: string } }) => {
        sent.push(data.driver_id);
        return data;
      },
    },
  };
  const db = new PrismaService();
  Object.defineProperty(db, 'client', {
    value: {
      ...tx,
      $transaction: async (action: (t: typeof tx) => Promise<unknown>) =>
        action(tx),
    },
  });
  return {
    service: new DriverOperationsService(db, new GeocodeService()),
    candidates,
    sent,
    rejected,
    upiUsers,
    upiReads: () => upiReads,
    ride,
  };
}

it('matching reaches other drivers when the nearest eight have declined', async () => {
  const f = matchingFixture();
  f.candidates.slice(0, 8).forEach((d) => f.rejected.add(d.id));
  await f.service.dispatch('ride');
  assert.deepEqual(f.sent, ['driver-8', 'driver-9']);
});

it('matching skips incompatible UPI drivers before limiting offers and prioritizes available drivers', async () => {
  const f = matchingFixture();
  f.ride.collection_preference = 'UPI';
  f.upiUsers.add('user-9');
  await f.service.dispatch('ride');
  assert.deepEqual(f.sent, ['driver-9']);
  assert.equal(f.upiReads(), 1);
  const cash = matchingFixture();
  cash.candidates.slice(0, 8).forEach((d) => (d.availability = 'ON_TRIP'));
  await cash.service.dispatch('ride');
  assert.deepEqual(cash.sent.slice(0, 2), ['driver-8', 'driver-9']);
  assert.equal(cash.sent.length, 8);
});

it('offer acceptance rechecks search deadline and current pickup radius, while retries preserve the assignment', async () => {
  const base = fixture();
  const profile = {
    ...base.driver,
    availability: 'AVAILABLE',
    active_vehicle_id: 'vehicle',
  };
  const offer = {
    id: 'offer',
    ride_id: 'ride',
    status: 'SENT',
    expires_at: new Date(Date.now() + 45000),
    ride: {
      ...base.trip,
      status: 'SEARCHING',
      driver_id: null as string | null,
      requested_at: new Date(Date.now() - 181000),
      created_at: new Date(),
      search_radius_km: 1,
    },
  };
  const tx = {
    $executeRaw: async () => 1,
    user: {
      findUnique: async () => ({
        role: 'DRIVER',
        status: 'ACTIVE',
        deleted_at: null,
      }),
    },
    driverPayoutChange: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    partnerApplication: { findUnique: async () => ({ status: 'ACTIVATED' }) },
    driverProfile: {
      findUnique: async () => profile,
      update: async () => profile,
    },
    rideFarePolicy: { findUnique: async () => null },
    ride: {
      findFirst: async () => null,
      count: async () => 0,
      updateMany: async () => {
        offer.ride.driver_id = 'driver';
        offer.ride.status = 'DRIVER_ASSIGNED';
        return { count: 1 };
      },
    },
    rideOffer: {
      findFirst: async () => offer,
      update: async () => {
        offer.status = 'ACCEPTED';
        return offer;
      },
      updateMany: async () => ({ count: 0 }),
    },
    rideEvent: { create: async () => ({}) },
    userLog: { create: async () => ({}) },
  };
  const db = new PrismaService();
  Object.defineProperty(db, 'client', {
    value: {
      $transaction: async (action: (t: typeof tx) => Promise<unknown>) =>
        action(tx),
    },
  });
  const repo = new DriverRepository(db);
  assert.equal(
    (await repo.accept_offer('driver-user', 'offer')).kind,
    'not_available',
  );
  offer.ride.requested_at = new Date();
  profile.current_latitude = decimal(26);
  assert.equal(
    (await repo.accept_offer('driver-user', 'offer')).kind,
    'not_available',
  );
  profile.current_latitude = decimal(25.23);
  assert.deepEqual(await repo.accept_offer('driver-user', 'offer'), {
    kind: 'success',
    ride_id: 'ride',
  });
  profile.availability = 'EN_ROUTE';
  profile.last_location_at = new Date(0);
  assert.deepEqual(await repo.accept_offer('driver-user', 'offer'), {
    kind: 'success',
    ride_id: 'ride',
  });
});

it('driver routes identify their actual target and protect assignment and terminal state', async () => {
  const f = fixture();
  const inputs: unknown[] = [];
  mock.method(f.routing, 'driving_route', async (input: unknown) => {
    inputs.push(input);
    return {
      distance_m: 450,
      duration_s: 90,
      geometry: [
        [86.95, 25.23],
        [86.96, 25.24],
      ],
      steps: [],
    };
  });
  try {
    const pickup = await f.service.navigation(
      'driver-user',
      'ride',
      25.23,
      86.95,
    );
    assert.equal(pickup.target, 'PICKUP');
    f.trip.status = 'IN_PROGRESS';
    const dropoff = await f.service.navigation(
      'driver-user',
      'ride',
      25.23,
      86.95,
    );
    assert.equal(dropoff.target, 'DROPOFF');
    assert.deepEqual(inputs, [
      {
        from_latitude: 25.23,
        from_longitude: 86.95,
        to_latitude: 25.23,
        to_longitude: 86.95,
      },
      {
        from_latitude: 25.23,
        from_longitude: 86.95,
        to_latitude: 25.24,
        to_longitude: 86.96,
      },
    ]);
    await assert.rejects(
      () => f.service.navigation('rider', 'ride', 25.23, 86.95),
      { error_code: 'TRIP_NAVIGATION_UNAVAILABLE' },
    );
    await assert.rejects(
      () => f.service.navigation('outsider', 'ride', 25.23, 86.95),
      { status_code: 404 },
    );
    f.trip.status = 'COMPLETED';
    await assert.rejects(
      () => f.service.navigation('driver-user', 'ride', 25.23, 86.95),
      { error_code: 'TRIP_NAVIGATION_UNAVAILABLE' },
    );
    assert.equal(inputs.length, 2);
  } finally {
    mock.restoreAll();
  }
});

it('rider progress routes use server driver GPS and switch target only after trip start', async () => {
  const f = fixture();
  const inputs: unknown[] = [];
  const route = {
    distance_m: 450,
    duration_s: 90,
    geometry: [
      [86.95, 25.23],
      [86.96, 25.24],
    ],
  };
  mock.method(f.routing, 'driving_route', async (input: unknown) => {
    inputs.push(input);
    return route;
  });
  try {
    const pickup = await f.service.rider_route('rider', 'ride');
    assert.equal(pickup.target, 'PICKUP');
    assert.deepEqual(inputs[0], {
      from_latitude: 25.23,
      from_longitude: 86.95,
      to_latitude: 25.23,
      to_longitude: 86.95,
    });
    f.trip.status = 'IN_PROGRESS';
    const dropoff = await f.service.rider_route('rider', 'ride');
    assert.equal(dropoff.target, 'DROPOFF');
    assert.deepEqual(inputs[1], {
      from_latitude: 25.23,
      from_longitude: 86.95,
      to_latitude: 25.24,
      to_longitude: 86.96,
    });
    assert.deepEqual(dropoff.geometry, route.geometry);
    assert.equal(f.readSnapshots(), 2);
  } finally {
    mock.restoreAll();
  }
});

it('rider route protects ownership, role, terminal trips and stale or imprecise GPS', async () => {
  const f = fixture();
  await assert.rejects(() => f.service.rider_route('outsider', 'ride'), {
    status_code: 404,
  });
  await assert.rejects(() => f.service.rider_route('driver-user', 'ride'), {
    error_code: 'RIDER_ROUTE_UNAVAILABLE',
  });
  f.trip.status = 'COMPLETED';
  await assert.rejects(() => f.service.rider_route('rider', 'ride'), {
    error_code: 'RIDER_ROUTE_UNAVAILABLE',
  });
  f.trip.status = 'DRIVER_ASSIGNED';
  f.driver.last_location_at = new Date(Date.now() - 61000);
  await assert.rejects(() => f.service.rider_route('rider', 'ride'), {
    error_code: 'DRIVER_LOCATION_STALE',
  });
  f.driver.last_location_at = new Date();
  f.driver.last_location_accuracy_m = 151;
  await assert.rejects(() => f.service.rider_route('rider', 'ride'), {
    error_code: 'DRIVER_LOCATION_STALE',
  });
});

it('rider snapshots disclose timestamped location only during their active trip', async () => {
  const f = fixture();
  assert.ok((await f.service.context('rider', 'ride')).driver_location);
  assert.equal(
    (await f.service.context('driver-user', 'ride')).driver_location,
    null,
  );
  f.trip.status = 'COMPLETED';
  assert.equal(
    (await f.service.context('rider', 'ride')).driver_location,
    null,
  );
});

it('rider history scopes both rows and counts to the rider and excludes unbooked drafts', async () => {
  const calls: {
    where: unknown;
    skip?: number;
    take?: number;
    select?: unknown;
  }[] = [];
  const db = new PrismaService();
  Object.defineProperty(db, 'client', {
    value: {
      ride: {
        findMany: async (args: (typeof calls)[number]) => {
          calls.push(args);
          return [{ id: 'own-ride' }];
        },
        count: async (args: (typeof calls)[number]) => {
          calls.push(args);
          return 21;
        },
      },
      $transaction: async (
        queries: Promise<unknown>[],
        options: { isolationLevel: string },
      ) => {
        assert.equal(options.isolationLevel, 'RepeatableRead');
        return Promise.all(queries);
      },
    },
  });
  const service = new TravelContextService(db);
  const result = await service.rider_history('rider', 2, 20, 'past');
  assert.equal(result.total, 21);
  assert.equal(result.page, 2);
  assert.equal(calls[0]?.skip, 20);
  assert.equal(calls[0]?.take, 20);
  assert.deepEqual(calls[0]?.where, calls[1]?.where);
  const where = calls[0]?.where as {
    rider_id: string;
    status: { notIn: string[] };
  };
  assert.equal(where.rider_id, 'rider');
  assert.ok(where.status.notIn.includes('DRAFT'));
  assert.ok(where.status.notIn.includes('IN_PROGRESS'));
  await service.rider_history('rider', 1, 20, 'all');
  assert.deepEqual(calls[2]?.where, {
    rider_id: 'rider',
    status: { not: 'DRAFT' },
  });
  await service.rider_history('rider', 1, 20, 'active');
  assert.ok(JSON.stringify(calls[4]?.where).includes('IN_PROGRESS'));
});

it('rider route rejects future GPS timestamps and invalid accuracy instead of labelling them fresh', async () => {
  const f = fixture();
  f.driver.last_location_at = new Date(Date.now() + 60000);
  assert.equal(
    (await f.service.context('rider', 'ride')).driver_location_fresh,
    false,
  );
  await assert.rejects(() => f.service.rider_route('rider', 'ride'), {
    error_code: 'DRIVER_LOCATION_STALE',
  });
  f.driver.last_location_at = new Date();
  f.driver.last_location_accuracy_m = -1;
  assert.equal(
    (await f.service.context('rider', 'ride')).driver_location_fresh,
    false,
  );
  await assert.rejects(() => f.service.rider_route('rider', 'ride'), {
    error_code: 'DRIVER_LOCATION_STALE',
  });
});

it('rider routing rechecks GPS age after a slow provider response', async () => {
  const f = fixture();
  const now = Date.now();
  let time = now;
  f.driver.last_location_at = new Date(now - 59000);
  mock.method(Date, 'now', () => time);
  mock.method(f.routing, 'driving_route', async () => {
    time += 2000;
    return {
      distance_m: 100,
      duration_s: 60,
      geometry: [
        [86.95, 25.23],
        [86.96, 25.24],
      ],
    };
  });
  try {
    await assert.rejects(() => f.service.rider_route('rider', 'ride'), {
      error_code: 'DRIVER_LOCATION_STALE',
    });
  } finally {
    mock.restoreAll();
  }
});

it('trip context prevents direct recollection of provider-managed pending payments', async () => {
  const f = fixture();
  f.trip.status = 'COMPLETED';
  f.trip.payment = {
    id: 'payment',
    status: 'PENDING',
    amount: decimal(50),
    provider: 'legacy-provider',
  };
  assert.equal(
    (await f.service.context('rider', 'ride')).direct_collection_allowed,
    false,
  );
  f.trip.payment.provider = null;
  assert.equal(
    (await f.service.context('rider', 'ride')).direct_collection_allowed,
    true,
  );
  f.trip.payment.status = 'REQUIRES_ACTION';
  assert.equal(
    (await f.service.context('rider', 'ride')).direct_collection_allowed,
    false,
  );
});

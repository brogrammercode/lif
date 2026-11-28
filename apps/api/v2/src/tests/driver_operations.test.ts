import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mock } from 'node:test';
import { TravelContextService } from '../features/travel_context/travel_context.service.js';
import { TravelContextRepository } from '../features/travel_context/travel-context.repository.js';
import { travelSql } from '../features/travel_context/sql/travel-context.sql.js';
import type { PostgresService } from '../database/postgres.service.js';
import { rider_history_schema } from '../features/travel_context/dto/ride-history.dto.js';
import { DriverRepository } from '../features/driver/driver.repo.js';
import { Prisma, type RideStartVerification } from '@prisma/client';
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
} from '../features/driver_operations/dto/driver-operations.dto.js';

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
    actual_duration_s: null as number | null,
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
            commission_percent: 0,
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
      updated_at?: Date;
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
  let walletEnabled = false;
  const cashEntries: Prisma.WalletEntryUncheckedCreateInput[] = [];
  let driverLockHook: (() => void) | undefined;
  const routing = new GeocodeService();
  const query = async (statement: string, values: unknown[] = []) => {
    if (statement.includes('FROM ride_fare_policies')) return { rows: [] };
    if (statement.includes('FROM users WHERE id'))
      return {
        rows: [{ role: actorRole, status: 'ACTIVE', deleted_at: null }],
      };
    if (statement.startsWith('SELECT status FROM partner_applications'))
      return { rows: [{ status: 'ACTIVATED' }] };
    if (statement.includes('AS has_active_trip')) {
      readSnapshots++;
      if (
        values[0] !== trip.id ||
        ![trip.rider_id, driver.user_id].includes(String(values[1]))
      )
        return { rows: [] };
      return {
        rows: [
          {
            ...trip,
            driver: { ...driver },
            has_active_trip: otherActiveTrip,
            contact_attempted: events.some(
              (event) =>
                event.event_type === 'CALL_ATTEMPT' &&
                event.actor_id === values[1],
            ),
            wallet_available: '5000',
            wallet_enabled: walletEnabled,
            razorpay_upi_enabled: false,
          },
        ],
      };
    }
    if (statement.includes('FROM partner_application_fields'))
      return {
        rows: [
          {
            value: 'driver@upi',
            definition: {
              label: 'UPI ID',
              key: 'upi_id',
              field_type: 'STRING',
            },
          },
        ],
      };
    if (statement.includes('pg_advisory_xact_lock(720043')) driverLockHook?.();
    if (statement.startsWith('INSERT INTO ride_start_verifications')) {
      trip.start_verification = {
        ...trip.start_verification,
        ride_id: String(values[0]),
        driver_id: String(values[1]),
        assignment_at: values[2] as Date,
        code_hash: String(values[3]),
        code_ciphertext: String(values[4]),
        expires_at: values[5] as Date,
        attempts: 0,
        rider_confirmed_at: null,
        driver_verified_at: null,
        used_at: null,
      };
      return { rows: [] };
    }
    if (statement.startsWith('UPDATE ride_start_verifications')) {
      const verification = trip.start_verification;
      if (statement.includes('attempts=attempts+1')) verification.attempts++;
      if (statement.includes("code_ciphertext=''")) {
        verification.used_at = new Date();
        verification.code_ciphertext = '';
        verification.code_hash = '';
      }
      if (statement.includes('RETURNING rider_confirmed_at')) {
        if (values[1]) verification.rider_confirmed_at ??= new Date();
        else verification.driver_verified_at ??= new Date();
      }
      return { rows: [{ ...verification }] };
    }
    if (statement.startsWith('UPDATE rides SET status=')) {
      if (statement.includes("'DRIVER_WAITING'")) {
        trip.status = 'DRIVER_WAITING';
        trip.arrived_at = new Date();
      } else if (statement.includes("'IN_PROGRESS'")) {
        trip.status = 'IN_PROGRESS';
        trip.started_at = new Date();
      } else if (statement.includes("'COMPLETED'")) {
        trip.status = 'COMPLETED';
        trip.completed_at = new Date();
        trip.final_fare = decimal(Number(values[1]));
        trip.actual_duration_s = Number(values[2]);
        trip.actual_distance_m = values[3] as number | null;
      } else if (statement.includes("'CANCELLED'")) {
        trip.status = 'CANCELLED';
        Object.assign(trip, {
          cancel_reason: values[1],
          cancelled_at: new Date(),
        });
      }
    }
    if (statement.startsWith('SELECT latitude,longitude,recorded_at'))
      return { rows: locations };
    if (statement.startsWith('UPDATE driver_profiles')) {
      if (statement.includes("'ON_TRIP'")) driver.availability = 'ON_TRIP';
      if (statement.includes('SET availability=$2'))
        driver.availability = String(values[1]);
      if (statement.includes('completed_rides=completed_rides+1')) {
        completions++;
        driver.availability = String(values[1]);
      }
    }
    if (statement.startsWith('INSERT INTO payments')) {
      trip.payment ??= {
        id: 'payment',
        status: 'PENDING',
        amount: decimal(Number(values[2])),
        updated_at: new Date(),
      };
      if (statement.includes("collection_method='WALLET'")) {
        Object.assign(trip.payment, {
          collection_method: 'WALLET',
          status: 'PENDING',
          recipient_upi: null,
          updated_at: new Date(),
        });
      }
      if (statement.includes('RETURNING id')) {
        Object.assign(trip.payment, {
          collection_method: values[4],
          recipient_upi: values[5],
          status: values[6],
          confirmed_by_id: values[7],
          paid_at: values[8],
          updated_at: new Date(),
          ...(values[10] ? { unpaid_reason: values[9] } : {}),
        });
        return { rows: [{ id: trip.payment.id }] };
      }
    }
    if (statement.includes('FROM payout_schedules'))
      return { rows: [{ wallet_ride_collection_enabled: walletEnabled }] };
    if (
      statement.includes(
        'SELECT id,kind,available_paise,held_paise FROM wallets',
      )
    )
      return {
        rows: [
          {
            id: values[0],
            kind: 'RIDER',
            available_paise: '5000',
            held_paise: '100',
          },
          {
            id: values[1],
            kind: 'DRIVER',
            available_paise: '5000',
            held_paise: '100',
          },
        ],
      };
    if (statement.startsWith('INSERT INTO wallet_entries')) {
      cashEntries.push({
        id: String(values[0]),
        wallet_id: String(values[1]),
        kind: 'CASH_PAYMENT',
        ride_id: String(values[2]),
        payment_id: String(values[3]),
        operation_key: String(values[4]),
        external_amount_paise: BigInt(String(values[5])),
        available_delta_paise: 0n,
        held_delta_paise: 0n,
        available_after_paise: BigInt(String(values[6])),
        held_after_paise: BigInt(String(values[7])),
        commission_paise:
          values[8] == null ? undefined : BigInt(String(values[8])),
        commission_percent: values[9] == null ? undefined : Number(values[9]),
      });
    }
    if (statement.startsWith('INSERT INTO ride_settlement_reviews')) {
      const unpaid = statement.includes("'UNPAID'");
      trip.settlement_review ??= {
        id: values[0],
        ride_id: values[1],
        status: unpaid ? 'REQUESTED' : values[7],
        kind: unpaid ? 'UNPAID' : values[4],
        reason: unpaid ? values[4] : values[5],
        fee_amount: decimal(Number(unpaid ? values[5] : values[6])),
        version: 1,
      };
    }
    if (statement.startsWith('SELECT metadata FROM ride_events'))
      return {
        rows: events.filter(
          (event) =>
            event.event_type === 'DRIVER_WAITING' &&
            event.actor_id === values[1],
        ),
      };
    if (
      statement.includes('FROM ride_settlement_reviews') &&
      statement.startsWith('SELECT')
    )
      return {
        rows: trip.settlement_review ? [{ ...trip.settlement_review }] : [],
      };
    if (statement.startsWith('SELECT status,provider,provider_payment_id'))
      return { rows: trip.payment ? [{ ...trip.payment }] : [] };
    if (statement.startsWith('UPDATE ride_settlement_reviews s SET'))
      return {
        rows: trip.settlement_review
          ? [
              Object.assign(trip.settlement_review, {
                status: values[1],
                resolution_note: values[2],
                resolved_by_id: values[3],
                version: Number(values[4]) + 1,
              }),
            ]
          : [],
      };
    if (
      statement.startsWith(
        "UPDATE ride_settlement_reviews SET status='DISPUTED'",
      ) &&
      trip.settlement_review
    )
      Object.assign(trip.settlement_review, {
        status: 'DISPUTED',
        dispute_reason: values[1],
        version: Number(trip.settlement_review.version) + 1,
      });
    if (statement.startsWith('UPDATE payments') && trip.payment) {
      if (statement.includes("'CANCELLED'"))
        Object.assign(trip.payment, {
          status: 'CANCELLED',
          unpaid_reason: values[1],
        });
      else if (statement.includes("'CAPTURED'"))
        Object.assign(trip.payment, {
          status: 'CAPTURED',
          unpaid_reason: null,
          confirmed_by_id: values[1],
          paid_at: new Date(),
        });
    }
    if (
      statement.startsWith('UPDATE ride_settlement_reviews') &&
      trip.settlement_review?.kind === 'UNPAID' &&
      ['REQUESTED', 'DISPUTED', 'APPROVED'].includes(
        String(trip.settlement_review.status),
      )
    ) {
      trip.settlement_review.status = 'SETTLED';
    }
    if (
      statement.startsWith('INSERT INTO ride_events') &&
      !statement.includes("'CALL_ATTEMPT'")
    ) {
      events.push({
        event_type: String(values[3]),
        actor_id: String(values[2]),
        metadata: values[4] ? JSON.parse(String(values[4])) : undefined,
      });
    }
    if (statement.includes('FROM rides r LEFT JOIN driver_profiles')) {
      readSnapshots++;
      if (
        values[0] !== trip.id ||
        ![trip.rider_id, driver.user_id].includes(String(values[1]))
      )
        return { rows: [] };
      return {
        rows: [
          {
            ...trip,
            driver_user_id: driver.user_id,
            current_latitude: driver.current_latitude,
            current_longitude: driver.current_longitude,
            last_location_at: driver.last_location_at,
            last_location_accuracy_m: driver.last_location_accuracy_m,
            driver_phone: driver.user.phone_e164,
            rider_phone: trip.rider.phone_e164,
            payment_status: trip.payment?.status ?? null,
          },
        ],
      };
    }
    if (statement.includes("'CALL_ATTEMPT'")) {
      events.push({
        event_type: 'CALL_ATTEMPT',
        actor_id: String(values[2]),
        metadata: { connection_verified: false },
      });
    }
    return { rows: [] };
  };
  const postgres = {
    query,
    transaction: (work: (client: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService;
  return {
    service: new DriverOperationsService(routing, postgres),
    routing,
    trip,
    driver,
    events,
    locations,
    cashEntries,
    completions: () => completions,
    allowWallet: (enabled: boolean) => {
      walletEnabled = enabled;
    },
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
    'location update',
    (repo) =>
      repo.record_location('driver-user', { latitude: 25, longitude: 87 }),
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
      const sql = {
        transaction: async (
          work: (client: {
            query: (
              sql: string,
              values?: unknown[],
            ) => Promise<{ rows: unknown[] }>;
          }) => Promise<unknown>,
        ) =>
          work({
            query: async (statement, values = []) => {
              if (statement.includes('pg_advisory_xact_lock_shared')) {
                locks.push(values);
                user = inactive;
                return { rows: [] };
              }
              assert.match(statement, /FROM users WHERE id/);
              reads++;
              return { rows: user ? [user] : [] };
            },
          }),
      } as unknown as PostgresService;
      await assert.rejects(() => action(new DriverRepository(sql)), {
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
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes('FROM users WHERE'))
        return { rows: [{ role: 'DRIVER', status: 'ACTIVE' }] };
      if (sql.includes('FROM partner_applications'))
        return { rows: [{ status: 'ACTIVATED' }] };
      if (sql.includes('AS vehicle'))
        return { rows: [{ vehicle: f.driver.active_vehicle }] };
      if (sql.startsWith('SELECT active_vehicle_id'))
        return { rows: [{ active_vehicle_id: null }] };
      if (sql.startsWith('UPDATE driver_profiles')) {
        const data = { active_vehicle_id: values[1] };
        writes.push(data);
        return { rows: [data] };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const db = {
    transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PostgresService;
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
it('records cash on both wallets without moving balance and snapshots the driver commission once', async () => {
  const f = fixture();
  f.trip.status = 'COMPLETED';
  f.trip.final_fare = decimal(50.04);
  f.trip.quotes[0]!.category_snapshot.payment_policy.commission_percent = 12.5;
  await f.service.payment('rider', 'ride', 'CASH');
  assert.equal(f.cashEntries.length, 0);
  await f.service.payment('driver-user', 'ride', 'CASH', { received: true });
  await f.service.payment('driver-user', 'ride', 'CASH', { received: true });
  assert.equal(f.cashEntries.length, 2);
  const [rider, driver] = f.cashEntries;
  assert.equal(rider?.external_amount_paise, -5004n);
  assert.equal(driver?.external_amount_paise, 5004n);
  assert.equal(driver?.commission_paise, 626n);
  assert.equal(rider?.commission_paise, undefined);
  for (const entry of f.cashEntries) {
    assert.equal(entry.available_delta_paise, 0n);
    assert.equal(entry.held_delta_paise, 0n);
    assert.equal(entry.available_after_paise, 5000n);
    assert.equal(entry.held_after_paise, 100n);
  }
});
it('uses admin settings for ride Wallet selection and unlocks direct receipt when disabled', async () => {
  const f = fixture();
  f.trip.status = 'COMPLETED';
  f.trip.final_fare = decimal(50);
  await assert.rejects(f.service.payment('rider', 'ride', 'WALLET'), {
    error_code: 'WALLET_UNAVAILABLE',
  });
  f.allowWallet(true);
  const selected = await f.service.payment('rider', 'ride', 'WALLET');
  assert.equal(selected.wallet_payment_selected, true);
  assert.equal(selected.payment_options.wallet_available_paise, '5000');
  await assert.rejects(
    f.service.payment('driver-user', 'ride', 'CASH', { received: true }),
    { error_code: 'WALLET_PAYMENT_SELECTED' },
  );
  f.allowWallet(false);
  assert.equal(
    (await f.service.context('driver-user', 'ride')).direct_collection_allowed,
    true,
  );
  assert.equal(
    (await f.service.context('rider', 'ride')).payment_options.wallet,
    false,
  );
  await f.service.payment('driver-user', 'ride', 'CASH', { received: true });
  assert.equal(f.trip.payment?.status, 'CAPTURED');
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
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('pg_try_advisory')) return { rows: [{ locked: true }] };
    if (sql.includes('FROM rides r WHERE'))
      return { rows: [{ ...ride, quote: ride.quotes[0] }] };
    if (sql.includes('FROM driver_profiles p')) return { rows: candidates };
    if (sql.includes('FROM partner_application_fields')) {
      upiReads++;
      return {
        rows: [...upiUsers].map((user_id) => ({
          user_id,
          value: 'driver@upi',
          definition: { key: 'upi_id', label: 'UPI ID', field_type: 'STRING' },
        })),
      };
    }
    if (sql.startsWith('SELECT driver_id,status,expires_at'))
      return {
        rows: [...rejected].map((driver_id) => ({
          driver_id,
          status: 'REJECTED',
        })),
      };
    if (sql.startsWith('INSERT INTO ride_offers')) {
      sent.push(params[2] as string);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  const postgres = {
    query,
    transaction: (work: (tx: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService;
  return {
    service: new DriverOperationsService(new GeocodeService(), postgres),
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
    query: async (sql: string) => {
      if (sql.includes('FROM users WHERE'))
        return { rows: [{ role: 'DRIVER', status: 'ACTIVE' }] };
      if (sql.includes('FROM partner_applications'))
        return { rows: [{ status: 'ACTIVATED' }] };
      if (sql.includes('AS active_vehicle')) return { rows: [profile] };
      if (sql.startsWith('SELECT o.ride_id'))
        return { rows: [{ ride_id: offer.ride_id }] };
      if (sql.startsWith('SELECT o.status'))
        return {
          rows: [
            {
              ...offer.ride,
              status: offer.status,
              expires_at: offer.expires_at,
              ride_id: offer.ride_id,
              ride_status: offer.ride.status,
              selected_quote: offer.ride.quotes[0],
            },
          ],
        };
      if (sql.startsWith('UPDATE rides')) {
        offer.ride.driver_id = 'driver';
        offer.ride.status = 'DRIVER_ASSIGNED';
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SET status='ACCEPTED'")) offer.status = 'ACCEPTED';
      return { rows: [], rowCount: 0 };
    },
  };
  const db = {
    transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PostgresService;
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

it('recovers rider and driver trips and only allows driver mode for an eligible account', async () => {
  const rows = [
    {
      role: 'DRIVER',
      partner_status: null,
      partner_activated_at: null,
      availability: 'OFFLINE',
      rider_ride: { id: 'rider-trip', status: 'IN_PROGRESS' },
      driver_ride: { id: 'driver-trip', status: 'COMPLETED' },
    },
  ];
  const db = {
    query: async (sql: string, args: unknown[]) => {
      assert.deepEqual(args, ['account']);
      if (sql === travelSql.context) return { rows };
      assert.equal(sql, travelSql.driverCurrent);
      return { rows: [rows[0]!.driver_ride] };
    },
  } as PostgresService;
  const service = new TravelContextService(new TravelContextRepository(db));
  const context = await service.context('account');
  assert.equal(context.active_rider_ride?.id, 'rider-trip');
  assert.equal(context.active_driver_ride?.id, 'driver-trip');
  assert.equal(context.can_enter_driver_mode, true);
  assert.equal(context.mode_switch_allowed, false);
  assert.equal((await service.current('account'))?.id, 'driver-trip');
});

it('scopes history counts and page identically and binds search, category and IST month', async () => {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const groups = [
    { status: 'SEARCHING', total: 2 },
    { status: 'COMPLETED', total: 7 },
    { status: 'CANCELLED', total: 1 },
    { status: 'NO_DRIVER_FOUND', total: 3 },
  ];
  const db = {
    transaction: async (
      callback: (tx: {
        query: (sql: string, args: unknown[]) => Promise<{ rows: unknown[] }>;
      }) => unknown,
      isolation: string,
    ) => {
      assert.equal(isolation, 'REPEATABLE READ');
      return callback({
        query: async (sql, args) => {
          calls.push({ sql, args });
          return {
            rows:
              sql === travelSql.riderCounts ? groups : [{ id: 'owned-ride' }],
          };
        },
      });
    },
  } as PostgresService;
  const repository = new TravelContextRepository(db);
  const result = await repository.rider_history('owner', 2, 20, 'past', {
    query: '#TRP-9007199254740993',
    category_id: '9007199254740995',
    month: '2026-10',
  });
  const [countCall, listCall] = calls;
  assert.equal(countCall?.sql, travelSql.riderCounts);
  assert.deepEqual(countCall?.args, [
    'owner',
    '9007199254740993',
    '#TRP-9007199254740993',
    '9007199254740995',
    new Date('2026-09-30T18:30:00.000Z'),
    new Date('2026-10-31T18:30:00.000Z'),
  ]);
  assert.equal(listCall?.sql, travelSql.riderList);
  assert.deepEqual(listCall?.args, [
    ...countCall!.args,
    ['COMPLETED', 'CANCELLED', 'NO_DRIVER_FOUND'],
    20,
    20,
  ]);
  assert.deepEqual(result.counts, {
    all: 13,
    active: 2,
    completed: 7,
    cancelled: 1,
    unfulfilled: 3,
    past: 11,
  });
  assert.equal(result.total, 11);
  assert.equal(result.page, 2);
});

it('history rejects malformed filters and preserves large string identifiers', () => {
  assert.equal(
    rider_history_schema.parse({ category_id: '9007199254740995' }).category_id,
    '9007199254740995',
  );
  for (const input of [
    { month: '2026-13' },
    { month: '2026-1' },
    { query: 'x'.repeat(121) },
    { section: 'everyone' },
    { category_id: 9007199254740995 },
    { page_size: 101 },
    { user_id: 'foreign' },
  ]) {
    assert.equal(rider_history_schema.safeParse(input).success, false);
  }
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

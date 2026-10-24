import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service.js';
import { PaymentRepository } from '../features/payment/payment.repo.js';

it('binds a provider reference on the initial pending callback and processes reference-only updates once', async () => {
  let payment = {
    id: 'payment',
    ride_id: 'ride',
    status: 'PENDING',
    provider: null as string | null,
    provider_payment_id: null as string | null,
    amount: new Prisma.Decimal(100),
    paid_at: null as Date | null,
    failed_at: null as Date | null,
    refunded_at: null as Date | null,
  };
  let updates = 0;
  let events = 0;
  const transaction = {
    $executeRaw: async () => 1,
    payment: {
      findFirst: async ({
        where,
      }: {
        where: { OR: { provider_payment_id?: string; ride_id?: string }[] };
      }) =>
        where.OR.some(
          (item) =>
            item.ride_id === payment.ride_id ||
            (item.provider_payment_id !== undefined &&
              item.provider_payment_id === payment.provider_payment_id),
        )
          ? payment
          : null,
      findUniqueOrThrow: async () => payment,
      update: async ({ data }: { data: Partial<typeof payment> }) => {
        updates++;
        payment = { ...payment, ...data };
        return payment;
      },
    },
    rideEvent: {
      create: async () => {
        events++;
        return {};
      },
    },
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
  const repository = new PaymentRepository(database);
  await repository.process_webhook('gateway', {
    ride_id: 'ride',
    provider_payment_id: 'reference',
    status: 'PENDING',
  });
  assert.equal(payment.provider_payment_id, 'reference');
  assert.equal(payment.provider, 'gateway');
  assert.equal(events, 0);
  const captured = await repository.process_webhook('gateway', {
    provider_payment_id: 'reference',
    status: 'CAPTURED',
    amount: 100,
  });
  assert.equal(captured?.status, 'CAPTURED');
  const paidAt = payment.paid_at;
  assert.ok(paidAt);
  await repository.process_webhook('gateway', {
    provider_payment_id: 'reference',
    status: 'CAPTURED',
    amount: 100,
  });
  await repository.process_webhook('gateway', {
    provider_payment_id: 'reference',
    status: 'PENDING',
  });
  assert.equal(payment.status, 'CAPTURED');
  assert.equal(payment.paid_at, paidAt);
  assert.equal(updates, 2);
  assert.equal(events, 1);
  await repository.process_webhook('gateway', {
    provider_payment_id: 'reference',
    status: 'PARTIALLY_REFUNDED',
  });
  const partial_time = new Date('2020-01-01T00:00:00Z');
  payment.refunded_at = partial_time;
  await repository.process_webhook('gateway', {
    provider_payment_id: 'reference',
    status: 'REFUNDED',
  });
  assert.ok(payment.refunded_at && payment.refunded_at > partial_time);
  assert.equal(events, 3);
});

function database(client: unknown) {
  const db = new PrismaService();
  Object.defineProperty(db, 'client', { value: client });
  return db;
}

it('legacy cash checkout clears direct UPI metadata without changing an unpaid report', async () => {
  const payment = {
    id: 'payment',
    status: 'PENDING',
    collection_method: 'UPI',
    recipient_upi: 'driver@upi',
    unpaid_reason: 'Awaiting receipt',
    amount: new Prisma.Decimal(50),
  };
  const tx = {
    $executeRaw: async () => 1,
    ride: {
      findFirst: async () => ({
        id: 'ride',
        status: 'COMPLETED',
        final_fare: new Prisma.Decimal(50),
        currency: 'INR',
        quotes: [
          {
            category_snapshot: {
              payment_policy: { cash_enabled: true, direct_upi_enabled: true },
            },
          },
        ],
      }),
    },
    payment: {
      findUnique: async () => payment,
      upsert: async ({ update }: { update: Partial<typeof payment> }) =>
        Object.assign(payment, update),
    },
    paymentMethod: { findFirst: async () => ({ id: 'cash', type: 'CASH' }) },
    userLog: { create: async () => ({}) },
  };
  const repo = new PaymentRepository(
    database({
      $transaction: async (action: (t: typeof tx) => Promise<unknown>) =>
        action(tx),
    }),
  );
  await repo.create_checkout('rider', {
    ride_id: 'ride',
    payment_method_id: 'cash',
  });
  assert.equal(payment.collection_method, 'CASH');
  assert.equal(payment.recipient_upi, null);
  assert.equal(payment.status, 'PENDING');
  assert.equal(payment.unpaid_reason, 'Awaiting receipt');
});

it('a signed provider callback cannot capture a direct cash or UPI collection', async () => {
  for (const collection_method of ['CASH', 'UPI']) {
    const payment = {
      id: 'payment',
      ride_id: 'ride',
      status: 'PENDING',
      collection_method,
    };
    const tx = {
      $executeRaw: async () => 1,
      payment: {
        findFirst: async () => payment,
        findUniqueOrThrow: async () => payment,
      },
    };
    const repo = new PaymentRepository(
      database({
        $transaction: async (action: (t: typeof tx) => Promise<unknown>) =>
          action(tx),
      }),
    );
    await assert.rejects(
      repo.process_webhook('gateway', {
        ride_id: 'ride',
        provider_payment_id: 'external-reference',
        status: 'CAPTURED',
        amount: 50,
      }),
      { error_code: 'DIRECT_PAYMENT_WEBHOOK_UNSUPPORTED' },
    );
    assert.equal(payment.status, 'PENDING');
  }
});

it('receipt queries expose public driver and vehicle details without private profile data', async () => {
  let query: {
    where?: unknown;
    include?: {
      driver: { select: Record<string, unknown> };
      vehicle: { select: Record<string, unknown> };
    };
  } = {};
  const repo = new PaymentRepository(
    database({
      ride: {
        findFirst: async (args: typeof query) => {
          query = args;
          return null;
        },
      },
    }),
  );
  await repo.get_receipt('rider', 'ride');
  assert.deepEqual(query.where, { id: 'ride', rider_id: 'rider' });
  const driver = query.include!.driver.select;
  assert.equal('current_latitude' in driver, false);
  assert.equal('last_location_at' in driver, false);
  assert.equal('documents' in driver, false);
  const user = (driver.user as { select: Record<string, unknown> }).select;
  assert.equal(user.first_name, true);
  for (const key of [
    'phone_e164',
    'email',
    'google_sub',
    'partner_activated_at',
  ])
    assert.equal(key in user, false);
  assert.equal('verification_fields' in query.include!.vehicle.select, false);
  assert.equal('rc_image_url' in query.include!.vehicle.select, false);
});

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

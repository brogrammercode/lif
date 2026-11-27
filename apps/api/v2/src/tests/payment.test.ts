import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { it } from 'node:test';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service.js';
import { config } from '../core/config.js';
import { PaymentRepository } from '../features/payment/payment.repo.js';
import { WalletRepository } from '../features/wallet/wallet.repo.js';
import { PayoutTransfer } from '../features/wallet/payout-transfer.js';
import {
  next_payout_run,
  payout_settings_schema,
  present_payout_schedule,
} from '../features/wallet/payout-schedule.js';
import {
  active_topup_mode,
  default_wallet_controls,
  payout_submission_state,
} from '../features/wallet/wallet-controls.js';
import { WalletTopUps } from '../features/wallet/wallet-topups.js';
import {
  RazorpayWallet,
  type RazorpayWalletLink,
} from '../features/wallet/razorpay-wallet.js';

it('continues checking submitted payouts when admin disables transfers', async (t) => {
  let checked = false;
  let review_status: string | undefined;
  const worker = new PayoutTransfer(
    database({
      $transaction: async (run: (tx: unknown) => unknown) =>
        run({
          $executeRaw: async () => 1,
          payoutSchedule: {
            findUnique: async () => ({
              enabled: true,
              razorpay_x_transfers_enabled: false,
            }),
          },
          driverPayoutAttempt: {
            findUnique: async () => ({
              id: 'unknown',
              status: 'PROCESSING',
              provider_payout_id: null,
              first_submitted_at: new Date(Date.now() - 61 * 60_000),
              payout_id: 'payout',
              payout: { cycle_id: 'cycle' },
            }),
            update: async ({ data }: { data: { status: string } }) => {
              review_status = data.status;
            },
          },
          driverPayout: {
            update: async () => ({}),
            groupBy: async () => [{ status: 'REVIEW_REQUIRED' }],
          },
          payoutCycle: { update: async () => ({}) },
        }),
      driverPayoutAttempt: {
        findMany: async ({
          where,
        }: {
          where: { AND: { OR: Record<string, unknown>[] }[] };
        }) => {
          assert.deepEqual(where.AND[0]?.OR[0]?.provider_payout_id, {
            not: null,
          });
          assert.ok(where.AND[0]?.OR[1]?.first_submitted_at);
          checked = true;
          return [{ id: 'unknown' }];
        },
      },
    }),
  );
  t.mock.getter(worker, 'credentials_ready', () => true);
  await worker.tick();
  assert.equal(checked, true);
  assert.equal(review_status, 'REVIEW_REQUIRED');
});

it('reuses an existing checkout request while paused and rejects new checkout requests', async (t) => {
  const checkout = {
    id: 'topup',
    status: 'CREATING',
    request_key: 'same-key',
    amount_paise: 1500n,
    created_at: new Date(),
    updated_at: new Date(),
    provider_mode: 'live',
    provider_link_id: null,
  };
  const tx = {
    $executeRaw: async () => 1,
    user: { findUnique: async () => ({ status: 'ACTIVE' }) },
    payoutSchedule: { findUnique: async () => default_wallet_controls },
    wallet: { findUnique: async () => ({ id: 'wallet' }) },
    walletTopUp: {
      findUnique: async ({
        where,
      }: {
        where: { wallet_id_request_key: { request_key: string } };
      }) =>
        where.wallet_id_request_key.request_key === checkout.request_key
          ? checkout
          : null,
    },
  };
  const gateway = new RazorpayWallet();
  t.mock.getter(gateway, 'credential_mode', () => 'live');
  t.mock.method(gateway, 'find', async () => undefined);
  const create = t.mock.method(gateway, 'create', async () => {
    throw new Error('unexpected provider submission');
  });
  const service = new WalletTopUps(
    database({
      ...tx,
      $transaction: async (call: (value: typeof tx) => unknown) => call(tx),
    }),
    gateway,
  );
  const existing = await service.start('rider', {
    amount_paise: 1500,
    request_key: checkout.request_key,
  });
  assert.equal(existing.id, checkout.id);
  assert.equal(existing.status, 'CREATING');
  assert.equal(create.mock.callCount(), 0);
  await assert.rejects(
    service.start('rider', { amount_paise: 1500, request_key: 'new-key' }),
    { error_code: 'WALLET_TOPUP_DISABLED' },
  );
});

it('wallet top-up cancellation releases the attempt and a signed late capture credits it once', async (t) => {
  const reference = '1795758490546';
  let row = {
    id: reference,
    wallet_id: 'rider-wallet',
    checkout_kind: 'SDK',
    provider_mode: 'live',
    provider_order_id: 'order_1',
    amount_paise: 100n,
    status: 'PENDING',
    created_at: new Date(),
    updated_at: new Date(),
  };
  let captured = false;
  let credits = 0;
  let event: { processed_at: Date } | null = null;
  const tx = {
    $executeRaw: async () => 1,
    walletTopUp: {
      findFirst: async () => row,
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === reference ? row : null,
      findUniqueOrThrow: async () => row,
      updateMany: async ({ data }: { data: Partial<typeof row> }) => {
        row = { ...row, ...data };
        return { count: 1 };
      },
      update: async ({ data }: { data: Partial<typeof row> }) =>
        (row = { ...row, ...data }),
    },
    walletProviderEvent: {
      findUnique: async () => event,
      findFirst: async () => null,
      upsert: async () => (event = { processed_at: new Date() }),
    },
    wallet: { update: async () => ({ available_paise: 100n, held_paise: 0n }) },
    walletEntry: { create: async () => credits++ },
  };
  const provider = new RazorpayWallet();
  t.mock.getter(provider, 'credential_mode', () => 'live');
  t.mock.method(provider, 'order', async () => ({
    id: 'order_1',
    receipt: reference,
    amount: 100,
    currency: 'INR',
    amount_paid: captured ? 100 : 0,
    status: captured ? 'paid' : 'created',
  }));
  t.mock.method(provider, 'settled_order_payment', async () =>
    captured ? { id: 'pay_1', status: 'captured', amount_refunded: 0 } : null,
  );
  const service = new WalletTopUps(
    database({
      ...tx,
      $transaction: async (run: (value: typeof tx) => unknown) => run(tx),
    }),
    provider,
  );
  assert.equal(
    (await service.check('rider', reference, true)).status,
    'CANCELLED',
  );
  assert.equal(credits, 0);
  const previousSecret = config.RAZORPAY_WALLET_WEBHOOK_SECRET;
  const secret = 'fixture-wallet-webhook';
  config.RAZORPAY_WALLET_WEBHOOK_SECRET = secret;
  t.after(() => {
    config.RAZORPAY_WALLET_WEBHOOK_SECRET = previousSecret;
  });
  captured = true;
  const payload = Buffer.from(
    JSON.stringify({
      event: 'order.paid',
      payload: { order: { entity: { id: 'order_1', receipt: reference } } },
    }),
  );
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  await service.webhook(payload, signature, 'fixture-event');
  await service.webhook(payload, signature, 'fixture-event');
  assert.equal(row.status, 'CAPTURED');
  assert.equal(credits, 1);
});

it('reports the same transfer blockers that the worker enforces', async () => {
  let funded = true;
  const db = database({
    walletTopUp: {
      findFirst: async () => (funded ? { id: 'test-topup' } : null),
    },
  }).client;
  const policy = { enabled: true, razorpay_x_transfers_enabled: true };
  assert.equal(
    await payout_submission_state(db, policy, false),
    'credentials_unavailable',
  );
  assert.equal(await payout_submission_state(db, policy, true), 'test_funding');
  assert.equal(
    await payout_submission_state(db, { ...policy, enabled: false }, true),
    'schedule_paused',
  );
  funded = false;
  assert.equal(await payout_submission_state(db, policy, true), 'ready');
});

it('requires admin-selected top-up mode, matching provider credentials and live approval', () => {
  assert.equal(active_topup_mode(default_wallet_controls, 'live'), null);
  const test = {
    ...default_wallet_controls,
    wallet_topup_mode: 'test' as const,
  };
  assert.equal(active_topup_mode(test, 'live'), null);
  assert.equal(active_topup_mode(test, 'test'), 'test');
  const live = {
    ...default_wallet_controls,
    wallet_topup_mode: 'live' as const,
  };
  assert.equal(active_topup_mode(live, 'live'), null);
  const approved = { ...live, wallet_live_topup_approved: true };
  assert.equal(active_topup_mode(approved, null), null);
  assert.equal(active_topup_mode(approved, 'live'), 'live');
});

it('round-trips saved admin payout settings and clips monthly days in IST', () => {
  const now = new Date('2027-02-01T08:00:00Z');
  const settings = {
    ...default_wallet_controls,
    id: 'default',
    enabled: true,
    frequency: 'MONTHLY' as const,
    minute_of_day_ist: 9 * 60,
    weekday_ist: 1,
    month_day_ist: 31,
    minimum_paise: 100n,
    require_approval: true,
    version: 4,
    updated_at: now,
    next_run_at: null,
    replaced_run_at: null,
  };
  const { version, next_run_at, ...values } = present_payout_schedule(settings);
  assert.equal(next_run_at?.toISOString(), '2027-02-28T03:30:00.000Z');
  assert.ok(
    payout_settings_schema.safeParse({ ...values, expected_version: version })
      .success,
  );
  assert.equal(
    next_payout_run(settings, next_run_at!).toISOString(),
    '2027-03-31T03:30:00.000Z',
  );
});

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
  Object.assign(payment, { collection_method: 'WALLET' });
  await assert.rejects(
    repository.process_webhook('gateway', {
      provider_payment_id: 'reference',
      status: 'CAPTURED',
    }),
    { error_code: 'WALLET_PAYMENT_WEBHOOK_UNSUPPORTED' },
  );
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
it('wallet top-ups require one captured payment matching the complete INR checkout', async (t) => {
  const razorpay = new RazorpayWallet();
  const link: RazorpayWalletLink = {
    id: 'plink_1',
    order_id: 'order_1',
    reference_id: 'topup',
    short_url: 'https://rzp.io/i/checkout',
    amount: 12599,
    amount_paid: 12599,
    currency: 'INR',
    status: 'paid',
  };
  const valid = {
    id: 'pay_1',
    order_id: 'order_1',
    amount: 12599,
    amount_refunded: 0,
    currency: 'INR',
    status: 'captured',
  };
  let items = [valid];
  const request = t.mock.method(razorpay, 'request', async (path: string) => {
    assert.equal(path, '/orders/order_1/payments');
    return { items };
  });
  assert.equal(await razorpay.captured({ ...link, status: 'created' }), null);
  assert.equal(await razorpay.captured({ ...link, amount_paid: 12598 }), null);
  assert.equal(request.mock.callCount(), 0);
  assert.equal(await razorpay.captured(link), 'pay_1');
  const order = {
    id: 'order_1',
    receipt: 'topup',
    amount: 12599,
    amount_paid: 12599,
    currency: 'INR' as const,
    status: 'paid' as const,
  };
  assert.equal((await razorpay.settled_order_payment(order))?.id, 'pay_1');
  assert.equal(
    await razorpay.settled_order_payment({ ...order, status: 'attempted' }),
    null,
  );
  items = [
    {
      ...valid,
      status: 'failed',
      error_description: 'Payment timed out',
    } as typeof valid,
  ];
  assert.deepEqual(
    await razorpay.order_failure(order.id, order.amount, order.currency),
    {
      reason: 'Payment timed out',
    },
  );
  for (const bad of [
    [{ ...valid, status: 'authorized' }],
    [{ ...valid, order_id: 'order_else' }],
    [{ ...valid, amount_refunded: 1 }],
    [{ ...valid, currency: 'USD' }],
    [valid, { ...valid, id: 'pay_2' }],
  ]) {
    items = bad;
    assert.equal(await razorpay.captured(link), null);
  }
  items = [{ ...valid, status: 'refunded', amount_refunded: 12599 }];
  assert.equal((await razorpay.settled_payment(link))?.id, 'pay_1');
  assert.equal(await razorpay.captured(link), null);
});

it('refunds a wallet ride once and preserves an already paid driver unless the platform funds it', async () => {
  let payment = { id: 'payment', status: 'CAPTURED' };
  let paid = false;
  let locked = true;
  const wallet = new Map([
    ['rider', { id: 'rider', available_paise: 0n, held_paise: 0n }],
    ['driver', { id: 'driver', available_paise: 900n, held_paise: 0n }],
  ]);
  let entries: { reverses_entry_id: string; available_delta_paise: bigint }[] =
    [];
  const tx = {
    $executeRaw: async () => 1,
    user: { findUnique: async () => ({ status: 'ACTIVE', role: 'ADMIN' }) },
    payment: {
      findFirst: async () => payment,
      update: async ({ data }: { data: typeof payment }) =>
        (payment = { ...payment, ...data }),
    },
    driverPayoutLine: {
      findFirst: async ({
        where,
      }: {
        where: { payout: { status: unknown } };
      }) =>
        where.payout.status === 'PAID'
          ? paid
            ? { payout_id: 'settled' }
            : null
          : locked
            ? { id: 'locked' }
            : null,
    },
    wallet: {
      update: async ({ where }: { where: { id: string } }) => {
        const row = wallet.get(where.id)!;
        row.available_paise += 1000n;
        return row;
      },
      updateMany: async ({ where }: { where: { id: string } }) => {
        wallet.get(where.id)!.available_paise -= 900n;
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) =>
        wallet.get(where.id),
    },
    walletEntry: {
      findUniqueOrThrow: async ({
        where,
      }: {
        where: { operation_key: string };
      }) =>
        where.operation_key.endsWith('RIDE_DEBIT')
          ? { id: 'debit', wallet_id: 'rider', available_delta_paise: -1000n }
          : { id: 'earning', wallet_id: 'driver', available_delta_paise: 900n },
      createMany: async ({ data }: { data: typeof entries }) => {
        entries.push(...data);
      },
    },
    userLog: { create: async () => ({}) },
    rideEvent: { create: async () => ({}) },
  };
  const repo = new WalletRepository(
    database({
      $transaction: async (action: (value: typeof tx) => unknown) => action(tx),
    }),
  );
  const refund = (platform = false) =>
    repo.refund_ride('admin', 'rider', 'ride', 'Approved refund', platform);
  await assert.rejects(refund(), { error_code: 'WALLET_REFUND_PAYOUT_LOCKED' });
  locked = false;
  await refund();
  await refund();
  assert.deepEqual(
    entries.map((entry) => [
      entry.reverses_entry_id,
      entry.available_delta_paise,
    ]),
    [
      ['debit', 1000n],
      ['earning', -900n],
    ],
  );
  assert.equal(wallet.get('rider')?.available_paise, 1000n);
  assert.equal(wallet.get('driver')?.available_paise, 0n);
  assert.equal(payment.status, 'REFUNDED');
  payment = { id: 'payment', status: 'CAPTURED' };
  paid = true;
  entries = [];
  await assert.rejects(refund(), {
    error_code: 'WALLET_REFUND_PAYOUT_SETTLED',
  });
  await refund(true);
  assert.deepEqual(
    entries.map((entry) => entry.available_delta_paise),
    [1000n],
  );
  assert.equal(wallet.get('driver')?.available_paise, 0n);
});

it('reconciles an ambiguous payout only from a matching RazorpayX transfer', async (t) => {
  const attempt = {
    id: 'attempt',
    idempotency_key: 'key',
    status: 'REVIEW_REQUIRED',
    failure_code: 'SUBMISSION_UNCONFIRMED',
    payout: {
      id: 'payout',
      amount_paise: 400n,
      wallet_id: 'driver',
      cycle_id: 'cycle',
      destination_snapshot: {
        earnings_paise: '400',
        fund_account_id: 'fa_valid',
        source_account: 'source',
      },
    },
  };
  let holdRemoved = 0;
  const tx = {
    $executeRaw: async () => 1,
    user: { findUnique: async () => ({ status: 'ACTIVE', role: 'ADMIN' }) },
    driverPayoutAttempt: {
      findUniqueOrThrow: async () => attempt,
      update: async ({ data }: { data: { status: string } }) => {
        attempt.status = data.status;
      },
    },
    wallet: {
      updateMany: async () => {
        holdRemoved++;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({
        id: 'driver',
        available_paise: 0n,
        held_paise: 0n,
      }),
    },
    walletEntry: { create: async () => ({}) },
    driverPayout: {
      update: async () => ({}),
      groupBy: async () => [{ status: 'PAID' }],
    },
    payoutCycle: { update: async () => ({}) },
    userLog: { create: async () => ({}) },
  };
  const worker = new PayoutTransfer(
    database({
      driverPayoutAttempt: {
        findFirst: async () =>
          attempt.status === 'REVIEW_REQUIRED' ? attempt : null,
      },
      $transaction: async (call: (value: typeof tx) => unknown) => call(tx),
    }),
  );
  t.mock.getter(worker, 'credentials_ready', () => true);
  let reference = 'other';
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.razorpay.com/v1/payouts/pout_known');
    assert.equal(init.method, 'GET');
    return Response.json({
      id: 'pout_known',
      fund_account_id: 'fa_valid',
      reference_id: reference,
      mode: 'UPI',
      amount: 400,
      currency: 'INR',
      status: 'processed',
    });
  });
  await assert.rejects(worker.reconcile('admin', 'payout', 'pout_known'), {
    error_code: 'PAYOUT_PROVIDER_MISMATCH',
  });
  assert.equal(holdRemoved, 0);
  reference = 'payout';
  await worker.reconcile('admin', 'payout', 'pout_known');
  assert.equal(attempt.status, 'PAID');
  await assert.rejects(worker.reconcile('admin', 'payout', 'pout_known'), {
    error_code: 'PAYOUT_NOT_RECONCILABLE',
  });
  assert.equal(holdRemoved, 1);
});

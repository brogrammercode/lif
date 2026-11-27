import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { it } from 'node:test';
import { Prisma, type DriverPayoutMethod } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service.js';
import { config } from '../core/config.js';
import { PaymentRepository } from '../features/payment/payment.repo.js';
import { WalletRepository } from '../features/wallet/wallet.repo.js';
import { PayoutTransfer } from '../features/wallet/payout-transfer.js';
import {
  PayoutMethods,
  payout_method_input,
} from '../features/wallet/payout-methods.js';
import {
  cadence_update,
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
import { RideUpi } from '../features/wallet/ride-upi.js';
import { ride_commission } from '../features/wallet/cash-ride-entry.js';
import {
  RazorpayWallet,
  type RazorpayWalletLink,
} from '../features/wallet/razorpay-wallet.js';

it('charges one paise when positive commission rounds below one paise', () => {
  const commission = (amount: bigint, percent: number) =>
    ride_commission(amount, {
      payment_policy: { commission_percent: percent },
    });
  assert.deepEqual(commission(181n, 0.2), { percent: 0.2, commission: 1n });
  assert.equal(commission(181n, 20).commission, 36n);
  assert.equal(commission(181n, 0).commission, 0n);
  assert.equal(commission(0n, 20).commission, 0n);
  assert.equal(commission(1n, 100).commission, 1n);
});

it('saves a bank-linked debit card before credentials are available and links it later', async (t) => {
  const input = {
    kind: 'DEBIT_CARD',
    name: 'Fixture Driver',
    account_number: '012347865432',
    ifsc: 'HDFC0000053',
    card_last_four: '1234',
  };
  assert.equal(
    payout_method_input.safeParse({ ...input, card_number: 'rejected' })
      .success,
    false,
  );
  let saved: DriverPayoutMethod;
  const tx = {
    $executeRaw: async () => 1,
    user: {
      findUnique: async () => ({ status: 'ACTIVE', deleted_at: null }),
      findUniqueOrThrow: async () => ({
        role: 'DRIVER',
        partner_application: null,
      }),
    },
    driverPayoutMethod: {
      findFirst: async () => null,
      create: async ({ data }: { data: DriverPayoutMethod }) =>
        (saved = { ...data, id: 'method-one' }),
      updateMany: async ({ data }: { data: Partial<DriverPayoutMethod> }) => {
        if (saved) Object.assign(saved, data);
        return { count: 1 };
      },
      findUniqueOrThrow: async () => saved,
    },
  };
  const methods = new PayoutMethods(
    database({
      ...tx,
      $transaction: async (run: (value: typeof tx) => unknown) => run(tx),
    }),
  );
  let provider_ready = false;
  t.mock.getter(methods, 'credentials_ready', () => provider_ready);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, req: RequestInit) => {
    requests++;
    assert.equal(req.method, 'POST');
    if (url.endsWith('/contacts')) {
      assert.equal(JSON.parse(String(req.body)).reference_id, 'driver');
      return Response.json({
        id: 'cont_fixture',
        reference_id: 'driver',
        active: true,
      });
    }
    assert.ok(url.endsWith('/fund_accounts'));
    const payload = JSON.parse(String(req.body));
    assert.deepEqual(payload, {
      contact_id: 'cont_fixture',
      account_type: 'bank_account',
      bank_account: {
        name: input.name,
        ifsc: input.ifsc,
        account_number: input.account_number,
      },
    });
    return Response.json({ ...payload, id: 'fa_fixture', active: true });
  });
  const result = await methods.setup(
    'driver',
    payout_method_input.parse(input),
  );
  assert.equal(result.status, 'PENDING');
  assert.equal(result.is_default, true);
  assert.equal(result.selectable, true);
  assert.ok(!JSON.stringify(result).includes(input.account_number));
  const stored = await tx.driverPayoutMethod.findUniqueOrThrow();
  assert.ok(
    stored.pending_details &&
      !stored.pending_details.includes(input.account_number),
  );
  await methods.provision(stored);
  assert.equal(requests, 0);
  provider_ready = true;
  assert.equal((await methods.provision({ ...stored })).status, 'VERIFIED');
  assert.equal(stored.provider_fund_account_id, 'fa_fixture');
  assert.equal(stored.pending_details, null);
  assert.equal(requests, 2);
});

it('reuses a ride UPI order and credits the driver once after matching capture', async (t) => {
  const ride = {
    id: 'ride-upi',
    rider_id: 'rider',
    driver_id: 'profile',
    status: 'COMPLETED',
    currency: 'INR',
    final_fare: new Prisma.Decimal(50),
    driver: { user_id: 'driver' },
    settlement_review: null,
    quotes: [
      {
        category_snapshot: {
          payment_policy: { direct_upi_enabled: true, commission_percent: 10 },
        },
      },
    ],
    payment: null as Record<string, unknown> | null,
  };
  const credits: bigint[] = [];
  const tx = {
    $executeRaw: async () => 1,
    user: { findUnique: async () => ({ status: 'ACTIVE', deleted_at: null }) },
    ride: { findFirst: async () => ride },
    payoutSchedule: {
      findUnique: async () => ({ razorpay_ride_upi_enabled: true }),
    },
    payment: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        ride.payment = { ...create, id: 'payment', provider_order_id: null };
        return ride.payment;
      },
      update: async ({ data }: { data: Record<string, unknown> }) =>
        Object.assign(ride.payment!, data),
      findFirst: async () => ride.payment,
      findUnique: async ({
        where,
      }: {
        where: { provider_order_id: string };
      }) =>
        ride.payment?.provider_order_id === where.provider_order_id
          ? ride.payment
          : null,
      findUniqueOrThrow: async () => ({ ...ride.payment, ride }),
    },
    wallet: {
      upsert: async () => ({
        id: 'wallet',
        available_paise: 4500n,
        held_paise: 0n,
      }),
    },
    walletEntry: {
      create: async ({ data }: { data: { available_delta_paise: bigint } }) =>
        credits.push(data.available_delta_paise),
    },
    rideEvent: { create: async () => ({}) },
    userLog: { create: async () => ({}) },
  };
  const provider = new RazorpayWallet();
  t.mock.getter(provider, 'credential_mode', () => 'live');
  let receipt = '';
  const order = () => ({
    id: 'order_fixture',
    receipt,
    amount: 5000,
    amount_paid: 0,
    currency: 'INR' as const,
    status: 'created' as const,
  });
  const create = t.mock.method(
    provider,
    'create_order',
    async (reference: string) => {
      receipt = reference;
      return order();
    },
  );
  t.mock.method(provider, 'order', async () => order());
  let captured = false;
  t.mock.method(provider, 'settled_order_payment', async () =>
    captured
      ? {
          id: 'pay_fixture',
          order_id: 'order_fixture',
          amount: 5000,
          amount_refunded: 0,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
        }
      : null,
  );
  const service = new RideUpi(
    database({
      ...tx,
      $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
    }),
    provider,
  );
  const first = await service.checkout('rider', ride.id);
  const second = await service.checkout('rider', ride.id);
  assert.equal(first.sdk_checkout?.order_id, 'order_fixture');
  assert.equal(second.sdk_checkout?.order_id, 'order_fixture');
  assert.equal(create.mock.callCount(), 1);
  assert.deepEqual(credits, []);
  captured = true;
  const verified = await service.check('driver', ride.id);
  assert.equal(verified.status, 'CAPTURED');
  assert.equal(verified.sdk_checkout, undefined);
  assert.equal((await service.check('driver', ride.id)).status, 'CAPTURED');
  assert.equal(
    (await service.reconcile_order('order_fixture'))?.status,
    'CAPTURED',
  );
  assert.deepEqual(credits, [4500n]);
});

it('debits the rider and credits driver net earnings once for a Wallet ride payment', async () => {
  const ride = {
    status: 'COMPLETED',
    currency: 'INR',
    final_fare: new Prisma.Decimal('50.00'),
    driver: { user_id: 'driver' },
    payment: null as Record<string, unknown> | null,
    settlement_review: null,
    quotes: [
      { category_snapshot: { payment_policy: { commission_percent: 10 } } },
    ],
  };
  const entries: Prisma.WalletEntryCreateManyInput[] = [];
  const rider = { id: 'rider-wallet', available_paise: 7000n, held_paise: 0n };
  const driver = {
    id: 'driver-wallet',
    available_paise: 1000n,
    held_paise: 0n,
  };
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [],
    user: { findUnique: async () => ({ status: 'ACTIVE', deleted_at: null }) },
    ride: { findFirst: async () => ride },
    payoutSchedule: {
      findUnique: async () => ({ wallet_ride_collection_enabled: true }),
    },
    walletTopUp: { findFirst: async () => null },
    wallet: {
      findUnique: async () => rider,
      findUniqueOrThrow: async () => rider,
      updateMany: async ({
        data,
      }: {
        data: { available_paise: { decrement: bigint } };
      }) => {
        rider.available_paise -= data.available_paise.decrement;
        return { count: 1 };
      },
      upsert: async ({
        update,
      }: {
        update: { available_paise: { increment: bigint } };
      }) => {
        driver.available_paise += update.available_paise.increment;
        return driver;
      },
    },
    payment: {
      upsert: async ({ create }: { create: Record<string, unknown> }) =>
        (ride.payment = { ...create, id: 'wallet-payment' }),
    },
    walletEntry: {
      createMany: async ({
        data,
      }: {
        data: Prisma.WalletEntryCreateManyInput[];
      }) => entries.push(...data),
    },
    rideEvent: { create: async () => ({}) },
    userLog: { create: async () => ({}) },
  };
  const repo = new WalletRepository(
    database({
      $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
    }),
  );
  assert.equal((await repo.pay_ride('rider', 'ride')).status, 'CAPTURED');
  assert.equal((await repo.pay_ride('rider', 'ride')).status, 'CAPTURED');
  assert.equal(rider.available_paise, 2000n);
  assert.equal(driver.available_paise, 5500n);
  assert.deepEqual(
    entries.map(
      ({ kind, available_delta_paise, payment_id, commission_paise }) => [
        kind,
        available_delta_paise,
        payment_id,
        commission_paise,
      ],
    ),
    [
      ['RIDE_DEBIT', -5000n, 'wallet-payment', undefined],
      ['RIDE_EARNING', 4500n, 'wallet-payment', 500n],
    ],
  );
});

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

it('anchors payout cadence to the latest cycle at 5 AM IST and accepts a new date', () => {
  const now = new Date('2026-11-27T02:00:00.000Z');
  const last = new Date('2026-11-25T18:30:00.000Z');
  const weekly = cadence_update({ frequency: 'WEEKLY' }, null, last, now)!;
  assert.equal(weekly.next_run_at?.toISOString(), '2026-12-02T23:30:00.000Z');
  assert.equal(weekly.timing.minute_of_day_ist, 300);
  const monthly = cadence_update(
    { frequency: 'MONTHLY', next_run_date: '2027-01-31' },
    null,
    last,
    now,
  )!;
  assert.equal(monthly.next_run_at?.toISOString(), '2027-01-30T23:30:00.000Z');
  assert.equal(
    next_payout_run(monthly.timing, monthly.next_run_at!).toISOString(),
    '2027-02-27T23:30:00.000Z',
  );
  const overdue = cadence_update({ frequency: 'DAILY' }, null, last, now)!;
  assert.equal(overdue.next_run_at?.toISOString(), '2026-11-27T23:30:00.000Z');
  assert.equal(
    cadence_update(
      { frequency: 'WEEKLY', next_run_date: '2026-11-27' },
      null,
      last,
      now,
    )?.next_run_at,
    null,
  );
  assert.equal(
    cadence_update(
      { frequency: 'WEEKLY' },
      { ...weekly.timing, next_run_at: weekly.next_run_at },
      last,
      now,
    ),
    null,
  );
});

it('does not recreate the last payout cycle when the stored next date is stale', async () => {
  const last = new Date('2026-11-26T23:30:00.000Z');
  let next_date: Date | undefined;
  const tx = {
    $executeRaw: async () => 1,
    payoutSchedule: {
      findUnique: async () => ({
        id: 'payout-schedule',
        enabled: true,
        frequency: 'WEEKLY',
        weekday_ist: 5,
        minute_of_day_ist: 300,
        next_run_at: last,
      }),
      update: async ({ data }: { data: { next_run_at: Date } }) => {
        next_date = data.next_run_at;
      },
    },
    payoutCycle: {
      findFirst: async () => ({ cutoff_at: last }),
      upsert: async () =>
        assert.fail('The last cycle must not be drafted again.'),
    },
  };
  const repo = new WalletRepository(
    database({
      $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
    }),
  );
  assert.deepEqual(
    await repo.prepare_due_cycle(new Date('2026-11-27T02:00:00.000Z')),
    { prepared: false },
  );
  assert.equal(next_date?.toISOString(), '2026-12-03T23:30:00.000Z');
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

it('reconciles an ambiguous bank payout only from a matching RazorpayX transfer and mode', async (t) => {
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
        mode: 'IMPS',
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
  let mode = 'IMPS';
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.razorpay.com/v1/payouts/pout_known');
    assert.equal(init.method, 'GET');
    return Response.json({
      id: 'pout_known',
      fund_account_id: 'fa_valid',
      reference_id: reference,
      mode,
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
  mode = 'UPI';
  await assert.rejects(worker.reconcile('admin', 'payout', 'pout_known'), {
    error_code: 'PAYOUT_PROVIDER_MISMATCH',
  });
  assert.equal(holdRemoved, 0);
  mode = 'IMPS';
  await worker.reconcile('admin', 'payout', 'pout_known');
  assert.equal(attempt.status, 'PAID');
  await assert.rejects(worker.reconcile('admin', 'payout', 'pout_known'), {
    error_code: 'PAYOUT_NOT_RECONCILABLE',
  });
  assert.equal(holdRemoved, 1);
});

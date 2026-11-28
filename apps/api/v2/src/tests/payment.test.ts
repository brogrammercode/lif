import { WalletRideRepository } from '../features/wallet/wallet-ride.repository.js';
import type { PostgresService } from '../database/postgres.service.js';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { it } from 'node:test';
import { Prisma, type DriverPayoutMethod } from '@prisma/client';
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
  payoutSubmissionState,
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
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM users'))
      return { rows: [{ role: 'DRIVER', status: 'ACTIVE', deleted_at: null }] };
    if (sql.includes('destination_hash=ANY')) return { rows: [] };
    if (sql.startsWith('INSERT INTO driver_payout_methods')) {
      saved = {
        id: String(params[0]),
        driver_id: String(params[1]),
        kind: params[2],
        masked_label: params[3],
        destination_hash: params[4],
        pending_details: params[5],
        is_default: true,
        status: 'PENDING',
        created_at: new Date(),
        updated_at: new Date(),
      } as DriverPayoutMethod;
      return { rows: [saved], rowCount: 1 };
    }
    if (sql.includes('link_attempted_at=statement_timestamp()'))
      return { rows: [], rowCount: 1 };
    if (sql.includes("SET status='VERIFIED'")) {
      Object.assign(saved, {
        status: 'VERIFIED',
        provider_fund_account_id: params[2],
        provider_contact_id: params[3],
        pending_details: null,
        link_attempted_at: null,
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('SELECT * FROM driver_payout_methods WHERE id='))
      return { rows: [saved] };
    return { rows: [] };
  };
  const postgres = {
    query,
    transaction: (work: (tx: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService;
  const methods = new PayoutMethods(postgres);
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
  const stored = saved!;
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
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM users'))
      return { rows: [{ status: 'ACTIVE', deleted_at: null }] };
    if (sql.includes('FROM payout_schedules'))
      return { rows: [{ razorpay_ride_upi_enabled: true }] };
    if (sql.includes('AS under_review'))
      return {
        rows: [
          {
            ...ride,
            category_snapshot: ride.quotes[0]?.category_snapshot,
            under_review: false,
          },
        ],
      };
    if (sql.includes('AS ride_status'))
      return {
        rows: [
          {
            ...ride.payment,
            rider_id: ride.rider_id,
            ride_status: ride.status,
            driver_user_id: ride.driver.user_id,
            category_snapshot: ride.quotes[0]?.category_snapshot,
          },
        ],
      };
    if (
      sql.startsWith('SELECT p.* FROM payments') ||
      sql.includes('FROM payments WHERE provider_order_id')
    )
      return { rows: ride.payment ? [ride.payment] : [] };
    if (sql.startsWith('INSERT INTO payments'))
      ride.payment = {
        id: 'payment',
        ride_id: params[1],
        amount: params[2],
        currency: params[3],
        provider: params[4],
        provider_order_claimed: true,
        provider_order_id: null,
        status: 'PENDING',
      };
    if (sql.startsWith('UPDATE payments SET provider_order_id'))
      Object.assign(ride.payment!, { provider_order_id: params[1] });
    if (sql.includes("UPDATE payments SET status='CAPTURED'"))
      Object.assign(ride.payment!, {
        status: 'CAPTURED',
        provider_payment_id: params[1],
      });
    if (sql.startsWith('INSERT INTO wallets'))
      return {
        rows: [{ id: 'wallet', available_paise: '4500', held_paise: '0' }],
      };
    if (sql.startsWith('INSERT INTO wallet_entries'))
      credits.push(BigInt(String(params[5])));
    return { rows: ride.payment ? [ride.payment] : [] };
  };
  const postgres = {
    query,
    transaction: (work: (tx: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService;
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
  const service = new RideUpi(postgres, provider);
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
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM users'))
      return { rows: [{ status: 'ACTIVE', deleted_at: null }] };
    if (sql.includes('AS under_review'))
      return {
        rows: [
          {
            ...ride,
            driver_user_id: ride.driver.user_id,
            under_review: false,
            category_snapshot: ride.quotes[0]?.category_snapshot,
          },
        ],
      };
    if (sql.includes('FROM payout_schedules'))
      return { rows: [{ wallet_ride_collection_enabled: true }] };
    if (sql.includes('SELECT id FROM wallets WHERE user_id'))
      return { rows: [params[1] === 'RIDER' ? rider : driver] };
    if (sql.startsWith('UPDATE wallets')) {
      const wallet = params[0] === rider.id ? rider : driver;
      wallet.available_paise += BigInt(String(params[1]));
      return { rows: [wallet] };
    }
    if (sql.startsWith('INSERT INTO payments')) {
      ride.payment = {
        id: 'wallet-payment',
        collection_method: 'WALLET',
        status: 'CAPTURED',
      };
      return { rows: [ride.payment] };
    }
    if (sql.startsWith('INSERT INTO wallet_entries'))
      entries.push({
        wallet_id: String(params[1]),
        kind: params[2] as 'RIDE_DEBIT' | 'RIDE_EARNING',
        payment_id: String(params[4]),
        operation_key: String(params[5]),
        available_delta_paise: BigInt(String(params[6])),
        held_delta_paise: 0n,
        available_after_paise: BigInt(String(params[7])),
        held_after_paise: BigInt(String(params[8])),
        commission_paise:
          params[10] == null ? undefined : BigInt(String(params[10])),
      });
    return { rows: [], rowCount: 0 };
  };
  const repo = new WalletRideRepository({
    transaction: (work: (tx: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService);
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
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes('FROM payout_schedules'))
      return {
        rows: [
          {
            enabled: true,
            razorpay_x_transfers_enabled: false,
            minimum_paise: '0',
          },
        ],
      };
    if (sql.includes('SELECT id FROM driver_payout_attempts')) {
      assert.match(
        sql,
        /provider_payout_id IS NOT NULL OR first_submitted_at <=/,
      );
      assert.equal(values[1], false);
      checked = true;
      return { rows: [{ id: 'unknown' }] };
    }
    if (sql.includes('FROM driver_payout_attempts a'))
      return {
        rows: [
          {
            id: 'unknown',
            status: 'PROCESSING',
            provider_payout_id: null,
            first_submitted_at: new Date(Date.now() - 61 * 60_000),
            payout_id: 'payout',
            cycle_id: 'cycle',
          },
        ],
      };
    if (sql.includes('UPDATE driver_payout_attempts')) {
      assert.match(sql, /SUBMISSION_UNCONFIRMED/);
      review_status = 'REVIEW_REQUIRED';
    }
    if (sql.includes('SELECT DISTINCT status'))
      return { rows: [{ status: 'REVIEW_REQUIRED' }] };
    return { rows: [] };
  };
  const worker = new PayoutTransfer(
    {
      query,
      transaction: (work: (tx: { query: typeof query }) => unknown) =>
        work({ query }),
    } as unknown as PostgresService,
    {} as PayoutMethods,
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
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM users'))
      return { rows: [{ status: 'ACTIVE', deleted_at: null }] };
    if (sql.includes('FROM payout_schedules'))
      return { rows: [default_wallet_controls] };
    if (sql.includes('FROM wallets')) return { rows: [{ id: 'wallet' }] };
    if (sql.includes('request_key=$2'))
      return {
        rows:
          params[1] === checkout.request_key
            ? [
                {
                  ...checkout,
                  credited_net_of_refund_paise: '0',
                  reviewed_chargeback_paise: '0',
                },
              ]
            : [],
      };
    return { rows: [] };
  };
  const postgres = {
    query,
    transaction: (work: (tx: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService;
  const gateway = new RazorpayWallet();
  t.mock.getter(gateway, 'credential_mode', () => 'live');
  t.mock.method(gateway, 'find', async () => undefined);
  const create = t.mock.method(gateway, 'create', async () => {
    throw new Error('unexpected provider submission');
  });
  const service = new WalletTopUps(postgres, gateway);
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
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT processed_at FROM wallet_provider_events'))
      return { rows: event ? [event] : [] };
    if (sql.includes('FROM wallet_provider_events'))
      return { rows: [], rowCount: 0 };
    if (sql.startsWith('INSERT INTO wallet_provider_events')) {
      event = { processed_at: new Date() };
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE wallets'))
      return { rows: [{ available_paise: '100', held_paise: '0' }] };
    if (sql.startsWith('INSERT INTO wallet_entries')) {
      credits++;
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("SET status='CANCELLED'"))
      row = { ...row, status: 'CANCELLED' };
    if (sql.includes('provider_link_id=COALESCE'))
      row = { ...row, status: String(params[6]) };
    if (
      sql.includes('SELECT t.*') ||
      sql.includes('FROM wallet_topups') ||
      sql.includes('RETURNING *')
    )
      return {
        rows: [
          {
            ...row,
            credited_net_of_refund_paise: '0',
            reviewed_chargeback_paise: '0',
          },
        ],
      };
    return { rows: [] };
  };
  const postgres = {
    query,
    transaction: (work: (tx: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService;
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
  const service = new WalletTopUps(postgres, provider);
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
  const db = {
    query: async () => ({ rowCount: funded ? 1 : 0 }),
  } as unknown as PostgresService;
  const policy = { enabled: true, razorpay_x_transfers_enabled: true };
  assert.equal(
    await payoutSubmissionState(db, policy, false),
    'credentials_unavailable',
  );
  assert.equal(await payoutSubmissionState(db, policy, true), 'test_funding');
  assert.equal(
    await payoutSubmissionState(db, { ...policy, enabled: false }, true),
    'schedule_paused',
  );
  funded = false;
  assert.equal(await payoutSubmissionState(db, policy, true), 'ready');
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
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM payout_schedules'))
      return {
        rows: [
          {
            id: 'payout-schedule',
            enabled: true,
            frequency: 'WEEKLY',
            weekday_ist: 5,
            minute_of_day_ist: 300,
            next_run_at: last,
            minimum_paise: '0',
          },
        ],
      };
    if (sql.includes('FROM payout_cycles'))
      return { rows: [{ cutoff_at: last }] };
    if (sql.startsWith('UPDATE payout_schedules'))
      next_date = params[1] as Date;
    if (sql.startsWith('INSERT INTO payout_cycles'))
      assert.fail('The last cycle must not be drafted again.');
    return { rows: [] };
  };
  const repo = new WalletRepository({
    transaction: (work: (tx: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService);
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
    query: async (sql: string, args: unknown[] = []) => {
      if (sql.startsWith('SELECT id,ride_id FROM payments')) {
        const matches =
          args[1] === payment.ride_id ||
          args[0] === payment.provider_payment_id;
        return { rows: matches ? [payment] : [] };
      }
      if (sql.includes('amount_matches'))
        return {
          rows: [
            {
              ...payment,
              amount_matches: Number(args[1]) === Number(payment.amount),
            },
          ],
        };
      if (sql.startsWith('UPDATE payments')) {
        updates++;
        payment = {
          ...payment,
          provider: args[1] as string,
          provider_payment_id: args[2] as string,
          status: args[3] as string,
          paid_at: args[4] as Date | null,
          failed_at: args[5] as Date | null,
          refunded_at: args[6] as Date | null,
        };
        return { rows: [payment] };
      }
      if (sql.startsWith('INSERT INTO ride_events')) events++;
      return { rows: [] };
    },
  };
  const repository = new PaymentRepository({
    transaction: (work: (tx: typeof transaction) => Promise<unknown>) =>
      work(transaction),
  } as unknown as PostgresService);
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
    query: async (sql: string) => {
      if (sql.includes('FROM rides r'))
        return {
          rows: [
            {
              id: 'ride',
              status: 'COMPLETED',
              final_fare: '50',
              currency: 'INR',
              snapshot: {
                payment_policy: {
                  cash_enabled: true,
                  direct_upi_enabled: true,
                },
              },
            },
          ],
        };
      if (sql.includes('FROM payments WHERE')) return { rows: [payment] };
      if (sql.includes('FROM payment_methods WHERE'))
        return { rows: [{ id: 'cash', type: 'CASH' }] };
      if (sql.startsWith('INSERT INTO payments')) {
        assert.match(
          sql,
          /collection_method='CASH',recipient_upi=NULL,status='PENDING'/,
        );
        Object.assign(payment, {
          collection_method: 'CASH',
          recipient_upi: null,
          status: 'PENDING',
        });
        return { rows: [payment] };
      }
      return { rows: [] };
    },
  };
  const repo = new PaymentRepository({
    transaction: (work: (t: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PostgresService);
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
      query: async (sql: string) => ({
        rows: sql.includes('FROM payments') ? [payment] : [],
      }),
    };
    const repo = new PaymentRepository({
      transaction: (work: (t: typeof tx) => Promise<unknown>) => work(tx),
    } as unknown as PostgresService);
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
  const repo = new PaymentRepository({
    query: async (sql: string, values: unknown[]) => {
      assert.match(sql, /WHERE r.id=\$1 AND r.rider_id=\$2/);
      assert.deepEqual(values, ['ride', 'rider']);
      assert.match(sql, /first_name/);
      assert.doesNotMatch(
        sql,
        /current_latitude|last_location_at|phone_e164|email|google_sub|partner_activated_at|verification_fields|rc_image_url/,
      );
      return { rows: [] };
    },
  } as unknown as PostgresService);
  assert.equal(await repo.get_receipt('rider', 'ride'), null);
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
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM users'))
      return { rows: [{ status: 'ACTIVE', role: 'ADMIN', deleted_at: null }] };
    if (sql.startsWith('SELECT p.id,p.status')) return { rows: [payment] };
    if (sql.includes('FROM wallet_entries')) {
      assert.match(sql, /ride_id=\$1 AND payment_id=\$2/);
      assert.deepEqual(params, [
        'ride',
        'payment',
        'ride:ride:RIDE_DEBIT',
        'ride:ride:RIDE_EARNING',
      ]);
      return {
        rows: [
          {
            id: 'earning',
            wallet_id: 'driver',
            kind: 'RIDE_EARNING',
            available_delta_paise: '900',
          },
          {
            id: 'debit',
            wallet_id: 'rider',
            kind: 'RIDE_DEBIT',
            available_delta_paise: '-1000',
          },
        ],
      };
    }
    if (sql.includes('FROM driver_payout_lines'))
      return {
        rows: [
          ...(locked ? [{ payout_id: 'locked', status: 'DRAFT' }] : []),
          ...(paid ? [{ payout_id: 'settled', status: 'PAID' }] : []),
        ],
      };
    if (sql.startsWith('UPDATE wallets')) {
      const account = wallet.get(String(params[0]))!;
      account.available_paise += BigInt(String(params[1]));
      return { rows: [account] };
    }
    if (sql.startsWith('INSERT INTO wallet_entries'))
      entries.push({
        reverses_entry_id: String(params[9]),
        available_delta_paise: BigInt(String(params[6])),
      });
    if (sql.startsWith('UPDATE payments')) payment.status = 'REFUNDED';
    return { rows: [], rowCount: 0 };
  };
  const repo = new WalletRideRepository({
    transaction: (work: (tx: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService);
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
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes('FROM users'))
      return { rows: [{ status: 'ACTIVE', role: 'ADMIN' }] };
    if (sql.includes('FROM driver_payout_attempts a'))
      return {
        rows: [
          { ...attempt, ...attempt.payout, id: 'attempt', payout_id: 'payout' },
        ],
      };
    if (sql.includes('SELECT id,idempotency_key FROM driver_payout_attempts'))
      return { rows: attempt.status === 'REVIEW_REQUIRED' ? [attempt] : [] };
    if (sql.includes('UPDATE wallets')) {
      holdRemoved++;
      return { rows: [{ available_paise: '0', held_paise: '0' }] };
    }
    if (sql.includes('UPDATE driver_payout_attempts'))
      attempt.status = String(values[1]);
    if (sql.includes('SELECT DISTINCT status'))
      return { rows: [{ status: 'PAID' }] };
    return { rows: [] };
  };
  const worker = new PayoutTransfer(
    {
      query,
      transaction: (work: (tx: { query: typeof query }) => unknown) =>
        work({ query }),
    } as unknown as PostgresService,
    {} as PayoutMethods,
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

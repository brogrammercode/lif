import assert from 'node:assert/strict';
import { it } from 'node:test';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/database/prisma.service.js';
import { DriverAccountService } from '../features/driver_account/driver_account.service.js';
import {
  finance_query,
  finance_range,
  payout_details,
  payout_request,
} from '../features/driver_account/driver_account.type.js';
import {
  seal_payout,
  reveal_payout,
  mask_payout,
} from '../features/driver_account/payout_security.js';
import {
  approved_driver_upi,
  approved_driver_upis,
} from '../features/driver_operations/driver_payout.js';
import { VehicleCatalogRepository } from '../features/vehicle_catalog/vehicle_catalog.repo.js';
import { brand_input } from '../features/vehicle_catalog/vehicle_catalog.type.js';
const details = payout_details.parse({
  holder_name: 'Test Driver',
  upi: 'driver@upi',
  account_number: '001234567890',
  ifsc: 'abcd0123456',
});
const key = '7de95280-a884-4d05-a4e3-785cbef951df';
function fixture() {
  const rows: Record<string, any>[] = [];
  const audits: unknown[] = [];
  let exited = false;
  const tx = {
    $executeRaw: async () => 1,
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        role: where.id === 'admin' ? 'ADMIN' : 'DRIVER',
        status: 'ACTIVE',
        deleted_at: null,
      }),
    },
    driverProfile: {
      findUnique: async () => ({
        id: 'profile',
        availability: 'SUSPENDED',
        verification_status: 'VERIFIED',
      }),
    },
    partnerApplication: {
      findUnique: async () => ({ status: exited ? 'EXITED' : 'ACTIVATED' }),
    },
    driverPayoutChange: {
      findMany: async () => rows,
      findUnique: async ({ where }: { where: Record<string, any> }) =>
        rows.find((v) =>
          where.id
            ? v.id === where.id
            : v.user_id === where.user_id_request_key.user_id &&
              v.request_key === where.user_id_request_key.request_key,
        ) ?? null,
      findFirst: async ({ where }: { where: Record<string, any> }) =>
        rows.find(
          (v) => v.user_id === where.user_id && v.status === where.status,
        ) ?? null,
      create: async ({ data }: { data: Record<string, any> }) => {
        const row = { ...data, id: 'change', status: 'PENDING', version: 1 };
        rows.push(row);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, any>;
        data: Record<string, any>;
      }) => {
        const row = rows.find(
          (v) =>
            v.id === where.id &&
            v.status === where.status &&
            v.version === where.version,
        );
        if (!row) return { count: 0 };
        Object.assign(row, { ...data, version: row.version + 1 });
        return { count: 1 };
      },
      findUniqueOrThrow: async () => rows[0],
    },
    userLog: {
      create: async ({ data }: { data: unknown }) => {
        audits.push(data);
        return {};
      },
    },
    notification: { create: async () => ({}) },
  };
  const db = new PrismaService();
  Object.defineProperty(db, 'client', {
    value: {
      ...tx,
      $transaction: async (action: (v: typeof tx) => Promise<unknown>) =>
        action(tx),
    },
  });
  return {
    service: new DriverAccountService(db),
    tx,
    db,
    rows,
    audits,
    exit: () => {
      exited = true;
    },
  };
}
it('validates bank/UPI alternatives, retains leading zeroes and normalizes IFSC', () => {
  assert.equal(details.account_number, '001234567890');
  assert.equal(details.ifsc, 'ABCD0123456');
  assert.equal(
    payout_details.safeParse({ holder_name: 'Test', upi: 'invalid' }).success,
    false,
  );
  assert.equal(
    payout_details.safeParse({
      holder_name: 'Test',
      account_number: '001234567890',
    }).success,
    false,
  );
  assert.equal(
    payout_details.safeParse({ holder_name: 'Test', upi: 'test@upi' }).success,
    true,
  );
});
it('encrypts payout details, masks identifiers and detects ciphertext tampering', () => {
  const sealed = seal_payout(details);
  assert.ok(!sealed.includes(details.account_number!));
  assert.deepEqual(reveal_payout(sealed), details);
  assert.equal(mask_payout(details).account_number, '****7890');
  assert.equal(mask_payout(details).upi, '***@upi');
  const pieces = sealed.split('.');
  pieces[1] = Buffer.alloc(16).toString('base64url');
  assert.throws(() => reveal_payout(pieces.join('.')));
});
it('payout request retries do not duplicate requests and reject changed payloads', async () => {
  const f = fixture();
  const input = payout_request.parse({ request_key: key, details });
  await f.service.request('driver', input);
  await f.service.request('driver', input);
  assert.equal(f.rows.length, 1);
  assert.equal(f.audits.length, 1);
  assert.ok(!JSON.stringify(f.audits).includes(details.account_number!));
  await assert.rejects(
    () =>
      f.service.request('driver', {
        ...input,
        details: { ...details, upi: 'other@upi' },
      }),
    { error_code: 'PAYOUT_REPLAY_CONFLICT' },
  );
  await assert.rejects(
    () =>
      f.service.request('driver', {
        ...input,
        request_key: 'e7514e01-254e-4c9f-a595-54f3cdd2cc4b',
      }),
    { error_code: 'PAYOUT_CHANGE_PENDING' },
  );
});
it('payout review enforces admin rights, version and exit participation', async () => {
  const f = fixture();
  await f.service.request(
    'driver',
    payout_request.parse({ request_key: key, details }),
  );
  await assert.rejects(
    () =>
      f.service.review('driver', 'change', {
        expected_version: 1,
        status: 'APPROVED',
        note: 'Approved details',
      }),
    { error_code: 'ADMIN_ACCESS_DENIED' },
  );
  await f.service.review('admin', 'change', {
    expected_version: 1,
    status: 'APPROVED',
    note: 'Verified ownership',
  });
  await assert.rejects(
    () =>
      f.service.review('admin', 'change', {
        expected_version: 1,
        status: 'REJECTED',
        note: 'Stale review',
      }),
    { error_code: 'PAYOUT_CHANGE_CONFLICT' },
  );
  const exited = fixture();
  exited.exit();
  await assert.rejects(
    () =>
      exited.service.request(
        'driver',
        payout_request.parse({ request_key: key, details }),
      ),
    { error_code: 'DRIVER_EXITED' },
  );
});
it('only an approved account change overrides the application UPI, including bank-only changes', async () => {
  const db = {
    driverPayoutChange: {
      findFirst: async () => ({ details_ciphertext: seal_payout(details) }),
      findMany: async () => [
        { user_id: 'driver', details_ciphertext: seal_payout(details) },
      ],
    },
    partnerApplication: {
      findUnique: async () => null,
      findMany: async () => [],
    },
  };
  assert.equal(await approved_driver_upi(db as any, 'driver'), 'driver@upi');
  assert.equal(
    (await approved_driver_upis(db as any, ['driver'])).get('driver'),
    'driver@upi',
  );
  db.driverPayoutChange.findFirst = async () => ({
    details_ciphertext: seal_payout({
      holder_name: 'Driver',
      account_number: '001234567890',
      ifsc: 'ABCD0123456',
    }),
  });
  assert.equal(await approved_driver_upi(db as any, 'driver'), null);
});
it('driver finance reads reconcile separate obligations with owner/date predicates in one snapshot', async () => {
  const f = fixture();
  const calls: Record<string, any>[] = [];
  const decimal = (n: number) => new Prisma.Decimal(n);
  const tx = {
    ...f.tx,
    ride: {
      aggregate: async (args: Record<string, any>) => {
        calls.push(args);
        return {
          _sum: { final_fare: decimal(args.where.payment ? 50 : 100) },
          _count: { _all: 2, final_fare: 2 },
        };
      },
      findMany: async (args: Record<string, any>) => {
        calls.push(args);
        return [];
      },
      count: async () => 2,
    },
    payment: {
      groupBy: async (args: Record<string, any>) => {
        calls.push(args);
        return [
          {
            status: 'CAPTURED',
            collection_method: 'CASH',
            _sum: { amount: decimal(40) },
          },
          {
            status: 'PENDING',
            collection_method: 'UPI',
            _sum: { amount: decimal(60) },
          },
          {
            status: 'REQUIRES_ACTION',
            collection_method: 'CARD',
            _sum: { amount: decimal(20) },
          },
        ];
      },
    },
    rideSettlementReview: {
      groupBy: async (args: Record<string, any>) => {
        calls.push(args);
        return [
          { status: 'APPROVED', _sum: { fee_amount: decimal(10) } },
          { status: 'REQUESTED', _sum: { fee_amount: decimal(5) } },
        ];
      },
    },
  };
  const db = new PrismaService();
  Object.defineProperty(db, 'client', {
    value: {
      $transaction: async (
        action: (t: typeof tx) => Promise<unknown>,
        options: { isolationLevel: string },
      ) => {
        assert.equal(options.isolationLevel, 'RepeatableRead');
        return action(tx);
      },
    },
  });
  const result = await new DriverAccountService(db).finance(
    'driver',
    finance_query.parse({ from: '2026-10-01', to: '2026-10-24', page: 2 }),
  );
  assert.equal(result.summary.cash_received.toString(), '40');
  assert.equal(result.summary.collection_pending.toString(), '60');
  assert.equal(result.summary.provider_resolved.toString(), '20');
  assert.equal(result.summary.approved_charges_due.toString(), '10');
  assert.equal(result.summary.charges_under_review.toString(), '5');
  assert.equal(result.summary.platform_payout, '0.00');
  assert.equal(result.summary.receipt_unrecorded.toString(), '50');
  assert.ok(calls.every((v) => JSON.stringify(v).includes('profile')));
  assert.equal(calls.find((v) => 'skip' in v)?.skip, 20);
});
it('statement dates are bounded, inclusive of the end day, and reject reversed ranges', () => {
  const range = finance_range(
    finance_query.parse({ from: '2026-10-01', to: '2026-10-24' }),
  );
  assert.equal(range.until.toISOString(), '2026-10-25T00:00:00.000Z');
  assert.throws(() =>
    finance_range(
      finance_query.parse({ from: '2026-10-24', to: '2026-10-01' }),
    ),
  );
  assert.throws(() =>
    finance_range(
      finance_query.parse({ from: '2026-01-01', to: '2026-10-24' }),
    ),
  );
});
it('catalog correction forbids editing another requester or a verified entry', async () => {
  for (const row of [
    { requested_by_id: 'other', status: 'REJECTED' },
    { requested_by_id: 'driver', status: 'VERIFIED' },
  ]) {
    const f = fixture();
    const tx = {
      ...f.tx,
      vehicleBrand: {
        findUnique: async () => ({
          id: 'brand',
          ...row,
          updated_at: new Date(),
        }),
      },
    };
    const db = new PrismaService();
    Object.defineProperty(db, 'client', {
      value: {
        $transaction: async (action: (v: typeof tx) => Promise<unknown>) =>
          action(tx),
      },
    });
    await assert.rejects(
      () =>
        new VehicleCatalogRepository(db).save_brand(
          'driver',
          brand_input.parse({ name: 'Brand' }),
          'brand',
          true,
        ),
      { error_code: 'CATALOG_CORRECTION_DENIED' },
    );
  }
});

it('account read masks approved application bank details and exposes only file IDs for documents', async () => {
  const f = fixture();
  const tx = {
    ...f.tx,
    partnerApplication: {
      findUnique: async () => ({
        status: 'ACTIVATED',
        fields: [
          {
            id: 'bank',
            status: 'APPROVED',
            definition: {
              label: 'Bank account number and IFSC',
              field_type: 'STRING',
            },
            value: '001234567890',
          },
          {
            id: 'upi',
            status: 'APPROVED',
            definition: { label: 'UPI ID', field_type: 'STRING' },
            value: 'driver@upi',
          },
          {
            id: 'license',
            status: 'APPROVED',
            definition: { label: 'Licence', field_type: 'PDF' },
            value: 'private-asset',
          },
        ],
      }),
    },
  };
  const db = new PrismaService();
  Object.defineProperty(db, 'client', {
    value: {
      $transaction: async (action: (v: typeof tx) => Promise<unknown>) =>
        action(tx),
    },
  });
  const result = await new DriverAccountService(db).account('driver');
  assert.ok(!JSON.stringify(result).includes('001234567890'));
  assert.ok(!JSON.stringify(result).includes('driver@upi'));
  assert.equal(result.initial_payout[0]?.display, '****7890');
  assert.deepEqual(
    result.application?.fields.find((v) => v.id === 'license')?.asset_ids,
    ['private-asset'],
  );
  assert.ok(!('value' in result.application!.fields[0]!));
});

it('unreadable approved destinations disable only that driver UPI without reviving application details', async () => {
  const db = {
    driverPayoutChange: {
      findFirst: async () => ({ details_ciphertext: 'broken' }),
      findMany: async () => [
        { user_id: 'broken', details_ciphertext: 'broken' },
        { user_id: 'valid', details_ciphertext: seal_payout(details) },
      ],
    },
    partnerApplication: {
      findUnique: async () => ({ fields: [] }),
      findMany: async () => [],
    },
  };
  assert.equal(await approved_driver_upi(db as any, 'broken'), null);
  const batch = await approved_driver_upis(db as any, ['broken', 'valid']);
  assert.equal(batch.has('broken'), false);
  assert.equal(batch.get('valid'), 'driver@upi');
});

it('payout ciphertext rejects extra segments and reports unreadable details without server failure', async () => {
  assert.throws(() => reveal_payout(seal_payout(details) + '.extra'));
  const f = fixture();
  await f.service.request(
    'driver',
    payout_request.parse({ request_key: key, details }),
  );
  f.rows[0]!.details_ciphertext = 'broken';
  await assert.rejects(() => f.service.reveal('admin', 'change'), {
    error_code: 'PAYOUT_DETAILS_UNAVAILABLE',
  });
  await assert.rejects(
    () =>
      f.service.review('admin', 'change', {
        expected_version: 1,
        status: 'APPROVED',
        note: 'Verified ownership',
      }),
    { error_code: 'PAYOUT_DETAILS_UNAVAILABLE' },
  );
  await f.service.review('admin', 'change', {
    expected_version: 1,
    status: 'REJECTED',
    note: 'Please submit new details',
  });
});

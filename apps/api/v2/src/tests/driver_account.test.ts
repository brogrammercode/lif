import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { PostgresService } from '../database/postgres.service.js';
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
  findApprovedDriverUpi,
  findApprovedDriverUpis,
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
  };
  const query = async (sql: string, args: unknown[] = []) => {
    if (sql.includes('FROM users'))
      return {
        rows: [await tx.user.findUnique({ where: { id: String(args[0]) } })],
      };
    if (sql.includes('FROM driver_profiles'))
      return {
        rows: [
          {
            id: 'profile',
            availability: 'SUSPENDED',
            verification_status: 'VERIFIED',
          },
        ],
      };
    if (sql.includes('FROM partner_applications'))
      return { rows: [{ status: exited ? 'EXITED' : 'ACTIVATED' }] };
    if (
      sql.includes(
        'FROM driver_payout_changes WHERE user_id=$1 AND request_key=$2',
      )
    )
      return {
        rows: rows.filter(
          (row) => row.user_id === args[0] && row.request_key === args[1],
        ),
      };
    if (
      sql.includes(
        "FROM driver_payout_changes WHERE user_id=$1 AND status='PENDING'",
      )
    )
      return {
        rowCount: rows.filter(
          (row) => row.user_id === args[0] && row.status === 'PENDING',
        ).length,
      };
    if (sql.includes('FROM driver_payout_changes WHERE id=$1'))
      return { rows: rows.filter((row) => row.id === args[0]) };
    if (sql.startsWith('INSERT INTO driver_payout_changes')) {
      const row = {
        id: 'change',
        user_id: args[1],
        request_key: args[2],
        details_ciphertext: args[3],
        summary: JSON.parse(String(args[4])),
        status: 'PENDING',
        version: 1,
      };
      rows.push(row);
      return { rows: [row] };
    }
    if (sql.startsWith('UPDATE driver_payout_changes')) {
      const row = rows.find(
        (row) =>
          row.id === args[0] &&
          row.status === 'PENDING' &&
          row.version === args[4],
      );
      if (!row) return { rows: [] };
      Object.assign(row, {
        status: args[1],
        version: row.version + 1,
        rejection_reason: args[3],
      });
      return { rows: [row] };
    }
    if (sql.includes('INSERT INTO user_logs')) audits.push(args);
    return { rows: [] };
  };
  return {
    service: new DriverAccountService({
      transaction: (work: (tx: { query: typeof query }) => unknown) =>
        work({ query }),
    } as unknown as PostgresService),
    tx,
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
  assert.equal(
    await findApprovedDriverUpi(
      {
        query: async () => ({
          rows: [await db.driverPayoutChange.findFirst()],
        }),
      } as unknown as PostgresService,
      'driver',
    ),
    'driver@upi',
  );
  const sql = {
    query: async () => ({ rows: await db.driverPayoutChange.findMany() }),
  } as unknown as PostgresService;
  assert.equal(
    (await findApprovedDriverUpis(sql, ['driver'])).get('driver'),
    'driver@upi',
  );
  db.driverPayoutChange.findFirst = async () => ({
    details_ciphertext: seal_payout({
      holder_name: 'Driver',
      account_number: '001234567890',
      ifsc: 'ABCD0123456',
    }),
  });
  assert.equal(
    await findApprovedDriverUpi(
      {
        query: async () => ({
          rows: [await db.driverPayoutChange.findFirst()],
        }),
      } as unknown as PostgresService,
      'driver',
    ),
    null,
  );
});
it('driver finance reads reconcile separate obligations with owner/date predicates in one snapshot', async () => {
  const calls: unknown[][] = [];
  const query = async (sql: string, args: unknown[]) => {
    if (sql.includes('FROM driver_profiles'))
      return { rows: [{ id: 'profile' }] };
    calls.push(args);
    assert.match(
      sql,
      /r\.driver_id=\$1 AND r.status='COMPLETED' AND r.completed_at >= \$2 AND r.completed_at < \$3/,
    );
    if (sql.includes('gross_fares'))
      return {
        rows: [
          {
            cash_received: '40',
            collection_pending: '60',
            provider_resolved: '20',
            approved_charges_due: '10',
            charges_under_review: '5',
            receipt_unrecorded: '50',
            completed_trips: 2,
          },
        ],
      };
    return { rows: [] };
  };
  const db = {
    transaction: (
      work: (tx: { query: typeof query }) => unknown,
      isolation: string,
    ) => {
      assert.equal(isolation, 'REPEATABLE READ');
      return work({ query });
    },
  } as unknown as PostgresService;
  const result = await new DriverAccountService(db).finance(
    'driver',
    finance_query.parse({ from: '2026-10-01', to: '2026-10-24', page: 2 }),
  );
  assert.equal(result.summary.cash_received, '40');
  assert.equal(result.summary.collection_pending, '60');
  assert.equal(result.summary.provider_resolved, '20');
  assert.equal(result.summary.approved_charges_due, '10');
  assert.equal(result.summary.charges_under_review, '5');
  assert.equal(result.summary.platform_payout, '0.00');
  assert.equal(result.summary.receipt_unrecorded, '50');
  assert.deepEqual(calls[0], [
    'profile',
    new Date('2026-10-01'),
    new Date('2026-10-25'),
  ]);
  assert.equal(calls[1]?.[3], 20);
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
    const tx = {
      query: async (sql: string) => {
        if (sql.includes('FROM users'))
          return {
            rows: [{ role: 'DRIVER', status: 'ACTIVE', deleted_at: null }],
          };
        if (sql.includes('FROM partner_applications'))
          return { rows: [{ status: 'ACTIVATED' }] };
        if (sql.includes('FROM driver_profiles')) return { rowCount: 1 };
        if (sql.includes('FROM vehicle_brands'))
          return { rows: [{ id: 'brand', ...row, updated_at: new Date() }] };
        return { rows: [] };
      },
    };
    const db = {
      transaction: (action: (v: typeof tx) => Promise<unknown>) => action(tx),
    } as unknown as PostgresService;
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
  const query = async (sql: string) => {
    if (sql.includes('FROM driver_profiles'))
      return { rows: [{ id: 'profile' }] };
    if (sql.includes('FROM partner_applications'))
      return { rows: [{ id: 'app', status: 'ACTIVATED' }] };
    if (sql.includes('FROM partner_application_fields'))
      return {
        rows: [
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
      };
    return { rows: [] };
  };
  const db = {
    transaction: (work: (tx: { query: typeof query }) => unknown) =>
      work({ query }),
  } as unknown as PostgresService;
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
  assert.equal(
    await findApprovedDriverUpi(
      {
        query: async () => ({
          rows: [await db.driverPayoutChange.findFirst()],
        }),
      } as unknown as PostgresService,
      'broken',
    ),
    null,
  );
  const sql = {
    query: async () => ({ rows: await db.driverPayoutChange.findMany() }),
  } as unknown as PostgresService;
  const batch = await findApprovedDriverUpis(sql, ['broken', 'valid']);
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

import { AdminUserRepository } from '../features/admin_user/admin_user.repo.js';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { PendingService } from '../features/admin_pending/pending.service.js';
import { PendingRepository } from '../features/admin_pending/pending.repository.js';
import type { PostgresService } from '../database/postgres.service.js';
import {
  pending_query,
  changes_pending,
  is_pending_poll,
} from '../features/admin_pending/pending.rules.js';
import { account_is_driver } from '../features/admin_user/admin_user.rides.js';
import {
  adminRideRows,
  rideFilters,
} from '../features/admin_user/sql/admin-users.sql.js';

it('bounds visible IDs across both entity types and rejects unrecognized filters', () => {
  assert.equal(pending_query.parse({ user_ids: 'a,a,b' }).user_ids.length, 2);
  assert.throws(() =>
    pending_query.parse({
      user_ids: Array.from({ length: 30 }, (_, i) => 'u' + i).join(','),
      application_ids: Array.from({ length: 21 }, (_, i) => 'a' + i).join(','),
    }),
  );
  assert.throws(() => pending_query.parse({ user_ids: 'a,,b' }));
  assert.throws(() => pending_query.parse({ token: 'private' }));
});
it('invalidates pending mutations from both apps and exempts only the exact count GET from success auditing', () => {
  for (const path of [
    '/api/v2/driver/vehicle-brands/requests',
    '/api/v2/driver/vehicle-models/requests/id',
    '/api/v2/driver/vehicle-verification',
    '/api/v2/partner-program/applications',
    '/api/v2/trips/id/issues',
    '/api/v2/driver/rides/id/collection',
    '/api/v2/admin/users/id/vehicle-verification/v/review',
  ])
    assert.equal(changes_pending('POST', path), true, path);
  assert.equal(changes_pending('POST', '/api/v2/driver/location'), false);
  assert.equal(changes_pending('GET', '/api/v2/partner-program/me'), false);
  assert.equal(
    is_pending_poll('GET', '/api/v2/admin/pending-counts?user_ids=1'),
    true,
  );
  assert.equal(is_pending_poll('POST', '/api/v2/admin/pending-counts'), false);
  assert.equal(
    is_pending_poll('GET', '/api/v2/admin/pending-counts/private'),
    false,
  );
});
it('reuses a shared fresh snapshot and rebuilds once without serializing records or counting fields as applications', async () => {
  let snapshot: unknown = null,
    valid = false,
    scans = 0,
    writes = 0;
  const numbers = {
    signup_emails: 0,
    brands: 2,
    models: 3,
    vehicles: 2,
    applications: 1,
    confirmations: 2,
    exits: 1,
    reviews: 1,
    email_failures: 3,
    activation_locked: 1,
  };
  const tx = {
    query: async (sql: string) => {
      if (sql.includes('INSERT INTO')) {
        snapshot = numbers;
        valid = true;
        writes++;
        return { rows: [] };
      }
      if (sql.includes('admin_pending_snapshots'))
        return { rows: snapshot ? [{ payload: snapshot, valid }] : [] };
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      scans++;
      return { rows: [numbers] };
    },
  };
  const db = {
    transaction: async (work: (t: typeof tx) => unknown) => work(tx),
  } as unknown as PostgresService;
  const service = new PendingService(new PendingRepository(db));
  const first = await service.counts(pending_query.parse({}));
  const second = await service.counts(pending_query.parse({}));
  assert.deepEqual(second, first);
  assert.equal(scans, 1);
  assert.equal(writes, 1);
  assert.equal(first.tabs.vehicle_models, 5);
  assert.equal(first.tabs.applications, 1);
  assert.equal(first.total, 12); // repeated navigation and attention counters do not inflate totals
  assert.deepEqual(first.entities, { users: {}, applications: {} });
  valid = false;
  await service.counts(pending_query.parse({}));
  assert.equal(scans, 2);
});
it('treats activated staff as driver accounts and keeps trip secrets outside the admin ride projection', () => {
  assert.equal(
    account_is_driver({ role: 'ADMIN', partner_activated_at: new Date() }),
    true,
  );
  assert.equal(
    account_is_driver({ role: 'RIDER', partner_activated_at: null }),
    false,
  );
  for (const key of [
    'access_code',
    'start_verification',
    'locations',
    'messages',
  ])
    assert.ok(!adminRideRows.includes(key));
});

it('user ride history scopes every query to the selected rider or driver and clamps shrinking pages', async () => {
  for (const [role, activated, driver] of [
    ['RIDER', null, false],
    ['DRIVER', null, true],
    ['ADMIN', new Date(), true],
  ] as const) {
    const filters: unknown[][] = [];
    const tx = {
      query: async (sql: string, params: unknown[]) => {
        if (sql.includes('FROM users WHERE'))
          return {
            rows: [{ id: 'selected', role, partner_activated_at: activated }],
          };
        assert.ok(sql.includes(rideFilters));
        filters.push(params);
        if (sql.includes('count(*)')) return { rows: [{ total: 21 }] };
        assert.equal(sql, adminRideRows);
        return { rows: [] };
      },
    };
    const repo = new AdminUserRepository({
      transaction: async (work: (client: typeof tx) => unknown) => work(tx),
    } as unknown as PostgresService);
    const result = await repo.rides('selected', { status: 'all', page: 999 });
    assert.equal(result.page, 2);
    assert.equal(result.role, driver ? 'driver' : 'rider');
    assert.deepEqual(filters, [
      ['selected', driver, 'all'],
      ['selected', driver, 'all', 20],
    ]);
  }
});

import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { PrismaService } from '../infra/database/prisma.service.js';
import {
  PartnerApplicationDeletionService,
  application_delete_input,
} from '../features/partner_program/partner_application_deletion.service.js';
import {
  AuditRetentionService,
  audit_cutoff,
} from '../core/audit_retention.service.js';
import {
  admin_action_label,
  find_admin_action,
} from '../core/admin_audit.action.js';
import { readFileSync } from 'node:fs';

function fixture() {
  const state = {
    role: 'ADMIN',
    exists: true,
    sending: false,
    writes: [] as string[],
  };
  const app = {
    id: 'application',
    user_id: 'applicant',
    version: 3,
    status: 'SUBMITTED',
    contact_email: 'applicant@example.test',
    created_at: new Date('2026-10-29'),
    activated_at: null as Date | null,
    user: {
      first_name: 'Test',
      last_name: 'Applicant',
      role: 'RIDER',
      partner_activated_at: null as Date | null,
    },
    confirmation: { id: 'confirmation' },
    exit_request: null as { id: string } | null,
    _count: { fields: 4, deliveries: 2 },
  };
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [],
    user: {
      findUnique: async () => ({
        role: state.role,
        status: 'ACTIVE',
        deleted_at: null,
      }),
    },
    partnerApplication: {
      findUnique: async () => (state.exists ? app : null),
      delete: async () => {
        state.writes.push('application');
        return app;
      },
    },
    partnerAsset: {
      aggregate: async () => ({ _count: { _all: 5 }, _sum: { size: 1024 } }),
      deleteMany: async ({
        where,
      }: {
        where: { owner_id: string; purpose: { in: string[] } };
      }) => {
        assert.equal(where.owner_id, 'applicant');
        assert.deepEqual(where.purpose.in, [
          'APPLICATION_DOCUMENT',
          'APPLICATION_SELFIE',
          'FINAL_PDF',
        ]);
        state.writes.push('uploads');
        return { count: 5 };
      },
    },
    notification: {
      count: async ({ where }: { where: { AND?: unknown } }) =>
        where.AND ? Number(state.sending) : 6,
      deleteMany: async ({ where }: { where: unknown }) => {
        assert.ok(JSON.stringify(where).includes('application_id'));
        state.writes.push('notifications');
        return { count: 6 };
      },
    },
    partnerDelivery: { count: async () => 0 },
    userLog: {
      create: async ({
        data,
      }: {
        data: { action: string; after_data: unknown };
      }) => {
        assert.equal(data.action, 'DELETE_PARTNER_APPLICATION');
        assert.ok(data.after_data);
        state.writes.push('audit');
        return {};
      },
    },
  };
  const database = {
    client: {
      $transaction: (work: (client: typeof tx) => unknown) => work(tx),
    },
  } as unknown as PrismaService;
  return {
    state,
    app,
    service: new PartnerApplicationDeletionService(database),
  };
}
const code = (expected: string) => (error: unknown) =>
  (error as { error_code?: string })?.error_code === expected;
it('previews exact application counts and removes only its owned scope while retaining an audit', async () => {
  const f = fixture();
  const preview = await f.service.preview('admin', 'application');
  assert.equal(preview.allowed, true);
  assert.equal(preview.counts.fields, 4);
  assert.equal(preview.counts.uploads, 5);
  assert.deepEqual(f.state.writes, []);
  const result = await f.service.remove('admin', 'application', {
    version: 3,
    confirmation: 'APPLICANT@example.test',
  });
  assert.equal(result.deleted.confirmations, 1);
  assert.deepEqual(f.state.writes, [
    'notifications',
    'application',
    'uploads',
    'audit',
  ]);
});
for (const scenario of [
  'activated',
  'application activation timestamp',
  'historical activation',
  'driver role',
  'exit history',
  'sending email',
  'stale version',
  'wrong confirmation',
  'non-admin',
  'missing',
] as const) {
  it(`application deletion refuses ${scenario} before deleting any data`, async () => {
    const f = fixture();
    let expected = 'APPLICATION_DELETE_BLOCKED';
    const input = { version: 3, confirmation: 'applicant@example.test' };
    if (scenario === 'activated') f.app.status = 'ACTIVATED';
    if (scenario === 'application activation timestamp')
      f.app.activated_at = new Date();
    if (scenario === 'historical activation')
      f.app.user.partner_activated_at = new Date();
    if (scenario === 'driver role') f.app.user.role = 'DRIVER';
    if (scenario === 'exit history') f.app.exit_request = { id: 'exit' };
    if (scenario === 'sending email') f.state.sending = true;
    if (scenario === 'stale version') {
      input.version = 2;
      expected = 'APPLICATION_CHANGED';
    }
    if (scenario === 'wrong confirmation') {
      input.confirmation = 'other@example.test';
      expected = 'CONFIRMATION_REQUIRED';
    }
    if (scenario === 'non-admin') {
      f.state.role = 'RIDER';
      expected = 'ADMIN_ACCESS_DENIED';
    }
    if (scenario === 'missing') {
      f.state.exists = false;
      expected = 'APPLICATION_NOT_FOUND';
    }
    await assert.rejects(
      f.service.remove('admin', 'application', input),
      code(expected),
    );
    assert.deepEqual(f.state.writes, []);
  });
}
it('retention uses each record timestamp, batches its deletes and stops when another worker owns the lock', async () => {
  const now = new Date('2026-10-29T12:00:00Z'),
    cutoff = audit_cutoff(now);
  assert.equal(cutoff.toISOString(), '2026-10-22T12:00:00.000Z');
  const calls: { sql: string; values: unknown[] }[] = [];
  let acquired = true;
  const tx = {
    $queryRaw: async () => [{ acquired }],
    $executeRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: sql.join('?'), values });
      return 2;
    },
  };
  const service = new AuditRetentionService({
    client: { $transaction: (work: (tx: unknown) => unknown) => work(tx) },
  } as unknown as PrismaService);
  assert.deepEqual(await service.prune(1, now), {
    admin_activity: 2,
    user_logs: 2,
    has_more: false,
  });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.ok(call.sql.includes('FOR UPDATE SKIP LOCKED'));
    assert.deepEqual(call.values, [cutoff, 1000]);
  }
  acquired = false;
  calls.length = 0;
  assert.deepEqual(await service.prune(1, now), {
    admin_activity: 0,
    user_logs: 0,
    has_more: false,
  });
  assert.equal(calls.length, 0);
});
it('requires an exact application deletion payload', () => {
  assert.equal(
    application_delete_input.safeParse({
      version: 0,
      confirmation: 'user@example.test',
    }).success,
    false,
  );
  assert.equal(
    application_delete_input.safeParse({
      version: 1,
      confirmation: 'user@example.test',
      force: true,
    }).success,
    false,
  );
});
it('gives every registered route a readable audit title, including driver activity performed by admins', () => {
  const routes = JSON.parse(readFileSync('route-manifest.json', 'utf8')) as {
    method: string;
    path: string;
  }[];
  for (const route of routes)
    assert.ok(
      find_admin_action(route.method, route.path),
      route.method + ' ' + route.path,
    );
  assert.equal(
    admin_action_label('POST', '/api/v2/driver/location'),
    'Driver location updated',
  );
  assert.equal(
    admin_action_label('POST', '/api/v2/driver/rides/123/arrive'),
    'Pickup arrival confirmed',
  );
  assert.equal(
    admin_action_label('POST', '/api/v2/driver/offers/123/accept'),
    'Ride offer accepted',
  );
});

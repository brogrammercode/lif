import type { AdminAuditRepository } from '../database/admin-audit.repository.js';
import type { PostgresService } from '../database/postgres.service.js';
import {
  AdminActivityReader,
  activityFilter,
} from '../features/admin_access/admin-activity.reader.js';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Request, Response } from 'express';
import {
  AdminAuditService,
  is_admin_path,
} from '../core/admin_audit.service.js';
import {
  find_admin_action,
  admin_action_label,
  legacy_action_aliases,
} from '../core/admin_audit.action.js';

function fixture() {
  const rows = new Map<string, Record<string, unknown>>();
  let writes = 0,
    starts = 0,
    failUpdate = false;
  const repository = {
    start: async (data: Record<string, unknown> & { request_id: string }) => {
      starts++;
      if (!rows.has(data.request_id))
        rows.set(data.request_id, { id: data.request_id, ...data });
      return data.request_id;
    },
    complete: async (id: string, data: Record<string, unknown>) => {
      if (failUpdate) {
        failUpdate = false;
        throw new Error('Temporary audit connection failure');
      }
      writes++;
      Object.assign(rows.get(id)!, data);
    },
  } as unknown as AdminAuditRepository;
  const req = {
    method: 'POST',
    path: '/admin/partner-program/applications/application/approve',
    originalUrl:
      '/api/v2/admin/partner-program/applications/application/approve?token=never-store-this',
    request_id: 'request',
    get: () => 'browser',
    body: { decision: 'APPROVED', secret: 'never-store-this' },
  } as unknown as Request;
  const res = { statusCode: 200 } as Response;
  return {
    audit: new AdminAuditService(repository),
    req,
    res,
    rows,
    starts: () => starts,
    writes: () => writes,
    fail: () => {
      failUpdate = true;
    },
  };
}

it('describes every current admin route and both version/casing variants', () => {
  const routes = JSON.parse(readFileSync('route-manifest.json', 'utf8')) as {
    method: string;
    path: string;
    guards: string[];
  }[];
  for (const route of routes.filter(
    (row) =>
      row.guards.includes('AdminGuard') || row.path.startsWith('admin/auth/'),
  )) {
    assert.ok(
      find_admin_action(route.method, '/api/v2/' + route.path),
      `${route.method} ${route.path} lacks an audit action`,
    );
    assert.ok(
      find_admin_action(route.method, '/API/V1/' + route.path.toUpperCase()),
    );
  }
  assert.equal(
    admin_action_label(
      'POST',
      '/api/v2/admin/partner-program/applications/123/approve',
    ),
    'Approve partner application',
  );
  assert.equal(
    admin_action_label(
      'PATCH',
      '/api/v2/admin/partner-program/applications/123/fields/456',
      { decision: 'REJECTED' },
    ),
    'Reject partner application field',
  );
  assert.ok(
    legacy_action_aliases('application approved').includes(
      'POST /api/v2/admin/partner-program/applications/:id/approve',
    ),
  );
  assert.ok(is_admin_path('/API/V2/admin/unknown'));
  assert.ok(
    legacy_action_aliases('REVIEW_PARTNER_FIELD').includes(
      'Approve partner application field',
    ),
  );
  assert.deepEqual(legacy_action_aliases('___'), []);
  assert.equal(
    legacy_action_aliases('APPROVE_PARTNER_APPLICATION').includes(
      'PATCH /api/v2/admin/partner-program/applications/:id/fields/:fieldId',
    ),
    false,
  );
  assert.equal(
    admin_action_label(
      'PATCH',
      '/api/v2/admin/partner-program/applications/123/fields/456',
      { decision: { toString: null } },
    ),
    'Review partner application field',
  );
  assert.equal(is_admin_path('/api/v2/administrator'), false);
});

it('deduplicates audit starts and finishes, attaches the verified actor and excludes payloads and queries', async () => {
  const f = fixture();
  await Promise.all([f.audit.start(f.req), f.audit.start(f.req)]);
  f.req.admin_actor_id = 'verified-admin';
  await Promise.all([
    f.audit.complete(f.req, f.res),
    f.audit.complete(f.req, f.res, { source: 'response' }),
  ]);
  assert.equal(f.starts(), 1);
  assert.equal(f.writes(), 1);
  assert.equal(f.rows.size, 1);
  const row = f.rows.get('request')!;
  assert.equal(row.actor_id, 'verified-admin');
  assert.equal(row.status_code, 200);
  assert.equal(row.action, 'Approve partner application');
  assert.ok(row.completed_at instanceof Date);
  assert.equal(JSON.stringify(row).includes('never-store-this'), false);
});

it('retries a failed completion without duplicating or downgrading a committed outcome', async () => {
  const f = fixture();
  f.fail();
  await assert.rejects(f.audit.complete(f.req, f.res));
  await f.audit.complete(f.req, f.res, { source: 'response' });
  await f.audit.complete(f.req, f.res);
  await f.audit.complete(f.req, f.res, { source: 'abort', status_code: 499 });
  assert.equal(f.rows.size, 1);
  assert.equal(f.rows.get('request')!.status_code, 200);
});

it('records interruption but lets a later committed handler outcome replace it', async () => {
  const f = fixture();
  await f.audit.complete(f.req, f.res, { source: 'abort', status_code: 499 });
  assert.equal(f.rows.get('request')!.status_code, 499);
  await f.audit.complete(f.req, f.res);
  assert.equal(f.rows.get('request')!.status_code, 200);
});

it('does not audit unrelated rider requests', async () => {
  const f = fixture();
  f.req.originalUrl = '/api/v2/rides';
  await f.audit.complete(f.req, f.res);
  assert.equal(f.rows.size, 0);
});

it('keeps serialization failures rather than a provisional handler success', async () => {
  const f = fixture();
  await f.audit.complete(f.req, f.res);
  await f.audit.complete(f.req, f.res, { status_code: 500 });
  await f.audit.complete(f.req, f.res, { source: 'response' });
  assert.equal(f.rows.get('request')!.status_code, 500);
});

it('finds historical approval labels, separates read traffic and limits retention to seven days', async () => {
  let values: unknown[] = [];
  const database = {
    query: async (_sql: string, params: unknown[]) => {
      values = params;
      return {
        rows: [
          {
            total: 1,
            page: 1,
            activities: [
              {
                id: 'old',
                method: 'POST',
                path: '/api/v2/admin/partner-program/applications/123/approve',
                action:
                  'POST /api/v2/admin/partner-program/applications/:id/approve',
                started_at: new Date().toISOString(),
                completed_at: null,
              },
            ],
          },
        ],
      };
    },
  } as unknown as PostgresService;
  const result = await new AdminActivityReader(database).list(
    activityFilter.parse({
      query: 'APPROVE_PARTNER_APPLICATION',
      activity: 'changes',
    }),
  );
  assert.equal(result.activities[0]!.action, 'Approve partner application');
  assert.equal(values[3], 'changes');
  assert.ok(
    (values[6] as string[]).includes(
      'post /api/v2/admin/partner-program/applications/:id/approve',
    ),
  );
  assert.equal(result.retention_days, 7);
  assert.ok(values[0] instanceof Date);
});

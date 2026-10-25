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
import { AdminActivityController } from '../features/admin_access/admin_activity.controller.js';
import { PrismaService } from '../infra/database/prisma.service.js';

function fixture() {
  const rows = new Map<string, Record<string, unknown>>();
  let writes = 0,
    starts = 0,
    failUpdate = false;
  const database = new PrismaService();
  Object.defineProperty(database, 'client', {
    value: {
      adminActivity: {
        upsert: async ({
          where,
          create,
        }: {
          where: { request_id: string };
          create: Record<string, unknown>;
        }) => {
          starts++;
          if (!rows.has(where.request_id))
            rows.set(where.request_id, { id: where.request_id, ...create });
          return rows.get(where.request_id)!;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          if (failUpdate) {
            failUpdate = false;
            throw new Error('Temporary audit connection failure');
          }
          writes++;
          Object.assign(rows.get(where.id)!, data);
          return rows.get(where.id)!;
        },
      },
    },
  });
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
    audit: new AdminAuditService(database),
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

it('finds historical approval labels, separates read traffic and preserves indefinite retention', async () => {
  const database = new PrismaService();
  let where: Record<string, unknown> = {};
  const tx = {
    adminActivity: {
      count: async (input: { where: Record<string, unknown> }) => {
        where = input.where;
        return 1;
      },
      findMany: async () => [
        {
          id: 'old',
          method: 'POST',
          path: '/api/v2/admin/partner-program/applications/123/approve',
          action: 'POST /api/v2/admin/partner-program/applications/:id/approve',
        },
      ],
    },
  };
  Object.defineProperty(database, 'client', {
    value: {
      $transaction: (action: (client: typeof tx) => Promise<unknown>) =>
        action(tx),
    },
  });
  const response = { status: () => {} } as unknown as Response;
  const result = await new AdminActivityController(database).list(
    {
      query: { query: 'APPROVE_PARTNER_APPLICATION', activity: 'changes' },
    } as unknown as Request,
    response,
  );
  assert.equal(
    result.data.activities[0]!.action,
    'Approve partner application',
  );
  assert.deepEqual(where.method, { notIn: ['GET', 'HEAD', 'OPTIONS'] });
  assert.ok(
    JSON.stringify(where).includes(
      'POST /api/v2/admin/partner-program/applications/:id/approve',
    ),
  );
  assert.equal(result.data.retention_days, null);
});

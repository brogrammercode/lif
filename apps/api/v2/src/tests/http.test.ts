import { PendingService } from '../features/admin_pending/pending.service.js';
import { AuditRetentionService } from '../core/audit_retention.service.js';
import { DriverOperationsService } from '../features/driver_operations/driver_operations.service.js';
import assert from 'node:assert/strict';
import { after, afterEach, before, it, mock } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ModulesContainer } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { create_application } from '../bootstrap.js';
import { PrismaService } from '../infra/database/prisma.service.js';
import { create_access_token } from '../infra/security/token.js';
import { VehicleCategoryService } from '../features/vehicle_category/vehicle_category.service.js';
import { RideService } from '../features/ride/ride.service.js';
import { SupportService } from '../features/support/support.service.js';
import { PaymentService } from '../features/payment/payment.service.js';
import { AdminAuthService } from '../features/admin_auth/admin_auth.service.js';
import { AdminSignInGuard } from '../core/guards.js';
import { AppError } from '../core/error.js';
import { config } from '../core/config.js';
import { ADMIN_COOKIE } from '../features/admin_auth/admin_auth.constant.js';
import { GeocodeService } from '../features/geocode/geocode.service.js';
import { PartnerProgramService } from '../features/partner_program/partner_program.service.js';

type Cached = {
  id: string;
  scope: string;
  key: string;
  request_hash: string;
  expires_at: Date;
  response_json: unknown;
  status_code: number | null;
};
const cache = new Map<string, Cached>();
const activities = new Map<string, Record<string, unknown>>();
const users = new Map([
  ['admin', { role: 'ADMIN', status: 'ACTIVE', sessions: [{ id: 'live' }] }],
  [
    'rider',
    { role: 'RIDER', status: 'ACTIVE', sessions: [] as { id: string }[] },
  ],
]);
const fake = {
  partnerApplication: { findUnique: async () => null },
  adminActivity: {
    upsert: async ({
      where,
      create,
    }: {
      where: { request_id: string };
      create: Record<string, unknown>;
    }) => {
      let row = activities.get(where.request_id);
      if (!row) {
        row = {
          id: randomUUID(),
          status_code: null,
          completed_at: null,
          ...create,
        };
        activities.set(where.request_id, row);
      }
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      const row = [...activities.values()].find((item) => item.id === where.id);
      assert.ok(row);
      Object.assign(row, data);
      return row;
    },
  },
  user: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      users.get(where.id) ?? null,
  },
  $queryRaw: async () => [{ value: 1 }],
  $disconnect: async () => {},
  idempotencyKey: {
    findUnique: async ({
      where,
    }: {
      where: { scope_key: { scope: string; key: string } };
    }) => cache.get(`${where.scope_key.scope}|${where.scope_key.key}`) ?? null,
    create: async ({
      data,
    }: {
      data: Omit<Cached, 'id' | 'response_json' | 'status_code'>;
    }) => {
      const key = `${data.scope}|${data.key}`;
      if (cache.has(key))
        throw new Prisma.PrismaClientKnownRequestError('Duplicate', {
          code: 'P2002',
          clientVersion: '6.19.3',
        });
      const record: Cached = {
        ...data,
        id: randomUUID(),
        response_json: null,
        status_code: null,
      };
      cache.set(key, record);
      return record;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Pick<Cached, 'response_json' | 'status_code'>;
    }) => {
      const record = [...cache.values()].find((value) => value.id === where.id);
      assert.ok(record);
      Object.assign(record, data);
      return record;
    },
    deleteMany: async ({ where }: { where: { id: string } }) => {
      const entry = [...cache.entries()].find(
        ([, value]) => value.id === where.id,
      );
      if (entry) cache.delete(entry[0]);
      return { count: entry ? 1 : 0 };
    },
  },
};
let app: NestExpressApplication;
let base: string;
const token = (id = 'rider', role = 'RIDER', family?: string) =>
  create_access_token({
    user_id: id,
    role,
    ...(family ? { session_family_id: family } : {}),
  });
const request = async (path: string, options: RequestInit = {}) => {
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(10_000),
  });
  return {
    response,
    body: (await response.json()) as {
      status: string;
      error_code?: string;
      data: unknown;
      request_id?: string;
    },
  };
};
const json = (
  data: unknown,
  access = token(),
  headers: Record<string, string> = {},
): RequestInit => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${access}`,
    ...headers,
  },
  body: JSON.stringify(data),
});
before(async () => {
  app = await create_application({ logger: false });
  Object.defineProperty(app.get(PrismaService), 'client', { value: fake });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
afterEach(() => {
  mock.restoreAll();
  cache.clear();
  activities.clear();
});
after(async () => {
  if (app) await app.close();
});

it('allows audit cleanup without credentials and does not accept caller-selected retention settings', async () => {
  const cleanup = mock.method(
    app.get(AuditRetentionService),
    'prune',
    async () => ({ admin_activity: 0, user_logs: 0, has_more: false }),
  );
  const result = await request(
    '/api/v2/internal/audit-retention?days=0&cutoff=2100-01-01',
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(result.body.data, {
    admin_activity: 0,
    user_logs: 0,
    has_more: false,
  });
  assert.equal(cleanup.mock.callCount(), 1);
  assert.deepEqual(cleanup.mock.calls[0]!.arguments, []);
});

it('keeps the route manifest aligned with compiled Nest routes and security metadata', () => {
  type Route = {
    feature: string;
    handler: string;
    method: string;
    path: string;
    guards: string[];
    idempotent: boolean;
  };
  const actual: Route[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const Controller of module.controllers.keys()) {
      if (typeof Controller !== 'function') continue;
      for (const handler of Object.getOwnPropertyNames(Controller.prototype)) {
        const fn: unknown = Controller.prototype[handler];
        if (typeof fn !== 'function') continue;
        const method = Reflect.getMetadata('method', fn) as
          RequestMethod | undefined;
        if (method === undefined) continue;
        const paths = Reflect.getMetadata('path', fn) as string | string[];
        const guards = [
          ...(Reflect.getMetadata('__guards__', Controller) ?? []),
          ...(Reflect.getMetadata('__guards__', fn) ?? []),
        ] as {
          name: string;
        }[];
        const interceptors = (Reflect.getMetadata('__interceptors__', fn) ??
          []) as { name: string }[];
        for (const path of Array.isArray(paths) ? paths : [paths]) {
          actual.push({
            feature: Controller.name
              .replace(/Controller$/, '')
              .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
              .toLowerCase(),
            handler,
            method: RequestMethod[method]!.toLowerCase(),
            path: [
              String(Reflect.getMetadata('path', Controller) ?? '').replace(
                /^\/+|\/+$/g,
                '',
              ),
              path.replace(/^\/+|\/+$/g, ''),
            ]
              .filter(Boolean)
              .join('/'),
            guards: guards.map((guard) => guard.name),
            idempotent: interceptors.some(
              (interceptor) => interceptor.name === 'IdempotencyInterceptor',
            ),
          });
        }
      }
    }
  }
  const expected = JSON.parse(
    readFileSync('route-manifest.json', 'utf8'),
  ) as Route[];
  const sorted = (routes: Route[]) =>
    routes.sort((left, right) =>
      `${left.method}:${left.path}`.localeCompare(
        `${right.method}:${right.path}`,
      ),
    );
  assert.deepEqual(sorted(actual), sorted(expected));
});

it('registers and protects every authenticated route on both URI versions', async () => {
  const routes = JSON.parse(readFileSync('route-manifest.json', 'utf8')) as {
    method: string;
    path: string;
    guards: string[];
  }[];
  assert.equal(routes.length, 196);
  for (const version of ['1', '2'])
    for (const route of routes.filter((value) =>
      value.guards.includes('AuthGuard'),
    )) {
      const result = await request(
        `/api/v${version}/${route.path.replaceAll(':id', 'fixture')}`,
        { method: route.method.toUpperCase() },
      );
      assert.equal(
        result.response.status,
        401,
        `${version} ${route.method} ${route.path}`,
      );
      assert.equal(result.body.error_code, 'UNAUTHORIZED');
      assert.equal(
        result.body.request_id,
        result.response.headers.get('x-request-id'),
      );
    }
});

it('partner uploads and application submissions accept authenticated personal accounts without an admin or driver guard', async () => {
  const service = app.get(PartnerProgramService);
  const actors: string[] = [];
  mock.method(service, 'store_asset', async (actor: string) => {
    actors.push(actor);
    return { id: 'fixture-asset' };
  });
  mock.method(service, 'submit', async (actor: string) => {
    actors.push(actor);
    return { id: 'fixture-application', status: 'SUBMITTED' };
  });
  for (const [actor, role] of [
    ['rider', 'RIDER'],
    ['admin', 'ADMIN'],
  ]) {
    const upload = await request(
      '/api/v2/partner-program/assets',
      json(
        {
          field_id: '__live_selfie__',
          capture_source: 'CAMERA',
          file_name: 'selfie.jpg',
          data_url: 'data:image/jpeg;base64,AQID',
        },
        token(actor, role),
      ),
    );
    assert.equal(upload.response.status, 200);
    assert.equal(upload.body.status, 'success');
    const submission = await request(
      '/api/v2/partner-program/applications',
      json(
        {
          version: 0,
          policy_version: 1,
          accepted: true,
          contact_email: 'rider@example.test',
          whatsapp_phone: '+919999999999',
          answers: [
            { requirement_id: '__live_selfie__', value: ['fixture-asset'] },
          ],
        },
        token(actor, role),
      ),
    );
    assert.equal(submission.response.status, 200);
    assert.equal(submission.body.status, 'success');
  }
  assert.deepEqual(actors, ['rider', 'rider', 'admin', 'admin']);
});

it('returns JSON envelopes, status codes, and unknown-route errors', async () => {
  assert.equal((await request('/api/v2/health')).body.status, 'success');
  const missing = await request('/api/v2/not-a-route');
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.error_code, 'NOT_FOUND');
  mock.method(app.get(VehicleCategoryService), 'create_category', async () => ({
    id: 'new-category',
  }));
  const created = await request(
    '/api/v2/admin/vehicle-categories',
    json(category, token('admin', 'ADMIN')),
  );
  assert.equal(created.response.status, 201);
  assert.deepEqual(created.body.data, { id: 'new-category' });
});
const category = {
  name: 'Fixture category',
  vehicle_type: 'SEDAN',
  capacity: 4,
  base_fare: 80,
  per_kilometer: 18,
  per_minute: 3,
  is_active: true,
};

it('records partner approval with its actor and completed outcome before returning success', async () => {
  mock.method(
    app.get(PartnerProgramService),
    'approve_application',
    async () => {
      assert.ok(
        [...activities.values()].some((row) =>
          String(row.path).endsWith(
            '/applications/application-fixture/approve',
          ),
        ),
      );
      return { status: 'APPROVED', version: 2 };
    },
  );
  const result = await request(
    '/api/v2/admin/partner-program/applications/application-fixture/approve',
    json({ version: 1, decision: 'APPROVED' }, token('admin', 'ADMIN')),
  );
  assert.equal(result.response.status, 200);
  const id = result.response.headers.get('x-request-id')!;
  const audit = activities.get(id)!;
  assert.equal(audit.actor_id, 'admin');
  assert.equal(audit.action, 'Approve partner application');
  assert.equal(audit.status_code, 200);
  assert.ok(audit.completed_at instanceof Date);
  assert.equal(activities.size, 1);
});

it('records guard and body-parser failures without storing tokens or query payloads', async () => {
  const denied = await request('/api/v1/admin/users', {
    headers: { Authorization: `Bearer ${token()}` },
  });
  assert.equal(denied.response.status, 403);
  assert.equal(
    activities.get(denied.response.headers.get('x-request-id')!)!.status_code,
    403,
  );
  const malformed = await request(
    '/api/V2/admin/vehicle-categories?private=do-not-store-query',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token('admin', 'ADMIN')}`,
      },
      body: '{"private":"do-not-store-body",',
    },
  );
  assert.equal(malformed.response.status, 400);
  assert.equal(
    activities.get(malformed.response.headers.get('x-request-id')!)!
      .status_code,
    400,
  );
  const stored = JSON.stringify([...activities.values()]);
  assert.equal(stored.includes('do-not-store'), false);
  assert.equal(stored.includes('Bearer'), false);
});

it('finishes a rejected approval with its actual failure outcome', async () => {
  mock.method(
    app.get(PartnerProgramService),
    'approve_application',
    async () => {
      throw new AppError(409, 'STALE_APPROVAL', 'Refresh this application.');
    },
  );
  const result = await request(
    '/api/v2/admin/partner-program/applications/application-fixture/approve',
    json({ version: 1, decision: 'APPROVED' }, token('admin', 'ADMIN')),
  );
  assert.equal(result.response.status, 409);
  const audit = activities.get(result.response.headers.get('x-request-id')!)!;
  assert.equal(audit.status_code, 409);
  assert.equal(audit.actor_id, 'admin');
  assert.ok(audit.completed_at instanceof Date);
});

it('checks current roles, suspension and browser-family revocation', async () => {
  const forged = await request('/api/v2/admin/vehicle-categories', {
    headers: { Authorization: `Bearer ${token('rider', 'ADMIN')}` },
  });
  assert.equal(forged.response.status, 403);
  const revoked = await request('/api/v2/rides', {
    headers: { Authorization: `Bearer ${token('rider', 'RIDER', 'revoked')}` },
  });
  assert.equal(revoked.body.error_code, 'INVALID_SESSION');
  users.set('suspended', { role: 'RIDER', status: 'SUSPENDED', sessions: [] });
  assert.equal(
    (
      await request('/api/v2/rides', {
        headers: { Authorization: `Bearer ${token('suspended')}` },
      })
    ).body.error_code,
    'USER_INACTIVE',
  );
});

it('records administrator browsing outside the admin route prefix as read activity', async () => {
  mock.method(app.get(RideService), 'get_rides', async () => []);
  const result = await request('/api/v2/rides', {
    headers: { Authorization: `Bearer ${token('admin', 'ADMIN')}` },
  });
  assert.equal(result.response.status, 200);
  const audit = activities.get(result.response.headers.get('x-request-id')!)!;
  assert.equal(audit.actor_id, 'admin');
  assert.equal(audit.method, 'GET');
  assert.equal(audit.action, 'View ride history');
  assert.equal(audit.status_code, 200);
  assert.ok(audit.completed_at instanceof Date);
});

it('rejects malformed JSON and unsupported charsets with client errors', async () => {
  const malformed = await request('/api/v2/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.response.status, 400);
  assert.equal(malformed.body.error_code, 'MALFORMED_JSON');
  const charset = await request('/api/v2/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=latin1' },
    body: '{}',
  });
  assert.equal(charset.response.status, 415);
  const compressed = await request('/api/v2/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
    body: '{}',
  });
  assert.equal(compressed.response.status, 400);
  assert.equal(compressed.body.error_code, 'INVALID_REQUEST_BODY');
});

it('keeps the larger image-body allowance on both versions and route casing', async () => {
  const large = 'x'.repeat(1100 * 1024);
  assert.equal(
    (await request('/api/v2/auth/google', json({ id_token: large }))).response
      .status,
    413,
  );
  for (const version of ['v1', 'v2', 'V2']) {
    const result = await request(
      `/api/${version}/admin/vehicle-categories`,
      json({ ...category, description: large }, token('admin', 'ADMIN')),
    );
    assert.equal(result.response.status, 422, version);
    const vehicle_upload = await request(
      `/api/${version}/driver/vehicle-verification/assets`,
      json({
        field_key: 'insurance',
        image_upload: { file_name: 'insurance.jpg', data_url: large },
      }),
    );
    assert.equal(
      vehicle_upload.response.status,
      422,
      `vehicle images on ${version}`,
    );
  }
});

it('rejects unbounded ride pagination before querying and accepts validated defaults', async () => {
  const query = mock.method(app.get(RideService), 'get_rides', async () => []);
  for (const input of [
    'page=999999999999999999999',
    'page_size=999999999999',
    'page=0',
    'page=1.5',
  ])
    assert.equal(
      (
        await request(`/api/v2/rides?${input}`, {
          headers: { Authorization: `Bearer ${token()}` },
        })
      ).response.status,
      422,
    );
  assert.equal(query.mock.callCount(), 0);
  assert.equal(
    (
      await request('/api/v2/rides', {
        headers: { Authorization: `Bearer ${token()}` },
      })
    ).response.status,
    200,
  );
  assert.deepEqual(query.mock.calls[0]?.arguments, ['rider', 1, 20]);
});

it('rejects blank coordinate queries before contacting geocoding providers', async () => {
  const reverse = mock.method(
    app.get(GeocodeService),
    'reverse_geocode',
    async () => ({ lat: '0', lon: '0', display_name: 'Origin' }),
  );
  const route = mock.method(
    app.get(GeocodeService),
    'driving_route',
    async () => ({
      distance_m: 1,
      duration_s: 1,
      geometry: [
        [0, 0],
        [1, 1],
      ],
    }),
  );
  for (const version of ['1', '2']) {
    for (const query of [
      'latitude=&longitude=0',
      'latitude=0&longitude=%20%20',
    ]) {
      assert.equal(
        (
          await request(`/api/v${version}/geocode/reverse?${query}`, {
            headers: { Authorization: `Bearer ${token()}` },
          })
        ).response.status,
        422,
      );
    }
    for (const key of [
      'from_latitude',
      'from_longitude',
      'to_latitude',
      'to_longitude',
    ]) {
      const query = new URLSearchParams({
        from_latitude: '0',
        from_longitude: '0',
        to_latitude: '1',
        to_longitude: '1',
        [key]: '',
      });
      assert.equal(
        (
          await request(`/api/v${version}/geocode/route?${query}`, {
            headers: { Authorization: `Bearer ${token()}` },
          })
        ).response.status,
        422,
      );
    }
  }
  assert.equal(reverse.mock.callCount(), 0);
  assert.equal(route.mock.callCount(), 0);
  assert.equal(
    (
      await request('/api/v2/geocode/reverse?latitude=0&longitude=0', {
        headers: { Authorization: `Bearer ${token()}` },
      })
    ).response.status,
    200,
  );
});

it('replays success across URI versions without repeating the mutation', async () => {
  const save = mock.method(
    app.get(SupportService),
    'open_support_ticket',
    async () => ({ id: 'ticket' }),
  );
  const payload = { subject: 'Help', body: 'A fixture message' };
  const options = json(payload, token(), { 'Idempotency-Key': 'replay-key' });
  const first = await request('/api/v2/support/tickets', options);
  const second = await request('/api/v1/support/tickets', options);
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 201);
  assert.deepEqual(first.body, second.body);
  assert.equal(save.mock.callCount(), 1);
  assert.equal(
    (
      await request(
        '/api/v2/support/tickets',
        json({ ...payload, body: 'Changed' }, token(), {
          'Idempotency-Key': 'replay-key',
        }),
      )
    ).body.error_code,
    'IDEMPOTENCY_CONFLICT',
  );
});

it('rejects concurrent duplicate claims and releases failed handlers for retry', async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  mock.method(app.get(SupportService), 'open_support_ticket', async () => {
    entered();
    await pending;
    return { id: 'once' };
  });
  const options = json({ subject: 'Help', body: 'Message' }, token(), {
    'Idempotency-Key': 'concurrent',
  });
  const first = request('/api/v2/support/tickets', options);
  await started;
  const duplicate = await request('/api/v2/support/tickets', options);
  finish();
  assert.equal(duplicate.body.error_code, 'IDEMPOTENCY_IN_PROGRESS');
  assert.equal((await first).response.status, 201);
  mock.restoreAll();
  mock.method(app.get(SupportService), 'open_support_ticket', async () => {
    throw new AppError(409, 'FIXTURE_FAILURE', 'Try again');
  });
  const retryOptions = json({ subject: 'Help', body: 'Message' }, token(), {
    'Idempotency-Key': 'retry',
  });
  assert.equal(
    (await request('/api/v2/support/tickets', retryOptions)).response.status,
    409,
  );
  mock.restoreAll();
  mock.method(app.get(SupportService), 'open_support_ticket', async () => ({
    id: 'retried',
  }));
  assert.equal(
    (await request('/api/v2/support/tickets', retryOptions)).response.status,
    201,
  );
});

it('shares duplicate-request protection across route casing, trailing slashes, and encoded parameters', async () => {
  const ticket = mock.method(
    app.get(SupportService),
    'open_support_ticket',
    async () => ({ id: 'ticket' }),
  );
  const options = json({ subject: 'Help', body: 'A message' }, token(), {
    'Idempotency-Key': 'canonical-route',
  });
  assert.equal(
    (await request('/api/v2/support/tickets', options)).response.status,
    201,
  );
  for (const path of ['/API/V2/SUPPORT/TICKETS/', '/api/v1/support/tickets/']) {
    assert.equal((await request(path, options)).response.status, 201);
  }
  assert.equal(ticket.mock.callCount(), 1);
  const cancel = mock.method(
    app.get(DriverOperationsService),
    'report_issue',
    async () => ({ id: 'CaseSensitiveRide' }),
  );
  const cancelOptions = json({ cancel_reason: 'Change of plans' }, token(), {
    'Idempotency-Key': 'canonical-parameter',
  });
  assert.equal(
    (await request('/api/v2/rides/CaseSensitiveRide/cancel', cancelOptions))
      .response.status,
    200,
  );
  assert.equal(
    (await request('/API/V1/RIDES/%43aseSensitiveRide/CANCEL/', cancelOptions))
      .response.status,
    200,
  );
  assert.equal(cancel.mock.callCount(), 1);
  assert.equal(cancel.mock.calls[0]?.arguments[1], 'CaseSensitiveRide');
  assert.equal(
    (await request('/api/v2/rides/casesensitiveride/cancel', cancelOptions))
      .response.status,
    200,
  );
  assert.equal(cancel.mock.callCount(), 2);
});

it('returns safe client errors for missing records, foreign-key conflicts, and transaction conflicts', async () => {
  for (const [code, status, expected] of [
    ['P2025', 404, 'NOT_FOUND'],
    ['P2003', 409, 'REFERENCE_CONFLICT'],
    ['P2034', 409, 'TRANSACTION_CONFLICT'],
    ['P1001', 503, 'DATABASE_UNAVAILABLE'],
    ['P1002', 503, 'DATABASE_UNAVAILABLE'],
    ['P1008', 503, 'DATABASE_UNAVAILABLE'],
    ['P1017', 503, 'DATABASE_UNAVAILABLE'],
    ['P2024', 503, 'DATABASE_BUSY'],
    ['P2028', 503, 'DATABASE_BUSY'],
    ['P2037', 503, 'DATABASE_BUSY'],
  ] as const) {
    mock.restoreAll();
    mock.method(app.get(RideService), 'get_rides', async () => {
      throw new Prisma.PrismaClientKnownRequestError(
        'Private SQL diagnostics',
        { code, clientVersion: '6.19.3' },
      );
    });
    const result = await request('/api/v2/rides', {
      headers: { Authorization: `Bearer ${token()}` },
    });
    assert.equal(result.response.status, status, code);
    assert.equal(result.body.error_code, expected);
    if (status === 503)
      assert.equal(result.response.headers.get('retry-after'), '3');
    assert.ok(!JSON.stringify(result.body).includes('Private SQL diagnostics'));
  }
});

it('returns a safe service-unavailable response when Prisma cannot initialize a connection', async () => {
  mock.method(app.get(RideService), 'get_rides', async () => {
    throw new Prisma.PrismaClientInitializationError(
      'Private connection diagnostics',
      '6.19.3',
      'P1001',
    );
  });
  const result = await request('/api/v2/rides', {
    headers: { Authorization: `Bearer ${token()}` },
  });
  assert.equal(result.response.status, 503);
  assert.equal(result.body.error_code, 'DATABASE_UNAVAILABLE');
  assert.equal(result.response.headers.get('retry-after'), '3');
  assert.ok(
    !JSON.stringify(result.body).includes('Private connection diagnostics'),
  );
});

it('verifies webhook signatures against exact raw bytes', async () => {
  const handler = mock.method(
    app.get(PaymentService),
    'process_payment_webhook',
    async () => ({ id: 'payment' }),
  );
  const raw = '{ "provider_payment_id": "fixture", "status": "CAPTURED" }';
  const signature = createHmac('sha256', config.PAYMENT_WEBHOOK_SECRET)
    .update(raw)
    .digest('hex');
  const valid = await request('/api/v2/payments/webhooks/fixture', {
    method: 'POST',
    body: raw,
    headers: {
      'Content-Type': 'application/json',
      'x-provider-signature': signature,
    },
  });
  assert.equal(valid.response.status, 200);
  assert.equal(handler.mock.callCount(), 1);
  const invalid = await request('/api/v1/payments/webhooks/fixture', {
    method: 'POST',
    body: raw.replaceAll(' ', ''),
    headers: {
      'Content-Type': 'application/json',
      'x-provider-signature': signature,
    },
  });
  assert.equal(invalid.response.status, 401);
  assert.equal(handler.mock.callCount(), 1);
});

it('uses the V2 cookie and clears it after an expired refresh', async () => {
  mock.method(app.get(AdminAuthService), 'refresh_admin', async () => ({
    refresh_token: 'next',
    access_token: 'access',
    expires_at: new Date(Date.now() + 60_000),
    user: {
      id: 'admin',
      role: 'ADMIN',
      first_name: 'Fixture',
      last_name: null,
      email: null,
      avatar_url: null,
    },
  }));
  const headers = {
    Origin: 'http://localhost:5173',
    Cookie: `${ADMIN_COOKIE}=old`,
  };
  const result = await request('/api/v2/admin/auth/refresh', {
    method: 'POST',
    headers,
  });
  assert.equal(result.response.status, 200);
  assert.match(
    result.response.headers.get('set-cookie') ?? '',
    new RegExp(`${ADMIN_COOKIE}=next;.*Path=/api;.*HttpOnly;.*SameSite=Strict`),
  );
  mock.restoreAll();
  mock.method(app.get(AdminAuthService), 'refresh_admin', async () => {
    throw new AppError(401, 'INVALID_SESSION', 'Expired');
  });
  const expired = await request('/api/v1/admin/auth/refresh', {
    method: 'POST',
    headers,
  });
  assert.equal(expired.response.status, 401);
  assert.match(
    expired.response.headers.get('set-cookie') ?? '',
    new RegExp(`${ADMIN_COOKIE}=;`),
  );
});

it('protects browser origins and rate-limits repeated administrator sign-in', async () => {
  assert.equal(
    (await request('/api/v2/admin/auth/refresh', { method: 'POST' })).body
      .error_code,
    'ORIGIN_NOT_ALLOWED',
  );
  for (let attempt = 0; attempt < 16; attempt++) {
    const result = await request(
      '/api/v2/admin/auth/google',
      json({}, token(), { Origin: 'http://localhost:5173' }),
    );
    assert.equal(result.response.status, attempt < 15 ? 422 : 429);
  }
  assert.ok(app.get(AdminSignInGuard));
});

it('successful counts polls avoid audit writes while failures and role denials remain audited', async () => {
  const service = app.get(PendingService);
  mock.method(service, 'counts', async () => ({ total: 0 }) as never);
  const ok = await request('/api/v2/admin/pending-counts', {
    headers: { Authorization: 'Bearer ' + token('admin', 'ADMIN') },
  });
  assert.equal(ok.response.status, 200);
  assert.equal(activities.size, 0);
  const denied = await request('/api/v2/admin/pending-counts', {
    headers: { Authorization: 'Bearer ' + token('rider', 'RIDER') },
  });
  assert.equal(denied.response.status, 403);
  assert.equal(activities.size, 1);
  const invalid = await request('/api/v2/admin/pending-counts?user_ids=a,,b', {
    headers: { Authorization: 'Bearer ' + token('admin', 'ADMIN') },
  });
  assert.equal(invalid.response.status, 422);
  assert.equal(activities.size, 2);
});

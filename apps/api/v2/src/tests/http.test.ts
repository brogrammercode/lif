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
    create: async () => ({ id: randomUUID() }),
    update: async () => ({}),
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
});
after(async () => {
  if (app) await app.close();
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
  assert.equal(routes.length, 127);
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
    app.get(RideService),
    'cancel_user_ride',
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

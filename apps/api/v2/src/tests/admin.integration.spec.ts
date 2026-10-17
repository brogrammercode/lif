import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it, mock } from 'node:test';
import sharp from 'sharp';
import { AdminAuthRepository } from '../features/admin_auth/admin_auth.repo.js';
import { CloudinaryService } from '../infra/media/cloudinary.js';
import type { AddressInfo } from 'node:net';
import { randomUUID, createHmac } from 'node:crypto';
import { create_application } from '../bootstrap.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '../infra/database/prisma.service.js';
import { ADMIN_COOKIE } from '../features/admin_auth/admin_auth.constant.js';
import { prisma } from '../infra/database/client.js';
import { create_access_token } from '../infra/security/token.js';
import {
  create_refresh_token,
  create_token_hash,
} from '../infra/security/hash.js';
import { RideRepository } from '../features/ride/ride.repo.js';
const { create_quote, request_ride } = new RideRepository(new PrismaService());
import { config } from '../core/config.js';
import { AuthRepository } from '../features/auth/auth.repo.js';
import { OAuth2Client } from 'google-auth-library';
const { resolve_external_user } = new AuthRepository(new PrismaService());

describe(
  'admin auth and vehicle catalog integration',
  { skip: process.env.LIF_RUN_DB_TESTS !== '1', timeout: 600_000 },
  () => {
    let app: NestExpressApplication;
    let base: string;
    let admin_id: string;
    let rider_id: string;
    let driver_id: string;
    let admin_token: string;
    let rider_token: string;
    let driver_token: string;
    const category_ids: string[] = [];
    const ride_ids: string[] = [];
    const extra_user_ids: string[] = [];
    const origin = config.ADMIN_WEB_ORIGIN.split(',')[0]!.trim();
    const prefix = `admin-integration-${randomUUID()}`;
    const input = {
      name: prefix,
      description: 'Integration fixture',
      image_url: '',
      parent_id: null as string | null,
      vehicle_type: 'SEDAN' as const,
      capacity: 4,
      base_fare: 80,
      per_kilometer: 18,
      per_minute: 3,
      is_active: true,
      sort_order: 99999,
    };
    const request = async (
      path: string,
      token?: string,
      method = 'GET',
      data?: unknown,
      headers: Record<string, string> = {},
    ) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      const body = (await response.json()) as {
        data: any;
        error_code?: string;
      };
      if (
        response.status === 403 &&
        token === admin_token &&
        body.error_code === 'ADMIN_ACCESS_DENIED'
      ) {
        const actor = await prisma.user.findUnique({
          where: { id: admin_id },
          select: { role: true, status: true },
        });
        console.warn({
          integration_permission_failure: {
            path,
            method,
            actor,
            request_id: response.headers.get('x-request-id'),
          },
        });
      }
      return {
        response,
        body,
      };
    };
    before(async () => {
      assert.match(
        new URL(config.DB_STRING).pathname,
        /test/i,
        'Integration checks must use a test database',
      );
      const admin = await prisma.user.create({
        data: { email: `${prefix}-admin@example.test`, role: 'ADMIN' },
      });
      admin_id = admin.id;
      const rider = await prisma.user.create({
        data: { email: `${prefix}-rider@example.test` },
      });
      rider_id = rider.id;
      const driver = await prisma.user.create({
        data: { email: `${prefix}-driver@example.test`, role: 'DRIVER' },
      });
      driver_id = driver.id;
      await prisma.driverProfile.create({
        data: { user_id: driver.id, license_number: prefix },
      });
      admin_token = create_access_token({ user_id: admin.id, role: 'ADMIN' });
      rider_token = create_access_token({ user_id: rider.id, role: 'RIDER' });
      driver_token = create_access_token({
        user_id: driver.id,
        role: 'DRIVER',
      });
      app = await create_application({ logger: false });
      app.useLogger(false);
      await app.listen(0, '127.0.0.1');
      base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v2`;
    });
    after(async () => {
      if (app) await app.close();
      const user_ids = [
        admin_id,
        rider_id,
        driver_id,
        ...extra_user_ids,
      ].filter(Boolean);
      if (user_ids.length) {
        await prisma.$transaction(
          async (tx) => {
            const payments = await tx.payment.findMany({
              where: { ride_id: { in: ride_ids } },
              select: { id: true },
            });
            await tx.payment.deleteMany({
              where: { ride_id: { in: ride_ids } },
            });
            await tx.supportTicket.deleteMany({
              where: { user_id: { in: user_ids } },
            });
            await tx.ride.deleteMany({ where: { id: { in: ride_ids } } });
            await tx.vehicle.deleteMany({
              where: { driver: { user_id: { in: user_ids } } },
            });
            await tx.userLog.deleteMany({
              where: {
                OR: [
                  { actor_id: { in: user_ids } },
                  {
                    entity_type: 'Payment',
                    entity_id: { in: payments.map((payment) => payment.id) },
                  },
                ],
              },
            });
            await tx.user.deleteMany({ where: { id: { in: user_ids } } });
            await tx.vehicleCategory.deleteMany({
              where: { id: { in: category_ids }, parent_id: { not: null } },
            });
            await tx.vehicleCategory.deleteMany({
              where: { id: { in: category_ids } },
            });
          },
          { timeout: 30_000 },
        );
      }
      await prisma.$disconnect();
    });
    afterEach(() => mock.restoreAll());

    it('issues and refreshes a browser session through verified Google login on both API prefixes', async () => {
      const email = `${prefix}-browser-login@example.test`;
      const granted = await request(
        '/admin/access/1more-admin',
        admin_token,
        'POST',
        { email },
      );
      assert.equal(granted.response.status, 200);
      const id = granted.body.data.admin.id as string;
      extra_user_ids.push(id);
      mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({
        getPayload: () => ({
          sub: `${prefix}-browser-google`,
          email_verified: true,
          email,
          name: 'Browser Admin',
        }),
      }));
      for (const version of ['v1', 'v2']) {
        const browserBase = base.replace('/api/v2', `/api/${version}`);
        const login = await fetch(`${browserBase}/admin/auth/google`, {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_token: 'verified-google-fixture-token' }),
        });
        assert.equal(login.status, 200);
        const loginBody = (await login.json()) as {
          data: {
            access_token: string;
            user: { id: string; first_name: string };
          };
        };
        assert.equal(loginBody.data.user.id, id);
        assert.equal(loginBody.data.user.first_name, 'Browser');
        assert.ok(loginBody.data.access_token);
        assert.equal(login.headers.get('cache-control'), 'no-store');
        const cookie = login.headers.get('set-cookie') ?? '';
        assert.ok(cookie.startsWith(`${ADMIN_COOKIE}=`));
        assert.ok(
          cookie.includes('HttpOnly') &&
            cookie.includes('SameSite=Strict') &&
            cookie.includes('Path=/api'),
        );
        const refreshed = await fetch(`${browserBase}/admin/auth/refresh`, {
          method: 'POST',
          headers: { Origin: origin, Cookie: cookie.split(';')[0]! },
        });
        assert.equal(refreshed.status, 200);
        const refreshBody = (await refreshed.json()) as {
          data: { user: { id: string } };
        };
        assert.equal(refreshBody.data.user.id, id);
        const rotatedCookie = (refreshed.headers.get('set-cookie') ?? '').split(
          ';',
        )[0]!;
        const logout = await fetch(`${browserBase}/admin/auth/logout`, {
          method: 'POST',
          headers: { Origin: origin, Cookie: rotatedCookie },
        });
        assert.equal(logout.status, 200);
        const ended = await fetch(`${browserBase}/admin/auth/refresh`, {
          method: 'POST',
          headers: { Origin: origin, Cookie: rotatedCookie },
        });
        assert.equal(ended.status, 401);
      }
      assert.equal(
        await prisma.authAccount.count({
          where: { user_id: id, provider: 'GOOGLE' },
        }),
        1,
      );
    });

    it('maintains driver rating counts and rounded averages across concurrent reviews', async () => {
      const user = await prisma.user.create({
        data: {
          email: `${prefix}-rating-driver@example.test`,
          role: 'DRIVER',
          driver_profile: { create: {} },
        },
        include: { driver_profile: true },
      });
      extra_user_ids.push(user.id);
      const rides = await prisma.ride.createManyAndReturn({
        data: [1, 2, 3].map(() => ({
          rider_id,
          driver_id: user.driver_profile!.id,
          status: 'COMPLETED' as const,
          pickup_address: prefix,
          pickup_latitude: 12.9,
          pickup_longitude: 77.5,
          dropoff_address: 'Dropoff',
          dropoff_latitude: 12.91,
          dropoff_longitude: 77.51,
        })),
      });
      ride_ids.push(...rides.map((ride) => ride.id));
      const review = (id: string, score: number) =>
        request(`/rides/${id}/reviews`, rider_token, 'POST', {
          reviewee_id: user.id,
          score,
        });
      const initial = await Promise.all([
        review(rides[0]!.id, 2),
        review(rides[1]!.id, 4),
      ]);
      assert.ok(initial.every((result) => result.response.status === 201));
      const current = await prisma.driverProfile.findUniqueOrThrow({
        where: { user_id: user.id },
      });
      assert.equal(current.ratings_count, 2);
      assert.equal(current.rating_average.toNumber(), 3);
      assert.equal((await review(rides[2]!.id, 5)).response.status, 201);
      assert.equal((await review(rides[0]!.id, 2)).response.status, 409);
      const updated = await prisma.driverProfile.findUniqueOrThrow({
        where: { user_id: user.id },
      });
      assert.equal(updated.ratings_count, 3);
      assert.equal(updated.rating_average.toNumber(), 3.67);
      const audit = await prisma.userLog.findFirst({
        where: {
          entity_type: 'Review',
          actor_id: rider_id,
          after_data: { path: ['reviewee_id'], equals: user.id },
        },
        orderBy: { created_at: 'desc' },
      });
      assert.ok(audit);
      assert.equal(
        (audit.after_data as { driver_rating: { ratings_count: number } })
          .driver_rating.ratings_count,
        3,
      );
    });

    it('preserves privileged roles when creating driver profiles and promotes riders only', async () => {
      for (const role of ['ADMIN', 'SUPPORT', 'RIDER'] as const) {
        const user = await prisma.user.create({
          data: {
            email: `${prefix}-${role.toLowerCase()}-driver@example.test`,
            role,
          },
        });
        extra_user_ids.push(user.id);
        const token = create_access_token({ user_id: user.id, role });
        const result = await request('/driver/profile', token, 'POST', {
          license_number: `${prefix}-${role}`,
        });
        assert.equal(result.response.status, 201);
        const expected = role === 'RIDER' ? 'DRIVER' : role;
        assert.equal(result.body.data.user.role, expected);
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
            .role,
          expected,
        );
        if (role === 'ADMIN')
          assert.equal(
            (await request('/admin/vehicle-categories', token)).response.status,
            200,
          );
        assert.equal(
          (
            await request('/driver/profile', token, 'POST', {
              license_number: `${prefix}-${role}`,
            })
          ).response.status,
          409,
        );
      }
    });

    it('keeps rejected drivers offline after completion or cancellation, including concurrent verification changes', async () => {
      const user = await prisma.user.create({
        data: {
          email: `${prefix}-transition-driver@example.test`,
          role: 'DRIVER',
          driver_profile: {
            create: {
              verification_status: 'VERIFIED',
              availability: 'AVAILABLE',
            },
          },
        },
        include: { driver_profile: true },
      });
      extra_user_ids.push(user.id);
      const profile = user.driver_profile!;
      const token = create_access_token({ user_id: user.id, role: 'DRIVER' });
      const verificationPath = `/admin/drivers/${profile.id}/verification`;
      const rejected = await request(verificationPath, admin_token, 'PATCH', {
        status: 'REJECTED',
      });
      assert.equal(rejected.response.status, 200);
      assert.equal(rejected.body.data.availability, 'OFFLINE');
      assert.equal(rejected.body.data.verified_at, null);
      for (const mode of [
        'revoked-first',
        'concurrent',
        'cancel-concurrent',
        'verified',
      ] as const) {
        await prisma.driverProfile.update({
          where: { id: profile.id },
          data: {
            verification_status: 'VERIFIED',
            availability: mode === 'cancel-concurrent' ? 'EN_ROUTE' : 'ON_TRIP',
          },
        });
        const ride = await prisma.ride.create({
          data: {
            rider_id,
            driver_id: profile.id,
            status:
              mode === 'cancel-concurrent' ? 'DRIVER_ASSIGNED' : 'IN_PROGRESS',
            pickup_address: prefix,
            pickup_latitude: 12.9,
            pickup_longitude: 77.5,
            dropoff_address: 'Dropoff',
            dropoff_latitude: 12.91,
            dropoff_longitude: 77.51,
            estimated_fare: 104,
            estimated_distance_m: 1000,
            estimated_duration_s: 120,
          },
        });
        ride_ids.push(ride.id);
        const finish = () =>
          mode === 'cancel-concurrent'
            ? request(
                `/rides/${ride.id}/cancel`,
                rider_token,
                'POST',
                { cancel_reason: 'Change of plans' },
                { 'Idempotency-Key': randomUUID() },
              )
            : request(`/driver/rides/${ride.id}/complete`, token, 'POST');
        if (mode === 'revoked-first') {
          const result = await request(verificationPath, admin_token, 'PATCH', {
            status: 'REJECTED',
          });
          assert.equal(result.response.status, 200);
          assert.equal(result.body.data.availability, 'ON_TRIP');
          assert.equal((await finish()).response.status, 200);
        } else if (mode === 'concurrent' || mode === 'cancel-concurrent') {
          const results = await Promise.all([
            request(verificationPath, admin_token, 'PATCH', {
              status: 'REJECTED',
            }),
            finish(),
          ]);
          assert.ok(results.every((result) => result.response.status === 200));
        } else assert.equal((await finish()).response.status, 200);
        const current = await prisma.driverProfile.findUniqueOrThrow({
          where: { id: profile.id },
        });
        assert.equal(
          current.availability,
          mode === 'verified' ? 'AVAILABLE' : 'OFFLINE',
        );
        const stored = await prisma.ride.findUniqueOrThrow({
          where: { id: ride.id },
        });
        assert.equal(
          stored.status,
          mode === 'cancel-concurrent' ? 'CANCELLED' : 'COMPLETED',
        );
        if (mode !== 'cancel-concurrent')
          assert.equal(stored.final_fare?.toNumber(), 104);
        assert.equal((await finish()).response.status, 409);
      }
      assert.equal(
        (
          await prisma.driverProfile.findUniqueOrThrow({
            where: { id: profile.id },
          })
        ).completed_rides,
        3,
      );
    });

    it('returns success and not-found for concurrent deletion of the same owned contact', async () => {
      const created = await request(
        '/emergency-contacts',
        rider_token,
        'POST',
        { name: prefix, phone_e164: '+19995550123' },
      );
      assert.equal(created.response.status, 201);
      const results = await Promise.all([
        request(
          `/emergency-contacts/${created.body.data.id}`,
          rider_token,
          'DELETE',
        ),
        request(
          `/emergency-contacts/${created.body.data.id}`,
          rider_token,
          'DELETE',
        ),
      ]);
      assert.deepEqual(
        results.map((result) => result.response.status).sort(),
        [200, 404],
      );
      assert.equal(
        await prisma.userLog.count({
          where: {
            entity_id: created.body.data.id,
            action: 'DELETE_EMERGENCY_CONTACT',
          },
        }),
        1,
      );
    });

    it('generates timestamp IDs for upsert and bulk-return creation', async () => {
      const created = await prisma.user.upsert({
        where: { email: `${prefix}-upsert@example.test` },
        update: {},
        create: { email: `${prefix}-upsert@example.test` },
      });
      extra_user_ids.push(created.id);
      assert.match(created.id, /^\d{13,}$/);
      const unchanged = await prisma.user.upsert({
        where: { id: created.id },
        update: { first_name: 'Updated' },
        create: { email: `${prefix}-unused@example.test` },
      });
      assert.equal(unchanged.id, created.id);
      const bulk = await prisma.user.createManyAndReturn({
        data: [
          { email: `${prefix}-bulk1@example.test` },
          { email: `${prefix}-bulk2@example.test` },
        ],
      });
      extra_user_ids.push(...bulk.map((value) => value.id));
      assert.ok(bulk.every((value) => /^\d{13,}$/.test(value.id)));
      const updated = await prisma.user.update({
        where: { id: created.id },
        data: {
          sessions: {
            create: {
              refresh_token_hash: create_token_hash(randomUUID()),
              expires_at: new Date(Date.now() + 60_000),
            },
          },
        },
        include: { sessions: true },
      });
      assert.match(updated.sessions[0]!.id, /^\d{13,}$/);
    });

    it('persists driver location with an audit record and rejects missing driver profiles', async () => {
      const location = {
        latitude: 12.9,
        longitude: 77.5,
        heading: 45,
        speed_kph: 10,
      };
      const result = await request(
        '/driver/location',
        driver_token,
        'POST',
        location,
      );
      assert.equal(result.response.status, 200);
      const stored = await prisma.driverProfile.findUniqueOrThrow({
        where: { user_id: driver_id },
      });
      assert.equal(stored.current_latitude?.toNumber(), location.latitude);
      assert.equal(stored.current_longitude?.toNumber(), location.longitude);
      assert.ok(stored.last_location_at);
      assert.ok(
        await prisma.userLog.findFirst({
          where: {
            actor_id: driver_id,
            entity_id: stored.id,
            action: 'UPDATE_DRIVER_LOCATION',
          },
        }),
      );
      assert.equal(
        (await request('/driver/location', rider_token, 'POST', location)).body
          .error_code,
        'DRIVER_PROFILE_NOT_FOUND',
      );
      assert.equal(
        await prisma.userLog.count({
          where: { actor_id: rider_id, action: 'UPDATE_DRIVER_LOCATION' },
        }),
        0,
      );
    });

    it('persists personal edits, rejects stale/duplicate data, and preserves them on later Google logins', async () => {
      const actor = await prisma.user.findUniqueOrThrow({
        where: { id: admin_id },
      });
      const identity = {
        provider_account_id: `${prefix}-google`,
        provider_email: actor.email!,
        first_name: 'Provider name',
        last_name: 'Provider surname',
        avatar_url: 'https://example.test/provider.png',
      };
      await resolve_external_user('GOOGLE', identity);
      const before = await request(`/admin/users/${admin_id}`, admin_token);
      const personal = {
        first_name: 'Edited administrator',
        last_name: null,
        phone_e164: null,
        avatar_url: null,
        expected_updated_at: before.body.data.updated_at,
      };
      const saved = await request(
        `/admin/users/${admin_id}`,
        admin_token,
        'PATCH',
        personal,
      );
      assert.equal(saved.response.status, 200);
      assert.equal(saved.body.data.first_name, personal.first_name);
      assert.equal(
        (
          await request(
            `/admin/users/${admin_id}`,
            admin_token,
            'PATCH',
            personal,
          )
        ).body.error_code,
        'USER_CONFLICT',
      );
      const mobileLogin = await resolve_external_user('GOOGLE', identity);
      assert.equal(mobileLogin.first_name, personal.first_name);
      assert.equal(mobileLogin.avatar_url, null);
      const webLogin = await new AdminAuthRepository(
        new PrismaService(),
      ).create_admin_session(identity, {});
      assert.equal(webLogin.user.first_name, personal.first_name);
      assert.equal(webLogin.user.last_name, null);
      assert.equal(webLogin.user.avatar_url, null);
      const phone = `+1999${Date.now().toString().slice(-8)}`;
      await prisma.user.update({
        where: { id: rider_id },
        data: { phone_e164: phone },
      });
      const latest = await request(`/admin/users/${admin_id}`, admin_token);
      const duplicate = await request(
        `/admin/users/${admin_id}`,
        admin_token,
        'PATCH',
        {
          ...personal,
          phone_e164: phone,
          expected_updated_at: latest.body.data.updated_at,
        },
      );
      assert.equal(duplicate.body.error_code, 'USER_PHONE_EXISTS');
      const log = await prisma.userLog.findFirst({
        where: {
          actor_id: admin_id,
          entity_id: admin_id,
          action: 'ADMIN_UPDATE_PERSONAL_DETAILS',
        },
      });
      assert.ok(log);
    });

    it('saves converted images through the real personal-details transaction and cleans up stale uploads', async () => {
      const calls: string[] = [];
      mock.method(
        app.get(CloudinaryService),
        'cloudinary_request',
        async (
          action: 'upload' | 'destroy',
          params: Record<string, string>,
          file?: string,
        ) => {
          calls.push(action);
          if (action === 'destroy') return { result: 'ok' };
          assert.ok(file?.startsWith('data:image/webp;base64,'));
          return {
            public_id: params.public_id,
            secure_url: 'https://example.test/converted.webp',
            format: 'webp',
            width: 4,
            height: 4,
            bytes: 100,
          };
        },
      );
      const bytes = await sharp({
        create: { width: 4, height: 4, channels: 4, background: '#ffaa00' },
      })
        .png()
        .toBuffer();
      const before = await request(`/admin/users/${admin_id}`, admin_token);
      const body = {
        first_name: 'Edited administrator',
        last_name: null,
        phone_e164: null,
        avatar_url: null,
        expected_updated_at: before.body.data.updated_at,
        image_upload: {
          file_name: 'image.png',
          data_url: `data:image/png;base64,${bytes.toString('base64')}`,
        },
      };
      const saved = await request(
        `/admin/users/${admin_id}`,
        admin_token,
        'PATCH',
        body,
      );
      assert.equal(saved.response.status, 200);
      assert.equal(
        saved.body.data.avatar_url,
        'https://example.test/converted.webp',
      );
      const stale = await request(
        `/admin/users/${admin_id}`,
        admin_token,
        'PATCH',
        body,
      );
      assert.equal(stale.body.error_code, 'USER_CONFLICT');
      assert.deepEqual(calls, ['upload', 'upload', 'destroy']);
      const log = await prisma.userLog.findFirst({
        where: {
          actor_id: admin_id,
          entity_id: admin_id,
          action: 'ADMIN_UPDATE_PERSONAL_DETAILS',
        },
        orderBy: { created_at: 'desc' },
      });
      assert.ok(log);
      assert.ok(!JSON.stringify(log).includes('data:image'));
    });

    it('enforces current admin role, including forged token roles and revoked access', async () => {
      assert.equal(
        (await request('/admin/vehicle-categories')).response.status,
        401,
      );
      assert.equal(
        (await request('/admin/vehicle-categories', rider_token)).response
          .status,
        403,
      );
      const forged = create_access_token({ user_id: rider_id, role: 'ADMIN' });
      assert.equal(
        (await request('/admin/vehicle-categories', forged)).response.status,
        403,
      );
      assert.equal(
        (await request('/admin/vehicle-categories', admin_token)).response
          .status,
        200,
      );
      await prisma.user.update({
        where: { id: admin_id },
        data: { status: 'SUSPENDED' },
      });
      try {
        assert.equal(
          (await request('/admin/vehicle-categories', admin_token)).response
            .status,
          403,
        );
      } finally {
        await prisma.user.update({
          where: { id: admin_id },
          data: { status: 'ACTIVE' },
        });
      }
    });

    it('protects refresh by origin and rotates a refresh token only once', async () => {
      assert.equal(
        (await request('/admin/auth/refresh', undefined, 'POST')).response
          .status,
        403,
      );
      assert.equal(
        (
          await request('/admin/auth/refresh', undefined, 'POST', undefined, {
            Origin: origin,
          })
        ).response.status,
        401,
      );
      const refresh_token = create_refresh_token();
      await prisma.session.create({
        data: {
          user_id: admin_id,
          refresh_token_hash: create_token_hash(refresh_token),
          family_id: randomUUID(),
          user_agent: '[admin] integration',
          expires_at: new Date(Date.now() + 60_000),
        },
      });
      const headers = {
        Origin: origin,
        Cookie: `${ADMIN_COOKIE}=${refresh_token}`,
      };
      const results = await Promise.all([
        request('/admin/auth/refresh', undefined, 'POST', undefined, headers),
        request('/admin/auth/refresh', undefined, 'POST', undefined, headers),
      ]);
      assert.deepEqual(
        results.map((result) => result.response.status).sort(),
        [200, 401],
      );
      const successful = results.find(
        (result) => result.response.status === 200,
      )!;
      assert.equal(successful.body.data.user.role, 'ADMIN');
      assert.equal(successful.body.data.refresh_token, undefined);
      const cookie = successful.response.headers.get('set-cookie')!;
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Strict/);
      assert.match(cookie, /Path=\/api(?:;|$)/);
      assert.equal(
        (await request('/admin/auth/me', successful.body.data.access_token))
          .response.status,
        200,
      );
      const logout = await request(
        '/admin/auth/logout',
        undefined,
        'POST',
        undefined,
        { Origin: origin, Cookie: `${ADMIN_COOKIE}=${refresh_token}` },
      );
      assert.equal(logout.response.status, 200);
      assert.equal(
        (await request('/rides', successful.body.data.access_token)).response
          .status,
        401,
      );
      assert.equal(
        (await request('/admin/auth/me', successful.body.data.access_token))
          .response.status,
        401,
      );
      assert.equal(
        (
          await request('/admin/auth/refresh', undefined, 'POST', undefined, {
            Origin: origin,
            Cookie: cookie.split(';')[0]!,
          })
        ).response.status,
        401,
      );
    });

    it('serializes logout against refresh and keeps browser sessions out of mobile refresh', async () => {
      const token = create_refresh_token();
      const family_id = randomUUID();
      await prisma.session.create({
        data: {
          user_id: admin_id,
          refresh_token_hash: create_token_hash(token),
          family_id,
          user_agent: '[admin] integration',
          expires_at: new Date(Date.now() + 60_000),
        },
      });
      assert.equal(
        (
          await request('/auth/refresh', undefined, 'POST', {
            refresh_token: token,
          })
        ).response.status,
        401,
      );
      const headers = { Origin: origin, Cookie: `${ADMIN_COOKIE}=${token}` };
      const [refresh, logout] = await Promise.all([
        request('/admin/auth/refresh', undefined, 'POST', undefined, headers),
        request('/admin/auth/logout', undefined, 'POST', undefined, headers),
      ]);
      assert.equal(logout.response.status, 200);
      assert.ok([200, 401].includes(refresh.response.status));
      assert.equal(
        await prisma.session.count({ where: { family_id, revoked_at: null } }),
        0,
      );
      if (refresh.response.status === 200)
        assert.equal(
          (
            await request(
              '/admin/vehicle-categories',
              refresh.body.data.access_token,
            )
          ).response.status,
          401,
        );
    });

    it('rejects malformed JSON and isolates cached requests by account', async () => {
      const malformed = await fetch(`${base}/admin/vehicle-categories`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${admin_token}`,
          'Content-Type': 'application/json',
        },
        body: '{broken',
      });
      assert.equal(malformed.status, 400);
      assert.equal((await malformed.json()).error_code, 'MALFORMED_JSON');
      assert.ok(malformed.headers.get('x-request-id'));
      const key = randomUUID();
      const payload = {
        draft_ride_id: `${prefix}-missing`,
        quote_id: `${prefix}-missing-quote`,
      };
      const cached = { status: 'success', data: { private: true } };
      await prisma.idempotencyKey.create({
        data: {
          user_id: admin_id,
          scope: `${admin_id}:POST:/api/v1/rides`,
          key,
          request_hash: (await import('node:crypto'))
            .createHash('sha256')
            .update(JSON.stringify(payload))
            .digest('hex'),
          response_json: cached,
          status_code: 201,
          expires_at: new Date(Date.now() + 60_000),
        },
      });
      const other = await request('/rides', rider_token, 'POST', payload, {
        'Idempotency-Key': key,
      });
      assert.equal(other.response.status, 404);
      assert.notEqual(other.body.data?.private, true);
      const own = await request('/rides', admin_token, 'POST', payload, {
        'Idempotency-Key': key,
      });
      assert.equal(own.response.status, 201);
      assert.equal(own.body.data.private, true);
    });

    it('rotates mobile refresh tokens atomically and rejects suspended accounts', async () => {
      const token = create_refresh_token();
      await prisma.session.create({
        data: {
          user_id: rider_id,
          refresh_token_hash: create_token_hash(token),
          expires_at: new Date(Date.now() + 60_000),
        },
      });
      const attempts = await Promise.all([
        request('/auth/refresh', undefined, 'POST', { refresh_token: token }),
        request('/auth/refresh', undefined, 'POST', { refresh_token: token }),
      ]);
      assert.deepEqual(
        attempts.map((item) => item.response.status).sort(),
        [200, 401],
      );
      const rotated = attempts.find((item) => item.response.status === 200)!
        .body.data.refresh_token;
      await prisma.user.update({
        where: { id: rider_id },
        data: { status: 'SUSPENDED' },
      });
      try {
        for (const path of ['/vehicle-categories', '/auth/me', '/rides']) {
          assert.equal((await request(path, rider_token)).response.status, 403);
        }
        assert.equal(
          (
            await request('/auth/refresh', undefined, 'POST', {
              refresh_token: rotated,
            })
          ).response.status,
          401,
        );
      } finally {
        await prisma.user.update({
          where: { id: rider_id },
          data: { status: 'ACTIVE' },
        });
      }
      const logout = await request('/auth/logout', undefined, 'POST', {
        refresh_token: rotated,
      });
      assert.equal(logout.response.status, 200);
      assert.equal(
        (
          await request('/auth/refresh', undefined, 'POST', {
            refresh_token: rotated,
          })
        ).response.status,
        401,
      );
    });

    it('binds a provisioned account once and serializes duplicate identity logins', async () => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: admin_id },
      });
      const identity = {
        provider_account_id: `${prefix}-google`,
        provider_email: user.email!,
        first_name: 'Integration',
      };
      const users = await Promise.all([
        resolve_external_user('GOOGLE', identity),
        resolve_external_user('GOOGLE', identity),
      ]);
      assert.ok(
        users.every((value) => value.id === admin_id && value.role === 'ADMIN'),
      );
      assert.equal(
        await prisma.authAccount.count({
          where: { user_id: admin_id, provider: 'GOOGLE' },
        }),
        1,
      );
      await assert.rejects(
        resolve_external_user('GOOGLE', {
          ...identity,
          provider_account_id: `${prefix}-other-google`,
        }),
        (error: unknown) =>
          error instanceof Error &&
          'error_code' in error &&
          error.error_code === 'IDENTITY_CONFLICT',
      );
    });

    it('checks support and review ownership and preserves settled payments', async () => {
      const ride = await prisma.ride.create({
        data: {
          rider_id,
          driver_id: (
            await prisma.driverProfile.findUniqueOrThrow({
              where: { user_id: driver_id },
            })
          ).id,
          status: 'COMPLETED',
          pickup_address: 'Review test pickup',
          dropoff_address: 'Review test destination',
          pickup_latitude: 12.9,
          pickup_longitude: 77.5,
          dropoff_latitude: 12.91,
          dropoff_longitude: 77.51,
          final_fare: 100,
        },
      });
      ride_ids.push(ride.id);
      assert.equal(
        (
          await request(
            '/support/tickets',
            admin_token,
            'POST',
            {
              ride_id: ride.id,
              subject: 'Other account ride',
              body: 'This must be rejected',
            },
            { 'Idempotency-Key': randomUUID() },
          )
        ).response.status,
        404,
      );
      assert.equal(
        (
          await request(
            '/support/tickets',
            rider_token,
            'POST',
            { ride_id: ride.id, subject: 'My ride', body: 'Owner request' },
            { 'Idempotency-Key': randomUUID() },
          )
        ).response.status,
        201,
      );
      assert.equal(
        (
          await request(`/rides/${ride.id}/reviews`, rider_token, 'POST', {
            reviewee_id: admin_id,
            score: 5,
          })
        ).response.status,
        422,
      );
      assert.equal(
        (
          await request(`/rides/${ride.id}/reviews`, rider_token, 'POST', {
            reviewee_id: driver_id,
            score: 5,
          })
        ).response.status,
        201,
      );
      const methods = await Promise.all([
        request('/me/payment-methods/setup', rider_token, 'POST', {
          type: 'CASH',
          is_default: true,
        }),
        request('/me/payment-methods/setup', rider_token, 'POST', {
          type: 'CASH',
          is_default: true,
        }),
      ]);
      assert.ok(methods.every((value) => value.response.status === 201));
      assert.equal(
        await prisma.paymentMethod.count({
          where: { user_id: rider_id, is_default: true },
        }),
        1,
      );
      const checkout = await request(
        '/payments/checkout',
        rider_token,
        'POST',
        { ride_id: ride.id, payment_method_id: methods[0]!.body.data.id },
        { 'Idempotency-Key': randomUUID() },
      );
      assert.equal(checkout.response.status, 201);
      const provider_payment_id = `${prefix}-payment`;
      const webhook = async (
        status: string,
        amount = 100,
        include_ride = true,
      ) => {
        const raw = JSON.stringify(
          {
            ...(include_ride ? { ride_id: ride.id } : {}),
            provider_payment_id,
            status,
            amount,
          },
          null,
          2,
        );
        const response = await fetch(`${base}/payments/webhooks/integration`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-provider-signature': createHmac(
              'sha256',
              config.PAYMENT_WEBHOOK_SECRET,
            )
              .update(raw)
              .digest('hex'),
          },
          body: raw,
        });
        return {
          response,
          body: (await response.json()) as { data: { status: string } },
        };
      };
      assert.equal((await webhook('PENDING')).response.status, 200);
      const pending = await prisma.payment.findUniqueOrThrow({
        where: { ride_id: ride.id },
      });
      assert.equal(pending.provider_payment_id, provider_payment_id);
      assert.equal(pending.provider, 'integration');
      assert.equal((await webhook('CAPTURED', 1, false)).response.status, 422);
      assert.equal(
        (await webhook('CAPTURED', 100, false)).response.status,
        200,
      );
      const captured = await prisma.payment.findUniqueOrThrow({
        where: { ride_id: ride.id },
      });
      assert.equal(
        (await webhook('CAPTURED', 100, false)).response.status,
        200,
      );
      assert.equal(
        (
          await prisma.payment.findUniqueOrThrow({
            where: { ride_id: ride.id },
          })
        ).paid_at?.toISOString(),
        captured.paid_at?.toISOString(),
      );
      assert.equal(
        await prisma.rideEvent.count({
          where: { ride_id: ride.id, event_type: 'PAYMENT_CAPTURED' },
        }),
        1,
      );
      const retry = await request(
        '/payments/checkout',
        rider_token,
        'POST',
        { ride_id: ride.id, payment_method_id: methods[1]!.body.data.id },
        { 'Idempotency-Key': randomUUID() },
      );
      assert.equal(retry.body.data.status, 'CAPTURED');
      assert.equal((await webhook('PENDING')).body.data.status, 'CAPTURED');
      const current_default = await prisma.paymentMethod.findFirstOrThrow({
        where: { user_id: rider_id, is_default: true },
      });
      assert.equal(
        (
          await request(
            `/me/payment-methods/${current_default.id}`,
            rider_token,
            'DELETE',
          )
        ).response.status,
        200,
      );
      assert.equal(
        await prisma.paymentMethod.count({
          where: { user_id: rider_id, is_default: true },
        }),
        1,
      );
    });

    it('validates hierarchy, stale edits, disabled ancestors, driver selection and quote snapshots', async () => {
      const parent_result = await request(
        '/admin/vehicle-categories',
        admin_token,
        'POST',
        input,
      );
      assert.equal(parent_result.response.status, 201);
      const parent = parent_result.body.data;
      category_ids.push(parent.id);
      const child_result = await request(
        '/admin/vehicle-categories',
        admin_token,
        'POST',
        { ...input, parent_id: parent.id, name: `${prefix}-child` },
      );
      assert.equal(child_result.response.status, 201);
      const child = child_result.body.data;
      category_ids.push(child.id);
      assert.equal(
        (
          await request('/admin/vehicle-categories', admin_token, 'POST', {
            ...input,
            parent_id: child.id,
          })
        ).response.status,
        422,
      );
      assert.equal(
        (
          await request(
            `/admin/vehicle-categories/${parent.id}`,
            admin_token,
            'PATCH',
            {
              ...input,
              parent_id: child.id,
              expected_updated_at: parent.updated_at,
            },
          )
        ).response.status,
        422,
      );
      const edited = await request(
        `/admin/vehicle-categories/${child.id}`,
        admin_token,
        'PATCH',
        {
          ...input,
          name: `${prefix}-edited`,
          parent_id: parent.id,
          expected_updated_at: child.updated_at,
        },
      );
      assert.equal(edited.response.status, 200);
      assert.equal(
        (
          await request(
            `/admin/vehicle-categories/${child.id}`,
            admin_token,
            'PATCH',
            {
              ...input,
              parent_id: parent.id,
              expected_updated_at: child.updated_at,
            },
          )
        ).response.status,
        409,
      );
      const disabled = await request(
        `/admin/vehicle-categories/${parent.id}`,
        admin_token,
        'PATCH',
        { ...input, is_active: false, expected_updated_at: parent.updated_at },
      );
      assert.equal(disabled.response.status, 200);
      const catalog = await request('/vehicle-categories', rider_token);
      for (const category of catalog.body.data) {
        assert.equal(category._count, undefined);
        assert.equal(category.parent, undefined);
      }
      assert.equal(
        catalog.body.data.some(
          (record: { id: string }) => record.id === child.id,
        ),
        false,
      );
      const registration = {
        make: 'Test',
        model: 'Vehicle',
        plate_number: prefix,
        vehicle_category_id: child.id,
      };
      assert.equal(
        (
          await request('/driver/vehicles', driver_token, 'POST', {
            ...registration,
            plate_number: prefix.slice(0, 25),
          })
        ).response.status,
        422,
      );
      assert.equal(
        (
          await request(
            `/admin/vehicle-categories/${parent.id}`,
            admin_token,
            'PATCH',
            {
              ...input,
              is_active: true,
              expected_updated_at: disabled.body.data.updated_at,
            },
          )
        ).response.status,
        200,
      );
      assert.equal(
        (
          await request('/driver/vehicles', driver_token, 'POST', {
            ...registration,
            plate_number: prefix.slice(0, 25),
            type: 'BIKE',
          })
        ).response.status,
        422,
      );
      const vehicle_result = await request(
        '/driver/vehicles',
        driver_token,
        'POST',
        { ...registration, plate_number: prefix.slice(0, 25) },
      );
      assert.equal(vehicle_result.response.status, 201);
      assert.equal(vehicle_result.body.data.vehicle_category_id, child.id);
      assert.equal(
        (await request('/driver/profile', driver_token)).body.data
          .active_vehicle_id,
        vehicle_result.body.data.id,
      );
      assert.equal(
        (
          await request(
            `/driver/vehicles/${vehicle_result.body.data.id}/active`,
            driver_token,
            'PATCH',
          )
        ).response.status,
        409,
      );
      assert.equal(
        (
          await request('/driver/vehicles', driver_token, 'POST', {
            ...registration,
            plate_number: prefix.slice(0, 25),
          })
        ).response.status,
        409,
      );
      assert.equal(
        (
          await request(
            `/driver/vehicles/${vehicle_result.body.data.id}/category`,
            rider_token,
            'PATCH',
            { vehicle_category_id: child.id },
          )
        ).response.status,
        404,
      );
      assert.equal(
        (
          await request('/driver/vehicles', driver_token, 'POST', {
            ...registration,
            plate_number: `${prefix.slice(0, 22)}par`,
            vehicle_category_id: parent.id,
          })
        ).response.status,
        422,
      );
      const quote = await create_quote(
        rider_id,
        {
          pickup: { address: 'Pickup', latitude: 12.9, longitude: 77.5 },
          dropoff: { address: 'Dropoff', latitude: 12.91, longitude: 77.51 },
        },
        [
          {
            vehicle_type: 'SEDAN',
            vehicle_category_id: child.id,
            category_snapshot: {
              name: 'Original name',
              capacity: 4,
              image_url: null,
            },
            distance_m: 1000,
            duration_s: 120,
            pickup_eta_s: 240,
            base_fare: 80,
            distance_fare: 18,
            time_fare: 6,
            total_fare: 104,
          },
        ],
        new Date(Date.now() + 300_000),
        [
          [77.5, 12.9],
          [77.51, 12.91],
        ],
      );
      ride_ids.push(quote.id);
      assert.match(quote.id, /^\d{13,}$/);
      assert.match(quote.route!.id, /^\d{13,}$/);
      assert.ok(quote.quotes.every((value) => /^\d{13,}$/.test(value.id)));
      assert.equal(
        (quote.quotes[0]!.category_snapshot as { name: string }).name,
        'Original name',
      );
      assert.equal(quote.quotes[0]!.total_fare.toNumber(), 104);
      assert.equal(
        (
          await request(
            `/admin/vehicle-categories/${child.id}`,
            admin_token,
            'PATCH',
            {
              ...input,
              parent_id: parent.id,
              vehicle_type: 'BIKE',
              expected_updated_at: edited.body.data.updated_at,
            },
          )
        ).response.status,
        409,
      );
      const changed = await request(
        `/admin/vehicle-categories/${child.id}`,
        admin_token,
        'PATCH',
        {
          ...input,
          name: `${prefix}-new-name`,
          parent_id: parent.id,
          base_fare: 120,
          expected_updated_at: edited.body.data.updated_at,
        },
      );
      assert.equal(changed.response.status, 200);
      const historical = await prisma.fareQuote.findUniqueOrThrow({
        where: { id: quote.quotes[0]!.id },
      });
      assert.equal(
        (historical.category_snapshot as { name: string }).name,
        'Original name',
      );
      assert.equal(historical.total_fare.toNumber(), 104);
      const requested = await Promise.all([
        request_ride(rider_id, {
          draft_ride_id: quote.id,
          quote_id: historical.id,
        }),
        request_ride(rider_id, {
          draft_ride_id: quote.id,
          quote_id: historical.id,
        }),
      ]);
      assert.deepEqual(requested.map((item) => item.kind).sort(), [
        'invalid_state',
        'success',
      ]);
      assert.equal(
        await prisma.rideEvent.count({
          where: { ride_id: quote.id, event_type: 'SEARCH_STARTED' },
        }),
        1,
      );
      const profile = await prisma.driverProfile.update({
        where: { user_id: driver_id },
        data: {
          verification_status: 'VERIFIED',
          availability: 'AVAILABLE',
          active_vehicle_id: vehicle_result.body.data.id,
        },
      });
      await prisma.vehicle.update({
        where: { id: vehicle_result.body.data.id },
        data: { status: 'ACTIVE' },
      });
      assert.equal(
        (
          await request(
            `/driver/vehicles/${vehicle_result.body.data.id}/active`,
            rider_token,
            'PATCH',
          )
        ).response.status,
        404,
      );
      assert.equal(
        (
          await request(
            `/driver/vehicles/${vehicle_result.body.data.id}/active`,
            driver_token,
            'PATCH',
          )
        ).response.status,
        200,
      );
      const sibling_result = await request(
        '/admin/vehicle-categories',
        admin_token,
        'POST',
        { ...input, name: `${prefix}-sibling`, parent_id: parent.id },
      );
      assert.equal(sibling_result.response.status, 201);
      category_ids.push(sibling_result.body.data.id);
      assert.equal(
        (
          await request(
            `/driver/vehicles/${vehicle_result.body.data.id}/category`,
            driver_token,
            'PATCH',
            { vehicle_category_id: sibling_result.body.data.id },
          )
        ).response.status,
        200,
      );
      const offer_payload = { driver_id: profile.id, expires_in_minutes: 2 };
      assert.equal(
        (
          await request(
            `/admin/rides/${quote.id}/offers`,
            admin_token,
            'POST',
            offer_payload,
          )
        ).response.status,
        409,
      );
      assert.equal(
        (
          await request(
            `/driver/vehicles/${vehicle_result.body.data.id}/category`,
            driver_token,
            'PATCH',
            { vehicle_category_id: child.id },
          )
        ).response.status,
        200,
      );
      await prisma.fareQuote.update({
        where: { id: historical.id },
        data: {
          category_snapshot: { name: 'Six seats promised', capacity: 6 },
        },
      });
      assert.equal(
        (
          await request(
            `/admin/rides/${quote.id}/offers`,
            admin_token,
            'POST',
            offer_payload,
          )
        ).response.status,
        409,
      );
      await prisma.fareQuote.update({
        where: { id: historical.id },
        data: { category_snapshot: historical.category_snapshot! },
      });
      const offer = await request(
        `/admin/rides/${quote.id}/offers`,
        admin_token,
        'POST',
        offer_payload,
      );
      assert.equal(offer.response.status, 201);
      const other_draft = await create_quote(
        rider_id,
        {
          pickup: { address: 'Other pickup', latitude: 12.9, longitude: 77.5 },
          dropoff: {
            address: 'Other dropoff',
            latitude: 12.91,
            longitude: 77.51,
          },
        },
        [
          {
            vehicle_type: 'SEDAN',
            vehicle_category_id: child.id,
            category_snapshot: { name: 'Concurrent ride', capacity: 4 },
            distance_m: 1000,
            duration_s: 120,
            pickup_eta_s: 240,
            base_fare: 120,
            distance_fare: 18,
            time_fare: 6,
            total_fare: 144,
          },
        ],
        new Date(Date.now() + 300_000),
        [
          [77.5, 12.9],
          [77.51, 12.91],
        ],
      );
      ride_ids.push(other_draft.id);
      assert.equal(
        (
          await request_ride(rider_id, {
            draft_ride_id: other_draft.id,
            quote_id: other_draft.quotes[0]!.id,
          })
        ).kind,
        'success',
      );
      const other_offer = await request(
        `/admin/rides/${other_draft.id}/offers`,
        admin_token,
        'POST',
        offer_payload,
      );
      assert.equal(other_offer.response.status, 201);
      const accepted = await Promise.all([
        request(
          `/driver/offers/${offer.body.data.id}/accept`,
          driver_token,
          'POST',
        ),
        request(
          `/driver/offers/${other_offer.body.data.id}/accept`,
          driver_token,
          'POST',
        ),
      ]);
      assert.deepEqual(
        accepted.map((item) => item.response.status).sort(),
        [200, 409],
      );
      const assigned_ride = accepted.find(
        (item) => item.response.status === 200,
      )!.body.data.ride_id;
      const accepted_offer =
        assigned_ride === quote.id
          ? offer.body.data.id
          : other_offer.body.data.id;
      assert.equal(
        (
          await request(
            `/driver/vehicles/${vehicle_result.body.data.id}/category`,
            driver_token,
            'PATCH',
            { vehicle_category_id: sibling_result.body.data.id },
          )
        ).response.status,
        409,
      );
      assert.equal(
        (
          await request(
            `/driver/vehicles/${vehicle_result.body.data.id}/active`,
            driver_token,
            'PATCH',
          )
        ).response.status,
        409,
      );
      assert.equal(
        (
          await request('/driver/availability', driver_token, 'PATCH', {
            availability: 'AVAILABLE',
          })
        ).response.status,
        409,
      );
      assert.equal(
        (
          await request(
            `/driver/offers/${accepted_offer}/reject`,
            driver_token,
            'POST',
          )
        ).response.status,
        409,
      );
      const cancelled = await request(
        `/rides/${assigned_ride}/cancel`,
        rider_token,
        'POST',
        { cancel_reason: 'Integration cleanup' },
        { 'Idempotency-Key': randomUUID() },
      );
      assert.equal(cancelled.response.status, 200);
      assert.equal(
        (
          await prisma.driverProfile.findUniqueOrThrow({
            where: { id: profile.id },
          })
        ).availability,
        'AVAILABLE',
      );
    });
  },
);

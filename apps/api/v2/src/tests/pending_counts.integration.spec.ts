import assert from 'node:assert/strict';
import { it } from 'node:test';
import { PrismaService } from '../infra/database/prisma.service.js';
import { PendingService } from '../features/admin_pending/pending.service.js';
import { pending_application_page } from '../features/admin_pending/pending.list.js';
import type { AppPrismaClient } from '../infra/database/client.js';
import { config } from '../core/config.js';

// Opt-in: npm exec -- tsx --test src/tests/pending_counts.integration.spec.ts
// Every fixture and the cache live in connection-local temporary tables. The
// namespace assertion runs before any seed/cache write, and ON COMMIT DROP
// removes them on completion. Public business tables are never mutated.
it('PostgreSQL counts and drill-downs agree across review, email and activation lifecycles', async () => {
  assert.ok(
    config.NODE_ENV !== 'production' &&
      /test|scratch|sandbox/i.test(new URL(config.DB_STRING).pathname),
    'Use a test database.',
  );
  const database = new PrismaService();
  try {
    await database.client.$transaction(
      async (tx) => {
        const definitions: Record<string, string> = {
          users:
            'id text, role text, status text, deleted_at timestamptz, partner_activated_at timestamptz, first_name text, last_name text',
          driver_profiles: 'id text, user_id text',
          vehicles:
            "id text, driver_id text, status text, verification_fields jsonb DEFAULT '[]'",
          vehicle_brands: 'id text,status text',
          vehicle_models: 'id text,status text',
          partner_applications:
            'id text,user_id text,status text,activation_attempts int DEFAULT 0,contact_email text,whatsapp_phone text,submitted_at timestamptz DEFAULT NOW()',
          partner_application_fields:
            'application_id text,status text,value jsonb',
          partner_deliveries:
            'application_id text,channel text,status text,updated_at timestamptz DEFAULT NOW()',
          notifications:
            'channel text,sent_at timestamptz,data jsonb,updated_at timestamptz DEFAULT NOW()',
          partner_exit_requests: 'id text,application_id text,status text',
          ride_settlement_reviews: 'status text',
          admin_pending_snapshots:
            'key text PRIMARY KEY,payload jsonb,expires_at timestamptz',
        };
        for (const [name, columns] of Object.entries(definitions))
          await tx.$executeRawUnsafe(
            `CREATE TEMP TABLE ${name} (${columns}) ON COMMIT DROP`,
          );
        for (const name of Object.keys(definitions)) {
          const [row] = await tx.$queryRaw<
            { safe: boolean }[]
          >`SELECT relnamespace=pg_my_temp_schema() AS safe FROM pg_class WHERE oid=to_regclass(${name})`;
          assert.equal(
            row?.safe,
            true,
            `The ${name} fixture must be connection-local.`,
          );
        }
        await tx.$executeRawUnsafe(`INSERT INTO users(id,role,status,partner_activated_at) VALUES
    ('driver','DRIVER','ACTIVE',NULL),('staff','ADMIN','ACTIVE',NOW()),('deleted','DRIVER','DELETED',NULL)`);
        await tx.$executeRawUnsafe(
          `INSERT INTO driver_profiles VALUES ('d','driver'),('s','staff'),('x','deleted')`,
        );
        await tx.$executeRawUnsafe(`INSERT INTO vehicles VALUES
    ('v1','d','UNDER_REVIEW','[]'),('v2','d','REJECTED','[{"status":"PENDING"}]'),
    ('v3','d','REJECTED','[{"status":"REJECTED"}]'),('v4','s','UNDER_REVIEW','[]'),('v5','x','UNDER_REVIEW','[]')`);
        await tx.$executeRawUnsafe(
          `INSERT INTO vehicle_brands VALUES ('b1','REQUESTED'),('b2','REQUESTED'),('b3','VERIFIED')`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO vehicle_models VALUES ('m1','REQUESTED'),('m2','REJECTED')`,
        );
        await tx.$executeRawUnsafe(`INSERT INTO partner_applications(id,user_id,status,activation_attempts) VALUES
    ('submitted','u1','SUBMITTED',0),('corrections','u2','CHANGES_REQUESTED',0),('pending-field','u3','CHANGES_REQUESTED',0),
    ('confirmation','u4','CONFIRMATION_SUBMITTED',0),('locked','u5','COMPLETED',5),('waiting','u6','APPROVED',0),
    ('failed-notice','u7','APPROVED',0),('active','u8','ACTIVATED',0),('exit-failed','u9','EXITED',0),
    ('exit-requested','u10','ACTIVATED',0),('deleted-app','deleted','SUBMITTED',0)`);
        await tx.$executeRawUnsafe(
          `INSERT INTO users(id,role,status) SELECT user_id,'RIDER','ACTIVE' FROM partner_applications WHERE user_id <> 'deleted'`,
        );
        await tx.$executeRawUnsafe(`INSERT INTO partner_application_fields VALUES
    ('submitted','PENDING','null'),('corrections','REJECTED','"fix me"'),('pending-field','PENDING','"provided"'),('pending-field','PENDING','[]')`);
        await tx.$executeRawUnsafe(`INSERT INTO partner_deliveries(application_id,channel,status) VALUES
    ('locked','EMAIL','FAILED'),('locked','ACTIVATION_EMAIL','FAILED'),('exit-failed','EXIT_EMAIL','FAILED')`);
        await tx.$executeRawUnsafe(
          `INSERT INTO partner_exit_requests VALUES ('e1','exit-failed','COMPLETED'),('e2','exit-requested','REQUESTED')`,
        );
        await tx.$executeRawUnsafe(`INSERT INTO notifications(channel,data) VALUES
    ('EMAIL','{"kind":"ADMIN_NEW_USER_EMAIL","state":"FAILED"}'),('EMAIL','{"kind":"ADMIN_NEW_USER_EMAIL","state":"FAILED"}'),
    ('EMAIL','{"application_id":"failed-notice","state":"FAILED","expected_status":"APPROVED"}'),
    ('EMAIL','{"application_id":"failed-notice","state":"FAILED","expected_status":"APPROVED"}'),
    ('EMAIL','{"application_id":"waiting","state":"FAILED","expected_status":"SUBMITTED"}')`);
        await tx.$executeRawUnsafe(
          `INSERT INTO ride_settlement_reviews VALUES ('REQUESTED'),('DISPUTED'),('APPROVED'),('WAIVED'),('SETTLED')`,
        );
        const client = {
          $queryRaw: tx.$queryRaw.bind(tx),
          $transaction: async (work: (value: typeof tx) => unknown) => work(tx),
        } as unknown as AppPrismaClient;
        const service = new PendingService({ client } as PrismaService);
        const counts = await service.counts({
          user_ids: ['driver', 'staff'],
          application_ids: ['pending-field', 'locked'],
        });
        assert.equal(counts.total, 18);
        assert.deepEqual(counts.sections, {
          app: 6,
          users: 3,
          partner_program: 7,
          admin: 2,
          support: 0,
        });
        assert.equal(counts.tabs.applications, 3);
        assert.equal(counts.tabs.confirmations, 2);
        assert.equal(counts.tabs.exit_requests, 2);
        assert.equal(counts.entities.users.driver?.vehicle_verification, 2);
        assert.equal(counts.entities.users.staff?.vehicle_verification, 1);
        assert.equal(counts.entities.applications['pending-field']?.fields, 1);
        assert.equal(counts.entities.applications.locked?.confirmations, 1);
        const applications = await pending_application_page(client, {
          section: 'applications',
          query: '',
          status: 'all',
          page: 99,
        });
        assert.equal(applications.page, 1);
        assert.equal(applications.total, counts.tabs.applications);
        assert.deepEqual(applications.ids.sort(), [
          'failed-notice',
          'pending-field',
          'submitted',
        ]);
        const confirmations = await pending_application_page(client, {
          section: 'confirmations',
          query: '',
          status: 'all',
          page: 1,
        });
        assert.equal(confirmations.total, counts.tabs.confirmations);
        assert.deepEqual(confirmations.ids.sort(), ['confirmation', 'locked']);
        // The shared snapshot is reused until a committed mutation invalidates it.
        await tx.$executeRawUnsafe(
          `UPDATE ride_settlement_reviews SET status='SETTLED'`,
        );
        assert.equal(
          (await service.counts({ user_ids: [], application_ids: [] })).tabs
            .ride_reviews,
          3,
        );
        await tx.$executeRawUnsafe(`DELETE FROM admin_pending_snapshots`);
        assert.equal(
          (await service.counts({ user_ids: [], application_ids: [] })).tabs
            .ride_reviews,
          0,
        );
      },
      { maxWait: 10000, timeout: 60000 },
    );
  } finally {
    await database.client.$disconnect();
  }
});

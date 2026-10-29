import assert from 'node:assert/strict';
import { it } from 'node:test';
import { PrismaService } from '../infra/database/prisma.service.js';
import {
  AuditRetentionService,
  audit_cutoff,
} from '../core/audit_retention.service.js';
import { config } from '../core/config.js';

// Opt-in; every deletion targets connection-local temporary tables. Namespace
// checks happen before any fixture insertion or cleanup call.
it('PostgreSQL prunes both audit stores at the seven-day boundary and preserves newer rows', async () => {
  assert.ok(
    config.NODE_ENV !== 'production' &&
      /test|scratch|sandbox/i.test(new URL(config.DB_STRING).pathname),
    'Use a test database.',
  );
  const database = new PrismaService();
  const now = new Date('2026-10-29T12:00:00Z');
  const cutoff = audit_cutoff(now);
  try {
    await database.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`CREATE TEMP TABLE admin_activity (id text PRIMARY KEY, started_at timestamptz NOT NULL) ON COMMIT DROP`;
        await tx.$executeRaw`CREATE TEMP TABLE user_logs (id text PRIMARY KEY, created_at timestamptz NOT NULL) ON COMMIT DROP`;
        for (const name of ['admin_activity', 'user_logs']) {
          const [row] = await tx.$queryRaw<
            { safe: boolean }[]
          >`SELECT relnamespace=pg_my_temp_schema() AS safe FROM pg_class WHERE oid=to_regclass(${name})`;
          assert.equal(row?.safe, true, 'Cleanup fixtures must be temporary.');
        }
        const expired = new Date(cutoff.getTime() - 1),
          retained = new Date(cutoff.getTime() + 1);
        await tx.$executeRaw`INSERT INTO admin_activity VALUES ('old',${expired}), ('boundary',${cutoff}), ('new',${retained})`;
        await tx.$executeRaw`INSERT INTO user_logs VALUES ('old',${expired}), ('boundary',${cutoff}), ('new',${retained})`;
        const isolated = {
          client: {
            $transaction: (work: (client: typeof tx) => unknown) => work(tx),
          },
        } as unknown as PrismaService;
        assert.deepEqual(
          await new AuditRetentionService(isolated).prune(1, now),
          { admin_activity: 2, user_logs: 2, has_more: false },
        );
        assert.deepEqual(
          await tx.$queryRaw`SELECT id FROM admin_activity ORDER BY id`,
          [{ id: 'new' }],
        );
        assert.deepEqual(
          await tx.$queryRaw`SELECT id FROM user_logs ORDER BY id`,
          [{ id: 'new' }],
        );
      },
      { maxWait: 10000, timeout: 30000 },
    );
  } finally {
    await database.client.$disconnect();
  }
});

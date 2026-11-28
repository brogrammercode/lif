import pg from 'pg';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { NestFactory } from '@nestjs/core';
import {
  AuditRetentionService,
  audit_cutoff,
} from '../core/audit_retention.service.js';
import { config } from '../core/config.js';
import { DatabaseModule } from '../database/database.module.js';
import {
  PostgresService,
  type SqlClient,
} from '../database/postgres.service.js';

it(
  'PostgreSQL prunes both audit stores at the seven-day boundary and preserves newer rows',
  { skip: process.env.LIF_RUN_SQL_PILOT !== '1' },
  async () => {
    const url = new URL(config.DB_STRING);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.pathname, '/lif_migration_test');
    const context = await NestFactory.createApplicationContext(DatabaseModule, {
      logger: false,
    });
    const database = context.get(PostgresService);
    const now = new Date('2026-10-29T12:00:00Z');
    const cutoff = audit_cutoff(now);
    try {
      await database.transaction(async (tx) => {
        const databaseName = await tx.query<{ name: string }>(
          'SELECT current_database() AS name',
        );
        assert.equal(databaseName.rows[0]?.name, 'lif_migration_test');
        await tx.query(
          'CREATE TEMP TABLE admin_activity (id text PRIMARY KEY, started_at timestamptz NOT NULL) ON COMMIT DROP',
        );
        await tx.query(
          'CREATE TEMP TABLE user_logs (id text PRIMARY KEY, created_at timestamptz NOT NULL) ON COMMIT DROP',
        );
        for (const name of ['admin_activity', 'user_logs']) {
          const result = await tx.query<{ safe: boolean }>(
            'SELECT relnamespace=pg_my_temp_schema() AS safe FROM pg_class WHERE oid=to_regclass($1)',
            [name],
          );
          assert.equal(
            result.rows[0]?.safe,
            true,
            'Cleanup fixtures must be temporary.',
          );
        }
        const expired = new Date(cutoff.getTime() - 1);
        const retained = new Date(cutoff.getTime() + 1);
        await tx.query(
          "INSERT INTO admin_activity VALUES ('old',$1), ('boundary',$2), ('new',$3)",
          [expired, cutoff, retained],
        );
        await tx.query(
          "INSERT INTO user_logs VALUES ('old',$1), ('boundary',$2), ('new',$3)",
          [expired, cutoff, retained],
        );
        const isolated = {
          transaction: (work: (client: SqlClient) => unknown) => work(tx),
        } as unknown as PostgresService;
        assert.deepEqual(
          await new AuditRetentionService(isolated).prune(1, now),
          { admin_activity: 2, user_logs: 2, has_more: false },
        );
        assert.deepEqual(
          (await tx.query('SELECT id FROM admin_activity ORDER BY id')).rows,
          [{ id: 'new' }],
        );
        assert.deepEqual(
          (await tx.query('SELECT id FROM user_logs ORDER BY id')).rows,
          [{ id: 'new' }],
        );
      });
      // Exercise the connection-acquisition deadline while the one-client pool
      // is occupied. The late checkout must release the client for the next job.
      const quotaDatabase = new PostgresService(
        new pg.Pool({
          connectionString: url.toString(),
          max: 1,
          connectionTimeoutMillis: 2000,
        }),
      );
      try {
        await quotaDatabase.transaction(async () => {
          await assert.rejects(
            new AuditRetentionService(quotaDatabase).prune(1, now),
            {
              error_code: 'DATABASE_BUSY',
            },
          );
        });
        assert.equal((await quotaDatabase.query('SELECT 1')).rowCount, 1);
      } finally {
        await quotaDatabase.onModuleDestroy();
      }
    } finally {
      await context.close();
    }
  },
);

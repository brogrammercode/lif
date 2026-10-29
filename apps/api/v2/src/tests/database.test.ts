import assert from 'node:assert/strict';
import { it } from 'node:test';
import { database_connection_url } from '../infra/database/connection_url.js';
import { transaction_with_connection_retry } from '../infra/database/transaction_retry.js';
import type {
  AppPrismaClient,
  TransactionClient,
} from '../infra/database/client.js';

it('allows time for a remote PostgreSQL connection while preserving connection settings', () => {
  const input =
    'postgresql://fixture:fixture%40secret@localhost:5432/api_unit_test?sslmode=require&schema=public';
  const url = new URL(database_connection_url(input));
  assert.equal(url.searchParams.get('connect_timeout'), '15');
  assert.equal(url.searchParams.get('pool_timeout'), '30');
  assert.equal(url.searchParams.get('sslmode'), 'require');
  assert.equal(url.searchParams.get('schema'), 'public');
  assert.equal(url.username, 'fixture');
  assert.equal(url.password, 'fixture%40secret');
});

it('bounds each serverless pool while keeping explicit operator settings and local pools', () => {
  const input = 'postgresql://fixture:password@localhost/api_unit_test';
  const hosted = new URL(database_connection_url(input, { serverless: true }));
  assert.equal(hosted.searchParams.get('connection_limit'), '5');
  const local = new URL(database_connection_url(input, { serverless: false }));
  assert.equal(local.searchParams.get('connection_limit'), null);
  const custom = new URL(
    database_connection_url(
      input + '?connection_limit=2&pool_timeout=0&connect_timeout=25',
      { serverless: true },
    ),
  );
  assert.equal(custom.searchParams.get('connection_limit'), '2');
  assert.equal(custom.searchParams.get('pool_timeout'), '0');
  assert.equal(custom.searchParams.get('connect_timeout'), '25');
});

it('recovers one failed transaction acquisition, including Prisma initialization errors, before running writes once', async () => {
  for (const failure of [
    { code: 'P2024' },
    { errorCode: 'P2024' },
    { code: 'P2028' },
  ]) {
    let attempts = 0,
      writes = 0;
    const database = {
      $transaction: async (
        work: (tx: TransactionClient) => Promise<string>,
        options: Record<string, unknown>,
      ) => {
        assert.equal(options.maxWait, 30000);
        assert.equal(options.timeout, 12000);
        if (++attempts === 1) throw failure;
        return work({} as TransactionClient);
      },
    } as unknown as AppPrismaClient;
    const result = await transaction_with_connection_retry(
      database,
      async () => {
        writes++;
        return 'saved';
      },
      { timeout: 12000 },
    );
    assert.equal(result, 'saved');
    assert.equal(attempts, 2);
    assert.equal(writes, 1);
  }
});

it('does not replay an entered transaction or a lost commit acknowledgement', async () => {
  for (const afterCommit of [false, true]) {
    let attempts = 0,
      writes = 0;
    const error = { code: 'P2024' };
    const database = {
      $transaction: async (work: (tx: TransactionClient) => Promise<void>) => {
        attempts++;
        await work({} as TransactionClient);
        throw error;
      },
    } as unknown as AppPrismaClient;
    await assert.rejects(
      transaction_with_connection_retry(database, async () => {
        writes++;
        if (!afterCommit) throw error;
      }),
      (caught) => caught === error,
    );
    assert.equal(attempts, 1);
    assert.equal(writes, 1);
  }
});

it('bounds acquisition retries and preserves unrelated database errors', async () => {
  for (const code of ['P2024', 'P1000', 'P2002', 'P1001']) {
    let attempts = 0;
    const error = { code };
    const database = {
      $transaction: async () => {
        attempts++;
        throw error;
      },
    } as unknown as AppPrismaClient;
    await assert.rejects(
      transaction_with_connection_retry(database, async () => {}),
      (caught) => caught === error,
    );
    assert.equal(attempts, code === 'P2024' ? 2 : 1);
  }
});

it('respects an explicit database connection timeout', () => {
  const url = database_connection_url(
    'postgresql://localhost/api_unit_test?connect_timeout=30&pool_timeout=20',
  );
  assert.equal(new URL(url).searchParams.get('connect_timeout'), '30');
  assert.equal(new URL(url).searchParams.get('pool_timeout'), '20');
});

it('leaves other Prisma connection protocols unchanged', () => {
  const url = 'prisma://localhost/?api_key=fixture';
  assert.equal(database_connection_url(url), url);
});

it('does not expose a malformed connection string in startup errors', () => {
  assert.throws(
    () => database_connection_url('fixture-private-invalid-connection'),
    (error) =>
      error instanceof Error &&
      !error.message.includes('fixture-private-invalid-connection') &&
      !('input' in error),
  );
});

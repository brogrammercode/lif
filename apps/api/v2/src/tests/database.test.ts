import assert from 'node:assert/strict';
import { it } from 'node:test';
import { database_connection_url } from '../infra/database/connection_url.js';

it('allows time for a remote PostgreSQL connection while preserving connection settings', () => {
  const input =
    'postgresql://fixture:fixture%40secret@localhost:5432/api_unit_test?sslmode=require&schema=public';
  const url = new URL(database_connection_url(input));
  assert.equal(url.searchParams.get('connect_timeout'), '15');
  assert.equal(url.searchParams.get('sslmode'), 'require');
  assert.equal(url.searchParams.get('schema'), 'public');
  assert.equal(url.username, 'fixture');
  assert.equal(url.password, 'fixture%40secret');
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

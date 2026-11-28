import assert from 'node:assert/strict';
import { it } from 'node:test';
import { prepare_entity_data } from '../../prisma/entity_id.js';

it('assigns timestamp IDs to nested quote/route creates without changing JSON payloads', () => {
  const json = { create: { note: 'This is JSON, not a Prisma relation.' } };
  const data: Record<string, unknown> = {
    rider_id: 'rider',
    route: { create: { route_data: json } },
    quotes: { create: [{ base_fare: 1 }, { base_fare: 2 }] },
  };
  prepare_entity_data('Ride', data, true);
  const route = data.route as { create: { id: string; route_data: unknown } };
  const quotes = data.quotes as { create: { id: string }[] };
  const ids = [
    data.id,
    route.create.id,
    ...quotes.create.map((value) => value.id),
  ];
  assert.ok(ids.every((id) => typeof id === 'string' && /^\d{13,}$/.test(id)));
  assert.equal(new Set(ids).size, 4);
  assert.deepEqual(route.create.route_data, json);
  assert.equal('id' in json.create, false);
});

it('prepares nested update/upsert/connectOrCreate branches and preserves explicit IDs', () => {
  const data = {
    id: 'existing',
    sessions: {
      createMany: { data: [{ refresh_token_hash: 'hash' }] },
      upsert: {
        where: { id: 'session' },
        create: { refresh_token_hash: 'new' },
        update: {},
      },
      connectOrCreate: { where: { id: 'linked' }, create: { id: 'explicit' } },
    },
  };
  prepare_entity_data('User', data, false);
  assert.equal(data.id, 'existing');
  assert.ok('id' in data.sessions.createMany.data[0]!);
  assert.ok('id' in data.sessions.upsert.create);
  assert.equal(data.sessions.upsert.where.id, 'session');
  assert.equal(data.sessions.connectOrCreate.where.id, 'linked');
  assert.equal(data.sessions.connectOrCreate.create.id, 'explicit');
});

it('keeps newly generated IDs numeric and disjoint across API instances in the same millisecond', async (t) => {
  const time = 1_795_860_000_000;
  t.mock.method(Date, 'now', () => time);
  const left = await import(
    new URL('../database/entity-id.js?instance=1', import.meta.url).href
  );
  const right = await import(
    new URL('../database/entity-id.js?instance=2', import.meta.url).href
  );
  const first = left.nextEntityId();
  const second = left.nextEntityId();
  const concurrent = right.nextEntityId();
  assert.match(first, /^\d{33}$/);
  assert.equal(first.slice(0, 13), String(time));
  assert.equal(concurrent.slice(0, 13), String(time));
  assert.notEqual(first, concurrent);
  assert.ok(second > first);
});

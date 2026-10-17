import assert from 'node:assert/strict';
import { it } from 'node:test';
import { prepare_entity_data } from '../infra/database/entity_id.js';

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

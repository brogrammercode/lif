import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import { AppError } from '../core/error.js';
import { GeocodeService } from '../features/geocode/geocode.service.js';
import {
  reverse_schema,
  route_schema,
} from '../features/geocode/geocode.type.js';
const { driving_route, reverse_geocode, search_places } = new GeocodeService();

const input = {
  from_latitude: 12.9,
  from_longitude: 77.5,
  to_latitude: 12.91,
  to_longitude: 77.51,
};
const place = {
  lat: '12.9',
  lon: '77.5',
  display_name: 'Fixture address',
  address: { city: 'Fixture city' },
};
const route = {
  code: 'Ok',
  routes: [
    {
      distance: 1000.4,
      duration: 120.2,
      geometry: {
        coordinates: [
          [77.5, 12.9],
          [77.51, 12.91],
        ],
      },
    },
  ],
};
const respond = (value: unknown) =>
  mock.method(globalThis, 'fetch', async () => Response.json(value));
const hasCode = (code: string) => (error: unknown) =>
  error instanceof AppError && error.error_code === code;
afterEach(() => mock.restoreAll());

it('rejects blank and nonnumeric coordinate inputs while preserving zero coordinates', () => {
  for (const value of ['', '  ', null, false, true, [], ['0']]) {
    assert.equal(
      reverse_schema.safeParse({ latitude: value, longitude: '0' }).success,
      false,
    );
    assert.equal(
      route_schema.safeParse({ ...input, from_latitude: value }).success,
      false,
    );
  }
  assert.deepEqual(reverse_schema.parse({ latitude: '0', longitude: 0 }), {
    latitude: 0,
    longitude: 0,
  });
});

it('preserves valid geocoding records and empty searches', async () => {
  respond([place]);
  assert.deepEqual(await search_places({ q: 'Fixture city', limit: 5 }), [
    place,
  ]);
  mock.restoreAll();
  respond([]);
  assert.deepEqual(await search_places({ q: 'Fixture city', limit: 5 }), []);
});

it('maps network and invalid JSON failures to provider errors', async () => {
  mock.method(globalThis, 'fetch', async () => {
    throw new Error('Connection interrupted');
  });
  await assert.rejects(
    search_places({ q: 'Fixture city', limit: 5 }),
    hasCode('GEOCODE_PROVIDER_ERROR'),
  );
  mock.restoreAll();
  mock.method(
    globalThis,
    'fetch',
    async () => new Response('<html>upstream failure</html>'),
  );
  await assert.rejects(driving_route(input), hasCode('ROUTING_PROVIDER_ERROR'));
});

it('rejects malformed and out-of-range geocoding coordinates', async () => {
  respond([{ ...place, lat: '100' }]);
  await assert.rejects(
    search_places({ q: 'Fixture city', limit: 5 }),
    hasCode('GEOCODE_PROVIDER_ERROR'),
  );
});

it('distinguishes a missing reverse address from a provider failure', async () => {
  respond({ error: 'Unable to geocode' });
  await assert.rejects(
    reverse_geocode({ latitude: 0, longitude: 0 }),
    hasCode('GEOCODE_NOT_FOUND'),
  );
});

it('returns validated route geometry and integer measurements', async () => {
  respond(route);
  const result = await driving_route(input);
  assert.equal(result.distance_m, 1000);
  assert.equal(result.duration_s, 120);
});

it('rejects null route responses and impossible coordinates', async () => {
  respond(null);
  await assert.rejects(driving_route(input), hasCode('ROUTING_PROVIDER_ERROR'));
  mock.restoreAll();
  respond({
    code: 'Ok',
    routes: [
      {
        ...route.routes[0],
        geometry: {
          coordinates: [
            [999, 12.9],
            [77.5, 12.91],
          ],
        },
      },
    ],
  });
  await assert.rejects(driving_route(input), hasCode('ROUTING_PROVIDER_ERROR'));
});

it('returns an addressable no-route error', async () => {
  respond({ code: 'NoRoute' });
  await assert.rejects(driving_route(input), hasCode('ROUTE_NOT_FOUND'));
});

it('keeps tiny positive routes within the integer contract', async () => {
  respond({
    code: 'Ok',
    routes: [{ ...route.routes[0], distance: 0.2, duration: 0.3 }],
  });
  const result = await driving_route(input);
  assert.equal(result.distance_m, 1);
  assert.equal(result.duration_s, 1);
});

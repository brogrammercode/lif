import { AppError } from '../../core/error.js';
import { config } from '../../core/config.js';
import {
  GEOCODE_BASE_URL,
  GEOCODE_PROVIDER_ERROR,
  GEOCODE_USER_AGENT,
  ROUTE_NOT_FOUND_ERROR,
  ROUTE_PROVIDER_ERROR,
} from './geocode.constant.js';
import type { ReverseInput, RouteInput, SearchInput } from './geocode.type.js';
import {
  provider_place_schema,
  provider_route_schema,
} from './geocode.type.js';
import {
  GEOCODE_NOT_FOUND_ERROR,
  PROVIDER_TIMEOUT_MS,
} from './geocode.constant.js';

const provider_request = async (
  path: string,
  params: Record<string, string>,
): Promise<unknown> => {
  const url = new URL(path, GEOCODE_BASE_URL);
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': GEOCODE_USER_AGENT },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(GEOCODE_PROVIDER_ERROR);
    return await response.json();
  } catch {
    throw new AppError(502, 'GEOCODE_PROVIDER_ERROR', GEOCODE_PROVIDER_ERROR);
  }
};

export const search_places = async (input: SearchInput) => {
  const result = provider_place_schema
    .array()
    .safeParse(
      await provider_request('/search', {
        q: input.q,
        format: 'jsonv2',
        addressdetails: '1',
        limit: String(input.limit),
      }),
    );
  if (!result.success)
    throw new AppError(502, 'GEOCODE_PROVIDER_ERROR', GEOCODE_PROVIDER_ERROR);
  return result.data;
};
export const reverse_geocode = async (input: ReverseInput) => {
  const body = await provider_request('/reverse', {
    lat: String(input.latitude),
    lon: String(input.longitude),
    format: 'jsonv2',
    addressdetails: '1',
  });
  if (body && typeof body === 'object' && 'error' in body)
    throw new AppError(422, 'GEOCODE_NOT_FOUND', GEOCODE_NOT_FOUND_ERROR);
  const result = provider_place_schema.safeParse(body);
  if (!result.success)
    throw new AppError(502, 'GEOCODE_PROVIDER_ERROR', GEOCODE_PROVIDER_ERROR);
  return result.data;
};

export const driving_route = async (input: RouteInput) => {
  const coordinates = `${input.from_longitude},${input.from_latitude};${input.to_longitude},${input.to_latitude}`;
  const url = new URL(
    `/route/v1/driving/${coordinates}`,
    config.ROUTING_BASE_URL,
  );
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'false');

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new AppError(502, 'ROUTING_PROVIDER_ERROR', ROUTE_PROVIDER_ERROR);
  }
  if (!response.ok)
    throw new AppError(502, 'ROUTING_PROVIDER_ERROR', ROUTE_PROVIDER_ERROR);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AppError(502, 'ROUTING_PROVIDER_ERROR', ROUTE_PROVIDER_ERROR);
  }
  const parsed = provider_route_schema.safeParse(body);
  if (!parsed.success)
    throw new AppError(502, 'ROUTING_PROVIDER_ERROR', ROUTE_PROVIDER_ERROR);
  const result = parsed.data;
  if (['NoRoute', 'NoSegment'].includes(result.code))
    throw new AppError(422, 'ROUTE_NOT_FOUND', ROUTE_NOT_FOUND_ERROR);
  const route = result.routes?.[0];
  const points = route?.geometry?.coordinates;
  if (
    result.code !== 'Ok' ||
    !route ||
    !Array.isArray(points) ||
    points.length < 2
  ) {
    throw new AppError(502, 'ROUTING_PROVIDER_ERROR', ROUTE_PROVIDER_ERROR);
  }
  return {
    distance_m: Math.max(1, Math.round(route.distance)),
    duration_s: Math.max(1, Math.round(route.duration)),
    geometry: points,
  };
};

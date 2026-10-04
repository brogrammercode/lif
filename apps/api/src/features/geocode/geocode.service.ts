import { AppError } from '../../core/error.js';
import { config } from '../../core/config.js';
import { GEOCODE_BASE_URL, GEOCODE_PROVIDER_ERROR, GEOCODE_USER_AGENT, ROUTE_NOT_FOUND_ERROR, ROUTE_PROVIDER_ERROR } from './geocode.constant.js';
import type { ReverseInput, RouteInput, SearchInput } from './geocode.type.js';

const provider_request = async (path: string, params: Record<string, string>): Promise<unknown> => {
  const url = new URL(path, GEOCODE_BASE_URL);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': GEOCODE_USER_AGENT }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new AppError(502, 'GEOCODE_PROVIDER_ERROR', GEOCODE_PROVIDER_ERROR);
  return response.json();
};

export const search_places = (input: SearchInput) => provider_request('/search', { q: input.q, format: 'jsonv2', addressdetails: '1', limit: String(input.limit) });
export const reverse_geocode = (input: ReverseInput) => provider_request('/reverse', { lat: String(input.latitude), lon: String(input.longitude), format: 'jsonv2', addressdetails: '1' });

export const driving_route = async (input: RouteInput) => {
  const coordinates = `${input.from_longitude},${input.from_latitude};${input.to_longitude},${input.to_latitude}`;
  const url = new URL(`/route/v1/driving/${coordinates}`, config.ROUTING_BASE_URL);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'false');

  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new AppError(502, 'ROUTING_PROVIDER_ERROR', ROUTE_PROVIDER_ERROR);
  }
  if (!response.ok) throw new AppError(502, 'ROUTING_PROVIDER_ERROR', ROUTE_PROVIDER_ERROR);

  const result = await response.json() as {
    code?: string;
    routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: unknown } }>;
  };
  const route = result.routes?.[0];
  const points = route?.geometry?.coordinates;
  if (result.code !== 'Ok' || !route || !Array.isArray(points) || points.length < 2) {
    throw new AppError(422, 'ROUTE_NOT_FOUND', ROUTE_NOT_FOUND_ERROR);
  }
  if (
    typeof route.distance !== 'number' || !Number.isFinite(route.distance) || route.distance <= 0 ||
    typeof route.duration !== 'number' || !Number.isFinite(route.duration) || route.duration <= 0 ||
    points.some((point) => !Array.isArray(point) || point.length < 2 || point.slice(0, 2).some((value) => typeof value !== 'number' || !Number.isFinite(value)))
  ) {
    throw new AppError(502, 'ROUTING_PROVIDER_ERROR', ROUTE_PROVIDER_ERROR);
  }
  return {
    distance_m: Math.round(route.distance),
    duration_s: Math.round(route.duration),
    geometry: points,
  };
};

import { z } from 'zod';
import { MAX_ROUTE_INTEGER } from './geocode.constant.js';

export const search_schema = z.object({
  q: z.string().trim().min(3).max(200),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export const reverse_schema = z.object({
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
});

export const route_schema = z.object({
  from_latitude: z.coerce.number().gte(-90).lte(90),
  from_longitude: z.coerce.number().gte(-180).lte(180),
  to_latitude: z.coerce.number().gte(-90).lte(90),
  to_longitude: z.coerce.number().gte(-180).lte(180),
});

export type SearchInput = z.infer<typeof search_schema>;
export type ReverseInput = z.infer<typeof reverse_schema>;
export type RouteInput = z.infer<typeof route_schema>;

export const provider_place_schema = z
  .object({
    lat: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) =>
          Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 90,
      ),
    lon: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) =>
          Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 180,
      ),
    display_name: z.string(),
  })
  .passthrough();

export const provider_route_schema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        distance: z.number().finite().positive().max(MAX_ROUTE_INTEGER),
        duration: z.number().finite().positive().max(MAX_ROUTE_INTEGER),
        geometry: z.object({
          coordinates: z
            .array(
              z
                .tuple([
                  z.number().gte(-180).lte(180),
                  z.number().gte(-90).lte(90),
                ])
                .rest(z.number().finite()),
            )
            .min(2),
        }),
      }),
    )
    .optional(),
});

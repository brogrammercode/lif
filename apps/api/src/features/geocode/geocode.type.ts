import { z } from 'zod';

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

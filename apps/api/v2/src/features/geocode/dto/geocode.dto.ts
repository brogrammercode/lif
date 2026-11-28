import { z } from 'zod';
const coordinate_input = z
  .union([z.number(), z.string().trim().min(1)])
  .transform(Number);
const latitude_schema = coordinate_input.pipe(z.number().gte(-90).lte(90));
const longitude_schema = coordinate_input.pipe(z.number().gte(-180).lte(180));
export const search_schema = z.object({
  q: z.string().trim().min(3).max(200),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});
export const reverse_schema = z.object({
  latitude: latitude_schema,
  longitude: longitude_schema,
});
export const route_schema = z.object({
  from_latitude: latitude_schema,
  from_longitude: longitude_schema,
  to_latitude: latitude_schema,
  to_longitude: longitude_schema,
});
export type SearchInput = z.infer<typeof search_schema>;
export type ReverseInput = z.infer<typeof reverse_schema>;
export type RouteInput = z.infer<typeof route_schema>;

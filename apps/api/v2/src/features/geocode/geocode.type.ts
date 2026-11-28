import { z } from 'zod';
import { MAX_ROUTE_INTEGER } from './geocode.constant.js';
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
        legs: z
          .array(
            z.object({
              steps: z
                .array(
                  z.object({
                    name: z.string().default(''),
                    distance: z.number().finite().nonnegative(),
                    duration: z.number().finite().nonnegative(),
                    maneuver: z.object({
                      type: z.string(),
                      modifier: z.string().optional(),
                      location: z.tuple([
                        z.number().gte(-180).lte(180),
                        z.number().gte(-90).lte(90),
                      ]),
                      exit: z.number().optional(),
                    }),
                    geometry: z.object({
                      coordinates: z.array(
                        z.tuple([
                          z.number().gte(-180).lte(180),
                          z.number().gte(-90).lte(90),
                        ]),
                      ),
                    }),
                  }),
                )
                .default([]),
            }),
          )
          .optional(),
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

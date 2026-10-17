import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../core/constants.js';
export const ride_list_schema = z
  .object({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    page_size: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE),
  })
  .strict();
const location_schema = z.object({
  address: z.string().trim().min(1).max(300),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
});
export const quote_schema = z.object({
  pickup: location_schema,
  dropoff: location_schema,
  rider_note: z.string().trim().max(500).optional(),
});
export const create_ride_schema = z.object({
  draft_ride_id: z.string().min(1),
  quote_id: z.string().min(1),
  payment_method_id: z.string().min(1).optional(),
});
export const cancel_ride_schema = z.object({
  cancel_reason: z.string().trim().min(1).max(300),
});
export const review_schema = z.object({
  reviewee_id: z.string().min(1),
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});
export type QuoteInput = z.infer<typeof quote_schema>;
export type CreateRideInput = z.infer<typeof create_ride_schema>;
export type CancelRideInput = z.infer<typeof cancel_ride_schema>;
export type ReviewInput = z.infer<typeof review_schema>;

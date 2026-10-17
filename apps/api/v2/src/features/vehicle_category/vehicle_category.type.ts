import { z } from 'zod';
import { image_upload_schema } from '../../infra/media/image_upload.js';
const rate = z
  .number()
  .finite()
  .min(0)
  .max(1000000)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001,
    'Use at most two decimal places',
  );
export const vehicle_family_schema = z.enum([
  'BIKE',
  'SCOOTER',
  'AUTO',
  'SEDAN',
  'SUV',
]);
export const category_schema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(240).default(''),
    image_url: z
      .union([z.literal(''), z.string().url().startsWith('https://').max(2000)])
      .default(''),
    image_upload: image_upload_schema.optional(),
    parent_id: z.string().min(1).max(100).nullable().default(null),
    vehicle_type: vehicle_family_schema,
    capacity: z.number().int().min(1).max(8),
    base_fare: rate,
    per_kilometer: rate,
    per_minute: rate,
    is_active: z.boolean(),
    sort_order: z.number().int().min(0).max(100000).default(0),
  })
  .strict();
export const update_category_schema = category_schema.extend({
  expected_updated_at: z.iso.datetime(),
});
export type CategoryInput = z.infer<typeof category_schema>;
export type CategoryUpdateInput = z.infer<typeof update_category_schema>;

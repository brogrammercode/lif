import { z } from 'zod';
import { image_upload_schema } from '../../infra/media/image_upload.js';
export const catalog_status = z.enum(['REQUESTED', 'VERIFIED', 'REJECTED']);
export const catalog_id = z.string().trim().min(1).max(100);
export const catalog_query = z.object({
  query: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'REQUESTED', 'VERIFIED', 'REJECTED']).default('all'),
  brand_id: catalog_id.optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
const shared = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullable().default(null),
  logo_url: z
    .string()
    .url()
    .startsWith('https://')
    .max(2000)
    .nullable()
    .default(null),
  image_upload: image_upload_schema.optional(),
  status: catalog_status.default('VERIFIED'),
  is_active: z.boolean().default(true),
  rejection_reason: z.string().trim().max(1000).nullable().default(null),
};
export const brand_input = z
  .object({
    ...shared,
    country: z.string().trim().max(80).nullable().default(null),
    website_url: z
      .string()
      .url()
      .startsWith('https://')
      .max(2000)
      .nullable()
      .default(null),
  })
  .strict();
export const brand_update = brand_input.extend({
  expected_updated_at: z.iso.datetime(),
});
export const brand_request = brand_input.omit({
  status: true,
  is_active: true,
  rejection_reason: true,
});
export const model_input = z
  .object({
    ...shared,
    brand_id: catalog_id,
    vehicle_type: z.enum(['BIKE', 'SCOOTER', 'AUTO', 'SEDAN', 'SUV']),
    fuel_type: z.enum([
      'PETROL',
      'DIESEL',
      'CNG',
      'ELECTRIC',
      'HYBRID',
      'OTHER',
    ]),
    seating_capacity: z.number().int().min(1).max(8),
    year_from: z.number().int().min(1900).max(2050).nullable().default(null),
    year_to: z.number().int().min(1900).max(2050).nullable().default(null),
  })
  .strict();
export const model_update = model_input.extend({
  expected_updated_at: z.iso.datetime(),
});
export const model_request = model_input.omit({
  status: true,
  is_active: true,
  rejection_reason: true,
});
export type BrandInput = z.infer<typeof brand_input> & {
  expected_updated_at?: string;
};
export type ModelInput = z.infer<typeof model_input> & {
  expected_updated_at?: string;
};
export type CatalogQuery = z.infer<typeof catalog_query>;

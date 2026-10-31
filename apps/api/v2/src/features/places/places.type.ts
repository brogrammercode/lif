import { createHash } from 'node:crypto';
import { z } from 'zod';
import { image_upload_schema } from '../../infra/media/image_upload.js';
export const place_id = z.string().trim().min(1).max(100);
export const place_input = z
  .object({
    name: z.string().trim().min(1).max(80),
    address: z.string().trim().min(1).max(300),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    place_type: z.enum(['HOME', 'WORK', 'OTHER']).default('OTHER'),
    description: z.string().trim().max(2000).default(''),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[\d ()-]{7,25}$/)
      .refine((value) => {
        const digits = value.replace(/\D/g, '').length;
        return digits >= 7 && digits <= 15;
      }, 'Enter a valid phone number.')
      .nullable()
      .optional(),
    website: z
      .string()
      .url()
      .max(500)
      .refine((v) => {
        const url = new URL(v);
        return (
          ['https:', 'http:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        );
      })
      .nullable()
      .optional(),
  })
  .strict();
export const place_update = place_input.extend({
  version: z.number().int().positive(),
});
export const place_list = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    page_size: z.coerce.number().int().min(1).max(50).default(20),
    query: z.string().trim().max(120).default(''),
    scope: z.enum(['all', 'saved', 'visited']).default('all'),
    type: z.enum(['HOME', 'WORK', 'OTHER']).optional(),
  })
  .strict();
export const place_toggle = z.object({ value: z.boolean() }).strict();
export const place_review = z
  .object({
    score: z.number().int().min(1).max(5),
    comment: z.string().trim().min(1).max(2000),
  })
  .strict();
export const place_photo = z
  .object({
    image_upload: image_upload_schema.refine(
      (image) =>
        Buffer.from(image.data_url.split(',')[1] ?? '', 'base64').length <=
        3000000,
      'Choose an image up to 3 MB.',
    ),
    request_key: z.string().trim().min(8).max(100),
  })
  .strict();
export type PlaceInput = z.infer<typeof place_input>;
export type PlaceList = z.infer<typeof place_list>;
export const place_dedupe_key = (input: PlaceInput) =>
  createHash('sha256')
    .update(
      [
        input.name
          .normalize('NFKC')
          .trim()
          .replace(/\s+/g, ' ')
          .toLocaleLowerCase('en'),
        input.latitude.toFixed(5),
        input.longitude.toFixed(5),
      ].join('|'),
    )
    .digest('hex');

import { z } from 'zod';
import { image_upload_schema } from '../../infra/media/image_upload.js';
export const profile_update_schema = z.object({
  first_name: z.string().trim().min(1).max(80).optional(),
  last_name: z.string().trim().max(80).optional(),
  phone_e164: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional(),
  avatar_url: z.string().url().optional(),
});
// Preserve existing URL clients while accepting the mobile preview/save flow.
// Exactly one source prevents silently uploading an ignored image.
export const avatar_schema = z.union([
  z.object({ image_upload: image_upload_schema }).strict(),
  z.object({ avatar_url: z.string().url() }).strict(),
]);
export const location_update_schema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
});
export const saved_place_schema = z.object({
  label: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(300),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  place_type: z.enum(['HOME', 'WORK', 'OTHER']).default('OTHER'),
  place_data: z.record(z.string(), z.unknown()).optional(),
});
export type ProfileUpdateInput = z.infer<typeof profile_update_schema>;
export type AvatarInput = z.infer<typeof avatar_schema>;
export type LocationUpdateInput = z.infer<typeof location_update_schema>;
export type SavedPlaceInput = z.infer<typeof saved_place_schema>;

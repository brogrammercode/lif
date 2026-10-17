import { z } from 'zod';
import { image_upload_schema } from '../../infra/media/image_upload.js';
export const user_id_schema = z.string().trim().min(1).max(100);
export const user_list_schema = z
  .object({
    query: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    page_size: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const personal_update_schema = z
  .object({
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().max(80).nullable(),
    phone_e164: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/)
      .nullable(),
    avatar_url: z
      .string()
      .trim()
      .url()
      .startsWith('https://')
      .max(2000)
      .nullable(),
    expected_updated_at: z.iso.datetime(),
    image_upload: image_upload_schema.optional(),
  })
  .strict();
export type UserListInput = z.infer<typeof user_list_schema>;
export type PersonalUpdateInput = z.infer<typeof personal_update_schema>;

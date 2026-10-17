import { z } from 'zod';

export const access_list_schema = z
  .object({
    query: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    page_size: z.coerce.number().int().min(1).max(50).default(20),
    status: z.enum(['all', 'ACTIVE', 'SUSPENDED']).default('all'),
  })
  .strict();
export const grant_access_schema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  })
  .strict();
export const revoke_access_schema = z
  .object({
    expected_access_version: z.iso.datetime().nullable().optional(),
    expected_updated_at: z.iso.datetime().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.expected_access_version !== undefined ||
      value.expected_updated_at !== undefined,
    'Reload the administrator list before removing access.',
  );
export const access_user_id_schema = z.string().trim().min(1).max(100);
export type AccessListInput = z.infer<typeof access_list_schema>;
export type GrantAccessInput = z.infer<typeof grant_access_schema>;
export type RevokeAccessInput = z.infer<typeof revoke_access_schema>;

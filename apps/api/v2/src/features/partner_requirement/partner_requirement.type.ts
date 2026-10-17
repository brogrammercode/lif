import { z } from 'zod';
export const DOCUMENT_TYPES = ['FILE', 'IMAGE', 'PDF'] as const;
export const DETAIL_TYPES = [
  'STRING',
  'TEXT',
  'NUMBER',
  'DATE',
  'BOOLEAN',
] as const;
export const requirement_id = z.string().trim().min(1).max(100);
export const requirement_query = z.object({
  query: z.string().trim().max(100).default(''),
  category_id: requirement_id.optional(),
  section: z.enum(['all', 'details', 'documents']).default('all'),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
});
export const category_input = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000).nullable().default(null),
    sort_order: z.number().int().min(0).max(100000).default(0),
    is_active: z.boolean().default(true),
  })
  .strict();
export const category_update = category_input.extend({
  expected_updated_at: z.iso.datetime(),
});
export const requirement_input = z
  .object({
    category_id: requirement_id,
    key: z
      .string()
      .trim()
      .regex(
        /^[a-z][a-z0-9_]{1,63}$/,
        'Use a stable key of 2–64 lowercase letters, numbers and underscores.',
      ),
    label: z.string().trim().min(1).max(120),
    field_type: z.enum([...DETAIL_TYPES, ...DOCUMENT_TYPES]),
    description: z.string().trim().max(1000).nullable().default(null),
    placeholder: z.string().trim().max(200).nullable().default(null),
    is_required: z.boolean().default(true),
    is_active: z.boolean().default(true),
    sort_order: z.number().int().min(0).max(100000).default(0),
    min_value: z.number().finite().nullable().default(null),
    max_value: z.number().finite().nullable().default(null),
    max_length: z.number().int().min(1).max(100000).nullable().default(null),
    max_file_size_mb: z.number().int().min(1).max(3).nullable().default(null),
    allowed_extensions: z
      .array(
        z.enum([
          '.pdf',
          '.jpg',
          '.jpeg',
          '.png',
          '.webp',
          '.doc',
          '.docx',
          '.xls',
          '.xlsx',
          '.txt',
          '.csv',
          '.zip',
        ]),
      )
      .max(12)
      .default([]),
    allow_multiple: z.boolean().default(false),
  })
  .strict();
export const requirement_update = requirement_input.extend({
  expected_updated_at: z.iso.datetime(),
});
export type CategoryInput = z.infer<typeof category_input> & {
  expected_updated_at?: string;
};
export type RequirementInput = z.infer<typeof requirement_input> & {
  expected_updated_at?: string;
};
export type RequirementQuery = z.infer<typeof requirement_query>;

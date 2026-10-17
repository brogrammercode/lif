import { z } from 'zod';

export const document_kind = z.enum(['POLICY', 'CONFIRMATION']);
export const document_input = z
  .object({
    title: z.string().trim().min(1).max(200),
    html: z.string().max(3_500_000),
    revision: z.number().int().nonnegative(),
    publish: z.boolean().default(false),
  })
  .strict();
export const application_input = z
  .object({
    version: z.number().int().nonnegative(),
    policy_version: z.number().int().positive(),
    accepted: z.literal(true),
    contact_email: z.email().max(254),
    whatsapp_phone: z
      .string()
      .regex(
        /^\+[1-9]\d{7,14}$/,
        'Use a phone number with country code, for example +919876543210.',
      ),
    answers: z
      .array(
        z.object({
          requirement_id: z.string().min(1).max(100),
          value: z.json(),
        }),
      )
      .max(200),
  })
  .strict();
export const review_input = z
  .object({
    version: z.number().int().positive(),
    decision: z.enum(['APPROVED', 'REJECTED']),
    rejection_reason: z.string().trim().max(2000).optional(),
    final_pdf_id: z.string().max(100).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.decision === 'REJECTED' && !input.rejection_reason)
      ctx.addIssue({
        code: 'custom',
        path: ['rejection_reason'],
        message: 'Explain what needs to be corrected.',
      });
  });
export const confirmation_input = z
  .object({
    version: z.number().int().positive(),
    document_version: z.number().int().positive(),
    signature_name: z.string().trim().min(2).max(150),
    accepted: z.literal(true),
  })
  .strict();
export const asset_input = z
  .object({
    file_name: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .regex(/^[^\\/\x00-\x1f]+$/),
    data_url: z.string().max(4_200_000),
    field_id: z.string().max(100).optional(),
    application_id: z.string().max(100).optional(),
  })
  .strict();
export const list_input = z.object({
  page: z.coerce.number().int().min(1).default(1),
  query: z.string().trim().max(150).default(''),
  status: z
    .enum([
      'all',
      'SUBMITTED',
      'CHANGES_REQUESTED',
      'APPROVED',
      'CONFIRMATION_SUBMITTED',
      'CONFIRMATION_CHANGES_REQUESTED',
      'COMPLETED',
      'ACTIVATED',
    ])
    .default('all'),
  section: z.enum(['applications', 'confirmations']).default('applications'),
});
export const activation_input = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict();
export const id_input = z.string().min(1).max(100);
export type ApplicationInput = z.infer<typeof application_input>;
export type ReviewInput = z.infer<typeof review_input>;
export type ConfirmationInput = z.infer<typeof confirmation_input>;
export type AssetInput = z.infer<typeof asset_input>;
export type ListInput = z.infer<typeof list_input>;

import { z } from 'zod';
import { id_input } from './partner_program.type.js';

export const exit_create_input = z
  .object({
    reason: z.string().trim().min(10).max(2000),
    version: z.number().int().nonnegative().default(0),
  })
  .strict();
export const admin_exit_create_input = exit_create_input.extend({
  application_id: id_input,
});
export const exit_review_input = z
  .object({
    version: z.number().int().positive(),
    status: z.enum(['REVIEWING', 'REJECTED', 'COMPLETED']),
    admin_notes: z.string().trim().max(4000).default(''),
    rejection_reason: z.string().trim().max(2000).default(''),
    dues_amount: z
      .string()
      .regex(
        /^\d{1,10}(\.\d{1,2})?$/,
        'Enter a nonnegative amount with up to two decimal places.',
      ),
    dues_direction: z.enum(['DRIVER_OWES', 'PAYABLE_TO_DRIVER', 'SETTLED']),
    settlement_pdf_id: id_input.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.status === 'REJECTED' && !input.rejection_reason)
      ctx.addIssue({
        code: 'custom',
        path: ['rejection_reason'],
        message: 'Explain why this exit request was rejected.',
      });
    if (input.status === 'COMPLETED' && !input.settlement_pdf_id)
      ctx.addIssue({
        code: 'custom',
        path: ['settlement_pdf_id'],
        message: 'Attach the settlement PDF before completing the exit.',
      });
    if (input.dues_direction === 'SETTLED' && Number(input.dues_amount) !== 0)
      ctx.addIssue({
        code: 'custom',
        path: ['dues_amount'],
        message: 'Settled dues must be zero.',
      });
  });
export const exit_list_input = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  query: z.string().trim().max(150).default(''),
  status: z
    .enum(['all', 'PENDING', 'REQUESTED', 'REVIEWING', 'REJECTED', 'COMPLETED'])
    .default('all'),
});

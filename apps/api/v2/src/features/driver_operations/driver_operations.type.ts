import { z } from 'zod';
export const trip_code_input = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict();
export const trip_message_input = z
  .object({
    client_key: z.string().min(8).max(100),
    body: z.string().trim().min(1).max(1000),
  })
  .strict();
export const trip_payment_input = z
  .object({ method: z.enum(['CASH', 'UPI']) })
  .strict();
export const trip_collection_input = trip_payment_input
  .extend({
    received: z.boolean(),
    reason: z.string().trim().min(5).max(1000).optional(),
  })
  .strict()
  .refine((v) => v.received || !!v.reason, {
    message: 'Explain why the fare remains unpaid.',
    path: ['reason'],
  });
export const trip_issue_input = z
  .object({
    kind: z.enum(['CANCELLATION', 'NO_SHOW']),
    reason: z.string().trim().min(5).max(1000),
    reason_code: z
      .enum([
        'CHANGED_PLANS',
        'WRONG_PICKUP',
        'SAFETY',
        'DRIVER_LATE',
        'DRIVER_REFUSED',
        'OTHER',
      ])
      .optional(),
  })
  .strict();
export const trip_review_input = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(['APPROVED', 'WAIVED', 'REJECTED', 'SETTLED']),
    note: z.string().trim().min(5).max(2000),
  })
  .strict();
export const trip_dispute_input = z
  .object({ reason: z.string().trim().min(5).max(1000) })
  .strict();

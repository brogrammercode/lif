import { z } from 'zod';
import { upi_pattern } from '../partner_program/partner_field.rules.js';
export const payout_details = z
  .object({
    holder_name: z.string().trim().min(2).max(120),
    upi: z.string().trim().max(320).regex(upi_pattern).optional(),
    account_number: z
      .string()
      .regex(/^\d{9,18}$/)
      .optional(),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/)
      .optional(),
  })
  .strict()
  .refine(
    (v) => !!v.upi || !!(v.account_number && v.ifsc),
    'Provide UPI or complete bank details.',
  )
  .refine(
    (v) => !!v.account_number === !!v.ifsc,
    'Provide both account number and IFSC.',
  );
export const payout_request = z
  .object({ request_key: z.uuid(), details: payout_details })
  .strict();
export const payout_review = z
  .object({
    expected_version: z.number().int().positive(),
    status: z.enum(['APPROVED', 'REJECTED']),
    note: z.string().trim().min(5).max(1000),
  })
  .strict();
export const finance_query = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    section: z.enum(['trips', 'charges']).default('trips'),
  })
  .strict();
export function finance_range(
  input: z.infer<typeof finance_query>,
  now = new Date(),
) {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const from = input.from
    ? new Date(input.from + 'T00:00:00Z')
    : new Date(today.getTime() - 29 * 86400000);
  const until = input.to
    ? new Date(new Date(input.to + 'T00:00:00Z').getTime() + 86400000)
    : new Date(today.getTime() + 86400000);
  if (until <= from || until.getTime() - from.getTime() > 93 * 86400000)
    throw new Error('Choose a date range of 1 to 93 days.');
  return { from, until };
}
export type PayoutDetails = z.infer<typeof payout_details>;

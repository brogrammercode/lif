import { AppError } from '../../../core/error.js';
import { topup_reference } from '../wallet-topups.js';
import { z } from 'zod';

import { user_id_schema } from '../../admin_user/admin_user.type.js';

import { walletEntryKinds } from '../wallet.rows.js';

const reason_schema = z.string().trim().min(3).max(300);

export const approve_cycle_body_schema = z
  .object({ version: z.number().int().positive() })
  .strict();

export const reconcile_payout_body_schema = z
  .object({
    provider_id: z
      .string()
      .trim()
      .regex(/^pout_[A-Za-z0-9]{1,80}$/),
  })
  .strict();

export const reconcile_topup_body_schema = z
  .object({
    reason: reason_schema,
    dispute_id: z
      .string()
      .trim()
      .regex(/^disp_[A-Za-z0-9]{1,80}$/)
      .optional(),
  })
  .strict();

export const refund_ride_body_schema = z
  .object({
    reason: reason_schema,
    platform_funded: z.boolean(),
  })
  .strict();

export const query_schema = z
  .object({
    kind: z.enum(['RIDER', 'DRIVER']).default('RIDER'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    page_size: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const pagination = query_schema.omit({ kind: true });

export const ledger_query = query_schema
  .extend({
    entry_kind: z.enum(walletEntryKinds).optional(),
    timeline: z.literal('true').optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    reference: user_id_schema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'The end date must be on or after the start date.',
    path: ['to'],
  });

const check_topup_body = z
  .object({ cancelled: z.boolean().optional() })
  .strict();

export const check_topup_request = z
  .object({ routeId: z.unknown(), body: z.unknown() })
  .transform(({ routeId, body }) => {
    const reference = topup_reference.safeParse(routeId);
    if (!reference.success)
      throw new AppError(
        404,
        'TOPUP_NOT_FOUND',
        'This top-up reference is unavailable. Refresh My Wallet and reopen the top-up from your history.',
      );
    return { id: reference.data, ...check_topup_body.parse(body ?? {}) };
  });

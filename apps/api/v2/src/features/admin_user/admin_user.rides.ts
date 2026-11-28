import { z } from 'zod';

export const rides_query = z
  .object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    status: z.enum(['all', 'active', 'completed', 'cancelled']).default('all'),
  })
  .strict();

export function account_is_driver(user: {
  role: string;
  partner_activated_at: Date | null;
}) {
  return user.role === 'DRIVER' || Boolean(user.partner_activated_at);
}

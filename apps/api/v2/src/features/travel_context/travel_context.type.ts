import { z } from 'zod';

export const rider_history_schema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
    section: z
      .enum(['all', 'active', 'past', 'completed', 'cancelled', 'unfulfilled'])
      .default('all'),
    query: z.string().trim().max(120).default(''),
    category_id: z.string().trim().min(1).max(100).optional(),
    month: z
      .string()
      .regex(/^(20\d{2})-(0[1-9]|1[0-2])$/)
      .optional(),
  })
  .strict();

export type RiderHistoryFilters = Pick<
  z.infer<typeof rider_history_schema>,
  'query' | 'category_id' | 'month'
>;

import { z } from 'zod';

export const registrationEmailQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    status: z.enum(['pending', 'all']).default('pending'),
  })
  .strict();
export type RegistrationEmailQuery = z.infer<typeof registrationEmailQuery>;
export const registrationEmailId = z.string().min(1).max(100);

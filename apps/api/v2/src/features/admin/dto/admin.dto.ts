import { z } from 'zod';
export const verification_schema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
});
export const offer_schema = z.object({
  driver_id: z.string().min(1),
  expires_in_minutes: z.number().int().min(1).max(120).default(10),
});
export type VerificationInput = z.infer<typeof verification_schema>;
export type OfferInput = z.infer<typeof offer_schema>;

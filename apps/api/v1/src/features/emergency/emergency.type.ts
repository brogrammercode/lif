import { z } from 'zod';

export const emergency_contact_schema = z.object({
  name: z.string().trim().min(1).max(100),
  phone_e164: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  relationship: z.string().trim().max(80).optional(),
});

export type EmergencyContactInput = z.infer<typeof emergency_contact_schema>;

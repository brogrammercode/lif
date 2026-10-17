import { z } from 'zod';

export const ticket_schema = z.object({
  ride_id: z.string().min(1).optional(),
  subject: z.string().trim().min(1).max(160),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  body: z.string().trim().min(1).max(5000),
});

export const message_schema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export type TicketInput = z.infer<typeof ticket_schema>;
export type MessageInput = z.infer<typeof message_schema>;

import { z } from 'zod';
export const payment_method_schema = z
  .object({
    type: z.enum(['CASH', 'CARD', 'UPI', 'WALLET']),
    provider: z.string().trim().max(80).optional(),
    provider_customer_id: z.string().trim().max(200).optional(),
    provider_method_id: z.string().trim().max(200).optional(),
    card_brand: z.string().trim().max(40).optional(),
    card_last4: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    upi_handle: z.string().trim().max(120).optional(),
    is_default: z.boolean().default(false),
  })
  .superRefine((method, context) => {
    if (method.type !== 'CASH' && !method.provider_method_id) {
      context.addIssue({
        code: 'custom',
        path: ['provider_method_id'],
        message:
          'A payment-provider method token is required for digital payment methods',
      });
    }
  });
export type PaymentMethodInput = z.infer<typeof payment_method_schema>;
export const checkout_schema = z.object({
  ride_id: z.string().min(1),
  payment_method_id: z.string().min(1),
});
export const webhook_schema = z.object({
  ride_id: z.string().min(1).optional(),
  provider_payment_id: z.string().min(1),
  status: z.enum([
    'PENDING',
    'AUTHORIZED',
    'CAPTURED',
    'FAILED',
    'REFUNDED',
    'PARTIALLY_REFUNDED',
    'CANCELLED',
  ]),
  amount: z
    .number()
    .finite()
    .nonnegative()
    .max(9999999999.99)
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001,
      'Use at most two decimal places',
    )
    .optional(),
});
export type CheckoutInput = z.infer<typeof checkout_schema>;
export type WebhookInput = z.infer<typeof webhook_schema>;

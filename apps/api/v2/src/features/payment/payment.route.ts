export const PAYMENT_ROUTES = {
  LIST: ['payment-methods', 'me/payment-methods'],
  CREATE: ['payment-methods', 'me/payment-methods/setup'],
  REMOVE: ['payment-methods/:id', 'me/payment-methods/:id'],
  CHECKOUT: ['payments/checkout', 'rides/:id/payment/checkout'],
  WEBHOOK: ['payments/webhooks/:provider'],
  RECEIPT: ['rides/:id/receipt'],
} satisfies Record<string, string[]>;

export const PAYMENT_ROUTE = '/payment-methods';
export const PAYMENTS_ROUTE = '/payments';
export const CHECKOUT_ROUTE = '/checkout';
export const WEBHOOKS_ROUTE = '/webhooks';
export const RECEIPT_ROUTE = '/receipt';
export const PAYMENT_METHOD_CREATED_MESSAGE = 'Payment method added';
export const PAYMENT_METHODS_LOADED_MESSAGE = 'Payment methods loaded';
export const PAYMENT_METHOD_DELETED_MESSAGE = 'Payment method removed';
export const PAYMENT_METHOD_NOT_FOUND_MESSAGE = 'Payment method was not found';
export const PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE =
  'Digital payment provider is not configured';
export const PAYMENT_CHECKOUT_CREATED_MESSAGE = 'Payment checkout created';
export const PAYMENT_WEBHOOK_PROCESSED_MESSAGE = 'Payment webhook processed';
export const RECEIPT_LOADED_MESSAGE = 'Receipt loaded';
export const PAYMENT_RIDE_NOT_FOUND_MESSAGE = 'Ride was not found for payment';
export const PAYMENT_NOT_FOUND_MESSAGE = 'Payment was not found';
export const WEBHOOK_SIGNATURE_HEADER = 'x-provider-signature';
export const PAYMENT_RIDE_STATE_MESSAGE =
  'Payment checkout is available after the ride is completed.';
export const PAYMENT_REFERENCE_MESSAGE =
  'Payment references do not match this provider transaction.';
export const PAYMENT_AMOUNT_MESSAGE =
  'The payment amount does not match the ride fare.';
export const PAYMENT_TRANSITIONS: Readonly<Record<string, readonly string[]>> =
  {
    PENDING: ['AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED'],
    REQUIRES_ACTION: [
      'PENDING',
      'AUTHORIZED',
      'CAPTURED',
      'FAILED',
      'CANCELLED',
    ],
    AUTHORIZED: ['CAPTURED', 'FAILED', 'CANCELLED'],
    CAPTURED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
    PARTIALLY_REFUNDED: ['REFUNDED'],
    FAILED: [],
    CANCELLED: [],
    REFUNDED: [],
  };

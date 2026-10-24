import type { PaymentMethodType, Prisma } from '@prisma/client';
import { AppError } from '../../core/error.js';

const object = (value: Prisma.JsonValue | undefined) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : null;

/** Read the selected quote, so later configuration edits never reprice a trip. */
export const require_supported_ride_payment = (
  snapshot: Prisma.JsonValue | undefined,
  method: PaymentMethodType,
) => {
  const category = object(snapshot);
  const policy = object(category?.payment_policy);
  if (
    typeof category?.fare_policy_version === 'number' &&
    (!policy ||
      typeof policy.cash_enabled !== 'boolean' ||
      typeof policy.direct_upi_enabled !== 'boolean')
  )
    throw new AppError(
      409,
      'QUOTE_PAYMENT_POLICY_INVALID',
      'This quote has no valid payment policy. Request fresh ride options.',
    );
  if (
    (method === 'CASH' && policy?.cash_enabled === false) ||
    (method === 'UPI' && policy?.direct_upi_enabled === false)
  )
    throw new AppError(
      409,
      'PAYMENT_METHOD_DISABLED',
      'This payment method is disabled for the selected ride.',
    );
  // Direct UPI is collected by the assigned driver. Provider-based online
  // settlement is unavailable; never silently fall back to that flow.
  if (method === 'UPI' && policy?.direct_upi_enabled === true) return;
  if (method !== 'CASH')
    throw new AppError(
      503,
      'PAYMENT_PROVIDER_UNAVAILABLE',
      method === 'UPI'
        ? 'Direct UPI ride payments are not available yet. Choose an enabled cash option.'
        : 'Online ride payments are not available yet. Choose an enabled cash option.',
    );
};

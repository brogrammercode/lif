import { AppError } from '../../core/error.js';
import { PAYMENT_RIDE_STATE_MESSAGE } from './payment.constant.js';
import {
  PAYMENT_METHOD_NOT_FOUND_MESSAGE,
  PAYMENT_NOT_FOUND_MESSAGE,
  PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE,
  PAYMENT_RIDE_NOT_FOUND_MESSAGE,
} from './payment.constant.js';
import {
  create_checkout,
  create_payment_method,
  delete_payment_method,
  get_receipt,
  list_payment_methods,
  process_webhook,
} from './payment.repo.js';
import type {
  CheckoutInput,
  PaymentMethodInput,
  WebhookInput,
} from './payment.type.js';

export const get_payment_methods = (user_id: string) =>
  list_payment_methods(user_id);
export const add_payment_method = (
  user_id: string,
  input: PaymentMethodInput,
) => create_payment_method(user_id, input);
export const remove_payment_method = async (
  user_id: string,
  payment_method_id: string,
) => {
  if (!(await delete_payment_method(user_id, payment_method_id)))
    throw new AppError(
      404,
      'PAYMENT_METHOD_NOT_FOUND',
      PAYMENT_METHOD_NOT_FOUND_MESSAGE,
    );
};

export const create_payment_checkout = async (
  user_id: string,
  input: CheckoutInput,
) => {
  const result = await create_checkout(user_id, input);
  if (result.kind === 'ride_not_found')
    throw new AppError(
      404,
      'PAYMENT_RIDE_NOT_FOUND',
      PAYMENT_RIDE_NOT_FOUND_MESSAGE,
    );
  if (result.kind === 'method_not_found')
    throw new AppError(
      404,
      'PAYMENT_METHOD_NOT_FOUND',
      PAYMENT_METHOD_NOT_FOUND_MESSAGE,
    );
  if (result.kind === 'provider_unavailable')
    throw new AppError(
      503,
      'PAYMENT_PROVIDER_UNAVAILABLE',
      PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE,
    );
  if (result.kind === 'invalid_state')
    throw new AppError(
      409,
      'PAYMENT_RIDE_STATE_INVALID',
      PAYMENT_RIDE_STATE_MESSAGE,
    );
  return result.payment;
};

export const process_payment_webhook = async (
  provider: string,
  input: WebhookInput,
) => {
  const payment = await process_webhook(provider, input);
  if (!payment)
    throw new AppError(404, 'PAYMENT_NOT_FOUND', PAYMENT_NOT_FOUND_MESSAGE);
  return payment;
};

export const load_receipt = async (user_id: string, ride_id: string) => {
  const receipt = await get_receipt(user_id, ride_id);
  if (!receipt)
    throw new AppError(
      404,
      'PAYMENT_RIDE_NOT_FOUND',
      PAYMENT_RIDE_NOT_FOUND_MESSAGE,
    );
  return receipt;
};

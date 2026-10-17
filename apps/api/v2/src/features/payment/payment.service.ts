import { Injectable } from '@nestjs/common';
import { PaymentRepository } from './payment.repo.js';
import { AppError } from '../../core/error.js';
import { PAYMENT_RIDE_STATE_MESSAGE } from './payment.constant.js';
import {
  PAYMENT_METHOD_NOT_FOUND_MESSAGE,
  PAYMENT_NOT_FOUND_MESSAGE,
  PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE,
  PAYMENT_RIDE_NOT_FOUND_MESSAGE,
} from './payment.constant.js';
import type {
  CheckoutInput,
  PaymentMethodInput,
  WebhookInput,
} from './payment.type.js';
@Injectable()
export class PaymentService {
  constructor(private readonly paymentRepository: PaymentRepository) {}
  readonly get_payment_methods = (user_id: string) =>
    this.paymentRepository.list_payment_methods(user_id);

  readonly add_payment_method = (user_id: string, input: PaymentMethodInput) =>
    this.paymentRepository.create_payment_method(user_id, input);

  readonly remove_payment_method = async (
    user_id: string,
    payment_method_id: string,
  ) => {
    if (
      !(await this.paymentRepository.delete_payment_method(
        user_id,
        payment_method_id,
      ))
    )
      throw new AppError(
        404,
        'PAYMENT_METHOD_NOT_FOUND',
        PAYMENT_METHOD_NOT_FOUND_MESSAGE,
      );
  };

  readonly create_payment_checkout = async (
    user_id: string,
    input: CheckoutInput,
  ) => {
    const result = await this.paymentRepository.create_checkout(user_id, input);
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

  readonly process_payment_webhook = async (
    provider: string,
    input: WebhookInput,
  ) => {
    const payment = await this.paymentRepository.process_webhook(
      provider,
      input,
    );
    if (!payment)
      throw new AppError(404, 'PAYMENT_NOT_FOUND', PAYMENT_NOT_FOUND_MESSAGE);
    return payment;
  };

  readonly load_receipt = async (user_id: string, ride_id: string) => {
    const receipt = await this.paymentRepository.get_receipt(user_id, ride_id);
    if (!receipt)
      throw new AppError(
        404,
        'PAYMENT_RIDE_NOT_FOUND',
        PAYMENT_RIDE_NOT_FOUND_MESSAGE,
      );
    return receipt;
  };
}

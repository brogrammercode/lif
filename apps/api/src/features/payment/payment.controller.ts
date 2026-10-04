import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import { PAYMENT_CHECKOUT_CREATED_MESSAGE, PAYMENT_METHOD_CREATED_MESSAGE, PAYMENT_METHOD_DELETED_MESSAGE, PAYMENT_METHODS_LOADED_MESSAGE, PAYMENT_WEBHOOK_PROCESSED_MESSAGE, RECEIPT_LOADED_MESSAGE } from './payment.constant.js';
import { checkout_schema, payment_method_schema, webhook_schema } from './payment.type.js';
import { add_payment_method, create_payment_checkout, get_payment_methods, load_receipt, process_payment_webhook, remove_payment_method } from './payment.service.js';

const current_user_id = (request: Request): string => {
  if (!request.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  return request.auth.user_id;
};

export const list = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await get_payment_methods(current_user_id(request)), PAYMENT_METHODS_LOADED_MESSAGE);
};

export const create = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await add_payment_method(current_user_id(request), payment_method_schema.parse(request.body)), PAYMENT_METHOD_CREATED_MESSAGE, 201);
};

export const remove = async (request: Request, response: Response): Promise<void> => {
  await remove_payment_method(current_user_id(request), request.params.id as string);
  send_success(response, null, PAYMENT_METHOD_DELETED_MESSAGE);
};

export const checkout = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await create_payment_checkout(current_user_id(request), checkout_schema.parse({ ...request.body, ride_id: request.params.id ?? request.body?.ride_id })), PAYMENT_CHECKOUT_CREATED_MESSAGE, 201);
};

export const webhook = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await process_payment_webhook(request.params.provider as string, webhook_schema.parse(request.body)), PAYMENT_WEBHOOK_PROCESSED_MESSAGE);
};

export const receipt = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await load_receipt(current_user_id(request), request.params.id as string), RECEIPT_LOADED_MESSAGE);
};

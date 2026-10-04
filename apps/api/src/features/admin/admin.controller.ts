import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import { DRIVER_VERIFICATION_UPDATED_MESSAGE, RIDE_OFFER_CREATED_MESSAGE } from './admin.constant.js';
import { dispatch_ride_offer, verify_driver } from './admin.service.js';
import { offer_schema, verification_schema } from './admin.type.js';

const current_user_id = (request: Request): string => {
  if (!request.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  return request.auth.user_id;
};

export const verification = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await verify_driver(current_user_id(request), request.params.id as string, verification_schema.parse(request.body)), DRIVER_VERIFICATION_UPDATED_MESSAGE);
};

export const offer = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await dispatch_ride_offer(current_user_id(request), request.params.id as string, offer_schema.parse(request.body)), RIDE_OFFER_CREATED_MESSAGE, 201);
};

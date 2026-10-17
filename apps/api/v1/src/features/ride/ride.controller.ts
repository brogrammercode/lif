import type { Request, Response } from 'express';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import { QUOTE_CREATED_MESSAGE, RIDE_CANCELLED_MESSAGE, RIDE_CREATED_MESSAGE, RIDE_EVENTS_LOADED_MESSAGE, RIDE_LOADED_MESSAGE, RIDE_LOCATIONS_LOADED_MESSAGE, RIDES_LOADED_MESSAGE, REVIEW_CREATED_MESSAGE, RIDE_START_CONFIRMED_MESSAGE } from './ride.constant.js';
import { cancel_ride_schema, create_ride_schema, quote_schema, review_schema } from './ride.type.js';
import { build_quote, cancel_user_ride, confirm_user_ride_start, get_ride, get_ride_events, get_ride_locations, get_rides, submit_review, submit_ride } from './ride.service.js';

const current_user_id = (request: Request): string => {
  if (!request.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  return request.auth.user_id;
};

const positive_integer = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const quote = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await build_quote(current_user_id(request), quote_schema.parse(request.body)), QUOTE_CREATED_MESSAGE, 201);
};

export const create = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await submit_ride(current_user_id(request), create_ride_schema.parse(request.body)), RIDE_CREATED_MESSAGE, 201);
};

export const list = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await get_rides(current_user_id(request), positive_integer(request.query.page, 1), positive_integer(request.query.page_size, 20)), RIDES_LOADED_MESSAGE);
};

export const detail = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await get_ride(current_user_id(request), request.params.id as string), RIDE_LOADED_MESSAGE);
};

export const events = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await get_ride_events(current_user_id(request), request.params.id as string), RIDE_EVENTS_LOADED_MESSAGE);
};

export const locations = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await get_ride_locations(current_user_id(request), request.params.id as string), RIDE_LOCATIONS_LOADED_MESSAGE);
};

export const cancel = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await cancel_user_ride(current_user_id(request), request.params.id as string, cancel_ride_schema.parse(request.body)), RIDE_CANCELLED_MESSAGE);
};

export const confirm_start = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await confirm_user_ride_start(current_user_id(request), request.params.id as string), RIDE_START_CONFIRMED_MESSAGE);
};

export const review = async (request: Request, response: Response): Promise<void> => {
  send_success(response, await submit_review(current_user_id(request), request.params.id as string, review_schema.parse(request.body)), REVIEW_CREATED_MESSAGE, 201);
};

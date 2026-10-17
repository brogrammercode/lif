import type { Request, Response } from 'express';
import { vehicle_category_selection_schema } from './driver.type.js';
import { update_driver_vehicle_category } from './driver.service.js';
import { update_active_vehicle } from './driver.service.js';
import {
  VEHICLE_CATEGORY_UPDATED_MESSAGE,
  ACTIVE_VEHICLE_UPDATED_MESSAGE,
} from './driver.constant.js';
import { AppError } from '../../core/error.js';
import { send_success } from '../../core/response.js';
import {
  DRIVER_ARRIVED_MESSAGE,
  DRIVER_AVAILABILITY_UPDATED_MESSAGE,
  DRIVER_LOCATION_UPDATED_MESSAGE,
  DRIVER_OFFER_ACCEPTED_MESSAGE,
  DRIVER_OFFER_REJECTED_MESSAGE,
  DRIVER_OFFERS_LOADED_MESSAGE,
  DRIVER_PROFILE_CREATED_MESSAGE,
  DRIVER_PROFILE_LOADED_MESSAGE,
  RIDE_COMPLETED_MESSAGE,
  RIDE_STARTED_MESSAGE,
  VEHICLE_CREATED_MESSAGE,
} from './driver.constant.js';
import {
  availability_schema,
  driver_profile_schema,
  location_schema,
  vehicle_schema,
} from './driver.type.js';
import {
  accept_driver_offer,
  get_driver_offers,
  get_driver_profile,
  reject_driver_offer,
  submit_driver_profile,
  submit_vehicle,
  transition_driver_ride,
  update_driver_availability,
  update_driver_location,
} from './driver.service.js';

const current_user_id = (request: Request): string => {
  if (!request.auth)
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required');
  return request.auth.user_id;
};

export const profile = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await get_driver_profile(current_user_id(request)),
    DRIVER_PROFILE_LOADED_MESSAGE,
  );
};

export const create_profile = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await submit_driver_profile(
      current_user_id(request),
      driver_profile_schema.parse(request.body),
    ),
    DRIVER_PROFILE_CREATED_MESSAGE,
    201,
  );
};

export const availability = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await update_driver_availability(
      current_user_id(request),
      availability_schema.parse(request.body),
    ),
    DRIVER_AVAILABILITY_UPDATED_MESSAGE,
  );
};

export const vehicle = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await submit_vehicle(
      current_user_id(request),
      vehicle_schema.parse(request.body),
    ),
    VEHICLE_CREATED_MESSAGE,
    201,
  );
};

export const change_category = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const input = vehicle_category_selection_schema.parse(request.body);
  send_success(
    response,
    await update_driver_vehicle_category(
      current_user_id(request),
      request.params.id as string,
      input.vehicle_category_id,
    ),
    VEHICLE_CATEGORY_UPDATED_MESSAGE,
  );
};

export const active_vehicle = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await update_active_vehicle(
      current_user_id(request),
      request.params.id as string,
    ),
    ACTIVE_VEHICLE_UPDATED_MESSAGE,
  );
};

export const offers = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await get_driver_offers(current_user_id(request)),
    DRIVER_OFFERS_LOADED_MESSAGE,
  );
};

export const accept = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    {
      ride_id: await accept_driver_offer(
        current_user_id(request),
        request.params.id as string,
      ),
    },
    DRIVER_OFFER_ACCEPTED_MESSAGE,
  );
};

export const reject = async (
  request: Request,
  response: Response,
): Promise<void> => {
  await reject_driver_offer(
    current_user_id(request),
    request.params.id as string,
  );
  send_success(response, null, DRIVER_OFFER_REJECTED_MESSAGE);
};

export const location = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await update_driver_location(
      current_user_id(request),
      location_schema.parse(request.body),
    ),
    DRIVER_LOCATION_UPDATED_MESSAGE,
  );
};

export const arrive = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await transition_driver_ride(
      current_user_id(request),
      request.params.id as string,
      'DRIVER_WAITING',
    ),
    DRIVER_ARRIVED_MESSAGE,
  );
};

export const start = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await transition_driver_ride(
      current_user_id(request),
      request.params.id as string,
      'IN_PROGRESS',
    ),
    RIDE_STARTED_MESSAGE,
  );
};

export const complete = async (
  request: Request,
  response: Response,
): Promise<void> => {
  send_success(
    response,
    await transition_driver_ride(
      current_user_id(request),
      request.params.id as string,
      'COMPLETED',
    ),
    RIDE_COMPLETED_MESSAGE,
  );
};

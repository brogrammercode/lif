import { AppError } from '../../core/error.js';
import { REVIEW_RECIPIENT_MESSAGE } from './ride.constant.js';
import { MAX_FARE_AMOUNT, FARE_LIMIT_MESSAGE } from './ride.constant.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../core/constants.js';
import {
  DEFAULT_PICKUP_ETA_SECONDS,
  QUOTE_EXPIRED_MESSAGE,
  QUOTE_LIFETIME_MINUTES,
  QUOTE_NOT_FOUND_MESSAGE,
  RIDE_CANNOT_BE_CANCELLED_MESSAGE,
  RIDE_NOT_FOUND_MESSAGE,
  REVIEW_ALLOWED_AFTER_COMPLETION_MESSAGE,
} from './ride.constant.js';
import { list_category_choices } from '../vehicle_category/vehicle_category.repo.js';
import { CATEGORY_MESSAGES } from '../vehicle_category/vehicle_category.constant.js';
import { driving_route } from '../geocode/geocode.service.js';
import {
  cancel_ride,
  confirm_ride_start,
  create_quote,
  create_review,
  find_ride_for_user,
  list_ride_events,
  list_ride_locations,
  list_rides_for_user,
  request_ride,
} from './ride.repo.js';
import type {
  CancelRideInput,
  CreateRideInput,
  QuoteInput,
  ReviewInput,
} from './ride.type.js';

export const build_quote = async (user_id: string, input: QuoteInput) => {
  const route = await driving_route({
    from_latitude: input.pickup.latitude,
    from_longitude: input.pickup.longitude,
    to_latitude: input.dropoff.latitude,
    to_longitude: input.dropoff.longitude,
  });
  const categories = await list_category_choices();
  if (categories.length === 0)
    throw new AppError(409, 'CATEGORIES_UNAVAILABLE', CATEGORY_MESSAGES.EMPTY);
  const distance_m = route.distance_m;
  const duration_s = route.duration_s;
  const expires_at = new Date(Date.now() + QUOTE_LIFETIME_MINUTES * 60 * 1000);
  const calculations = categories.map((category) => {
    const base_fare = category.base_fare.toNumber();
    const distance_fare = Number(
      ((distance_m / 1000) * category.per_kilometer.toNumber()).toFixed(2),
    );
    const time_fare = Number(
      ((duration_s / 60) * category.per_minute.toNumber()).toFixed(2),
    );
    const total_fare = Number(
      (base_fare + distance_fare + time_fare).toFixed(2),
    );
    if (
      ![base_fare, distance_fare, time_fare, total_fare].every(
        (value) => Number.isFinite(value) && value <= MAX_FARE_AMOUNT,
      )
    )
      throw new AppError(422, 'FARE_LIMIT_EXCEEDED', FARE_LIMIT_MESSAGE);
    return {
      vehicle_type: category.vehicle_type,
      vehicle_category_id: category.id,
      category_updated_at: category.updated_at.toISOString(),
      category_snapshot: {
        name: category.name,
        description: category.description,
        image_url: category.image_url,
        capacity: category.capacity,
        parent_name: category.parent?.name ?? null,
      },
      distance_m,
      duration_s,
      pickup_eta_s: DEFAULT_PICKUP_ETA_SECONDS,
      base_fare,
      distance_fare,
      time_fare,
      total_fare,
    };
  });
  return create_quote(user_id, input, calculations, expires_at, route.geometry);
};

export const submit_ride = async (user_id: string, input: CreateRideInput) => {
  const result = await request_ride(user_id, input);
  if (result.kind === 'ride_not_found')
    throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
  if (result.kind === 'quote_not_found')
    throw new AppError(404, 'QUOTE_NOT_FOUND', QUOTE_NOT_FOUND_MESSAGE);
  if (result.kind === 'quote_expired')
    throw new AppError(409, 'QUOTE_EXPIRED', QUOTE_EXPIRED_MESSAGE);
  if (result.kind === 'quote_unavailable')
    throw new AppError(
      409,
      'CATEGORY_UNAVAILABLE',
      CATEGORY_MESSAGES.UNAVAILABLE,
    );
  if (result.kind === 'invalid_state')
    throw new AppError(
      409,
      'RIDE_STATE_INVALID',
      'This ride has already been requested.',
    );
  if (result.kind === 'payment_method_not_found')
    throw new AppError(
      404,
      'PAYMENT_METHOD_NOT_FOUND',
      'Payment method was not found.',
    );
  return result.ride;
};

export const get_ride = async (user_id: string, ride_id: string) => {
  const ride = await find_ride_for_user(user_id, ride_id);
  if (!ride) throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
  return ride;
};

export const get_rides = (user_id: string, page: number, page_size: number) =>
  list_rides_for_user(
    user_id,
    (page - 1) * page_size,
    Math.min(page_size, MAX_PAGE_SIZE || DEFAULT_PAGE_SIZE),
  );

export const get_ride_events = async (user_id: string, ride_id: string) => {
  const events = await list_ride_events(user_id, ride_id);
  if (!events)
    throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
  return events;
};

export const get_ride_locations = async (user_id: string, ride_id: string) => {
  const locations = await list_ride_locations(user_id, ride_id);
  if (!locations)
    throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
  return locations;
};

export const cancel_user_ride = async (
  user_id: string,
  ride_id: string,
  input: CancelRideInput,
) => {
  const result = await cancel_ride(user_id, ride_id, input);
  if (result.kind === 'ride_not_found')
    throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
  if (result.kind === 'not_cancelable')
    throw new AppError(
      409,
      'RIDE_NOT_CANCELABLE',
      RIDE_CANNOT_BE_CANCELLED_MESSAGE,
    );
  return result.ride;
};

export const confirm_user_ride_start = async (
  user_id: string,
  ride_id: string,
) => {
  const result = await confirm_ride_start(user_id, ride_id);
  if (result.kind === 'ride_not_found')
    throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
  if (result.kind === 'not_startable')
    throw new AppError(
      409,
      'RIDE_STATE_INVALID',
      'Ride cannot be started from its current state',
    );
  return result.ride;
};

export const submit_review = async (
  user_id: string,
  ride_id: string,
  input: ReviewInput,
) => {
  const result = await create_review(user_id, ride_id, input);
  if (result.kind === 'ride_not_found')
    throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
  if (result.kind === 'not_completed')
    throw new AppError(
      409,
      'REVIEW_NOT_ALLOWED',
      REVIEW_ALLOWED_AFTER_COMPLETION_MESSAGE,
    );
  if (result.kind === 'invalid_recipient')
    throw new AppError(
      422,
      'REVIEW_RECIPIENT_INVALID',
      REVIEW_RECIPIENT_MESSAGE,
    );
  return result.review;
};

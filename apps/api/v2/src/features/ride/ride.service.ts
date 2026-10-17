import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VehicleCategoryRepository } from '../vehicle_category/vehicle_category.repo.js';
import { GeocodeService } from '../geocode/geocode.service.js';
import { RideRepository } from './ride.repo.js';
import { AppError } from '../../core/error.js';
import { REVIEW_RECIPIENT_MESSAGE } from './ride.constant.js';
import { MAX_FARE_AMOUNT, FARE_LIMIT_MESSAGE } from './ride.constant.js';
import { MAX_PAGE_SIZE } from '../../core/constants.js';
import {
  DEFAULT_PICKUP_ETA_SECONDS,
  QUOTE_EXPIRED_MESSAGE,
  QUOTE_LIFETIME_MINUTES,
  QUOTE_NOT_FOUND_MESSAGE,
  RIDE_CANNOT_BE_CANCELLED_MESSAGE,
  RIDE_NOT_FOUND_MESSAGE,
  REVIEW_ALLOWED_AFTER_COMPLETION_MESSAGE,
} from './ride.constant.js';
import { CATEGORY_MESSAGES } from '../vehicle_category/vehicle_category.constant.js';
import type {
  CancelRideInput,
  CreateRideInput,
  QuoteInput,
  ReviewInput,
} from './ride.type.js';
@Injectable()
export class RideService {
  constructor(
    private readonly vehicleCategoryRepository: VehicleCategoryRepository,
    private readonly geocodeService: GeocodeService,
    private readonly rideRepository: RideRepository,
  ) {}
  readonly build_quote = async (user_id: string, input: QuoteInput) => {
    const route = await this.geocodeService.driving_route({
      from_latitude: input.pickup.latitude,
      from_longitude: input.pickup.longitude,
      to_latitude: input.dropoff.latitude,
      to_longitude: input.dropoff.longitude,
    });
    const categories =
      await this.vehicleCategoryRepository.list_category_choices();
    if (categories.length === 0)
      throw new AppError(
        409,
        'CATEGORIES_UNAVAILABLE',
        CATEGORY_MESSAGES.EMPTY,
      );
    const distance_m = route.distance_m;
    const duration_s = route.duration_s;
    const expires_at = new Date(
      Date.now() + QUOTE_LIFETIME_MINUTES * 60 * 1000,
    );
    const calculations = categories.map((category) => {
      const base_fare = category.base_fare.toNumber();
      const distance_amount = category.per_kilometer
        .mul(distance_m)
        .div(1000)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const time_amount = category.per_minute
        .mul(duration_s)
        .div(60)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const distance_fare = distance_amount.toNumber();
      const time_fare = time_amount.toNumber();
      const total_fare = category.base_fare
        .plus(distance_amount)
        .plus(time_amount)
        .toNumber();
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
    return this.rideRepository.create_quote(
      user_id,
      input,
      calculations,
      expires_at,
      route.geometry,
    );
  };

  readonly submit_ride = async (user_id: string, input: CreateRideInput) => {
    const result = await this.rideRepository.request_ride(user_id, input);
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

  readonly get_ride = async (user_id: string, ride_id: string) => {
    const ride = await this.rideRepository.find_ride_for_user(user_id, ride_id);
    if (!ride)
      throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
    return ride;
  };

  readonly get_rides = (user_id: string, page: number, page_size: number) => {
    const size = Math.min(page_size, MAX_PAGE_SIZE);
    return this.rideRepository.list_rides_for_user(
      user_id,
      (page - 1) * size,
      size,
    );
  };

  readonly get_ride_events = async (user_id: string, ride_id: string) => {
    const events = await this.rideRepository.list_ride_events(user_id, ride_id);
    if (!events)
      throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
    return events;
  };

  readonly get_ride_locations = async (user_id: string, ride_id: string) => {
    const locations = await this.rideRepository.list_ride_locations(
      user_id,
      ride_id,
    );
    if (!locations)
      throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
    return locations;
  };

  readonly cancel_user_ride = async (
    user_id: string,
    ride_id: string,
    input: CancelRideInput,
  ) => {
    const result = await this.rideRepository.cancel_ride(
      user_id,
      ride_id,
      input,
    );
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

  readonly confirm_user_ride_start = async (
    user_id: string,
    ride_id: string,
  ) => {
    const result = await this.rideRepository.confirm_ride_start(
      user_id,
      ride_id,
    );
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

  readonly submit_review = async (
    user_id: string,
    ride_id: string,
    input: ReviewInput,
  ) => {
    const result = await this.rideRepository.create_review(
      user_id,
      ride_id,
      input,
    );
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
}

import { DriverOperationsService } from '../driver_operations/driver_operations.service.js';
import { Injectable } from '@nestjs/common';
import { VehicleCategoryRepository } from '../vehicle_category/vehicle_category.repo.js';
import { GeocodeService } from '../geocode/geocode.service.js';
import { AppConfigurationService } from '../app_configuration/app_configuration.service.js';
import {
  calculate_distance_fare,
  category_fare_values,
} from '../app_configuration/fare_calculation.js';
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
    private readonly appConfiguration: AppConfigurationService,
    private readonly operations: DriverOperationsService,
  ) {}
  readonly build_quote = async (user_id: string, input: QuoteInput) => {
    const fare_policy = await this.appConfiguration.fare_snapshot();
    const route = await this.geocodeService.driving_route({
      from_latitude: input.pickup.latitude,
      from_longitude: input.pickup.longitude,
      to_latitude: input.dropoff.latitude,
      to_longitude: input.dropoff.longitude,
    });
    const categories = (
      await this.vehicleCategoryRepository.list_category_choices()
    ).filter((category) => category_fare_values(category) !== null);
    if (categories.length === 0)
      throw new AppError(
        409,
        'CATEGORIES_UNAVAILABLE',
        'No enabled vehicle category has a configured fare. Ask your administrator to configure category fares.',
      );
    const distance_m = route.distance_m;
    const duration_s = route.duration_s;
    const expires_at = new Date(
      Date.now() + QUOTE_LIFETIME_MINUTES * 60 * 1000,
    );
    const calculations = categories.map((category) => {
      const rate = category_fare_values(category);
      if (!rate)
        throw new AppError(
          409,
          'FARE_POLICY_NOT_CONFIGURED',
          'Configure this vehicle category fare before quoting rides.',
        );
      const base_fare = 0;
      const distance_amount = calculate_distance_fare(distance_m, rate);
      const distance_fare = distance_amount.toNumber();
      const time_fare = 0;
      const total_fare = distance_fare;
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
        fare_policy_version: fare_policy.version,
        category_snapshot: {
          name: category.name,
          description: category.description,
          image_url: category.image_url,
          capacity: category.capacity,
          parent_name: category.parent?.name ?? null,
          fare_policy_version: fare_policy.version,
          fare_category_id: category.id,
          fare_category_updated_at: category.updated_at.toISOString(),
          ...rate,
          payment_policy: {
            cash_enabled: fare_policy.cash_enabled,
            direct_upi_enabled: fare_policy.direct_upi_enabled,
            online_payment_enabled: false,
            commission_percent: 0,
            free_cancellation_minutes: fare_policy.free_cancellation_minutes,
            free_pickup_wait_minutes: fare_policy.free_pickup_wait_minutes,
            cancellation_fee_percent:
              fare_policy.cancellation_fee_percent.toNumber(),
            maximum_cancellation_fee:
              fare_policy.maximum_cancellation_fee.toNumber(),
          },
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
    try {
      await this.operations.dispatch(result.ride.id);
    } catch {
      console.warn({ ride_id: result.ride.id, matching: 'DEFERRED_TO_POLL' });
    }
    return result.ride;
  };

  readonly get_ride = async (user_id: string, ride_id: string) => {
    let ride = await this.rideRepository.find_ride_for_user(user_id, ride_id);
    if (!ride)
      throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
    if (ride.status === 'SEARCHING') {
      // The visible rider status poll advances matching even if the action panel
      // is outside the viewport and there are no online driver dashboards.
      await this.operations.dispatch(ride_id);
      ride = await this.rideRepository.find_ride_for_user(user_id, ride_id);
      if (!ride)
        throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
    }
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
  ) =>
    this.operations.report_issue(
      user_id,
      ride_id,
      'CANCELLATION',
      input.cancel_reason,
    );

  readonly confirm_user_ride_start = async (user_id: string, ride_id: string) =>
    this.operations.start_proof(user_id, ride_id);

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

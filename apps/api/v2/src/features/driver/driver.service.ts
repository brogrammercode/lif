import { Injectable } from '@nestjs/common';
import { DriverRepository } from './driver.repo.js';
import { DriverOperationsService } from '../driver_operations/driver_operations.service.js';
import { trip_code_input } from '../driver_operations/driver_operations.type.js';
import { AppError } from '../../core/error.js';
import {
  DRIVER_NOT_VERIFIED_MESSAGE,
  DRIVER_PROFILE_NOT_FOUND_MESSAGE,
  OFFER_NOT_AVAILABLE_MESSAGE,
  OFFER_NOT_FOUND_MESSAGE,
} from './driver.constant.js';
import type {
  AvailabilityInput,
  DriverProfileInput,
  LocationInput,
  VehicleInput,
} from './driver.type.js';
@Injectable()
export class DriverService {
  constructor(
    private readonly driverRepository: DriverRepository,
    private readonly operations: DriverOperationsService,
  ) {}
  readonly get_driver_profile = async (user_id: string) => {
    const profile = await this.driverRepository.get_profile_by_user(user_id);
    if (!profile)
      throw new AppError(
        404,
        'DRIVER_PROFILE_NOT_FOUND',
        DRIVER_PROFILE_NOT_FOUND_MESSAGE,
      );
    return profile;
  };

  readonly submit_driver_profile = async (
    user_id: string,
    input: DriverProfileInput,
  ) => this.driverRepository.create_driver_profile(user_id, input);

  readonly update_driver_availability = async (
    user_id: string,
    input: AvailabilityInput,
  ) => {
    const profile = await this.get_driver_profile(user_id);
    if (
      input.availability === 'AVAILABLE' &&
      profile.verification_status !== 'VERIFIED'
    )
      throw new AppError(
        403,
        'DRIVER_NOT_VERIFIED',
        DRIVER_NOT_VERIFIED_MESSAGE,
      );
    const updated = await this.driverRepository.set_availability(
      user_id,
      input,
    );
    if (!updated)
      throw new AppError(
        404,
        'DRIVER_PROFILE_NOT_FOUND',
        DRIVER_PROFILE_NOT_FOUND_MESSAGE,
      );
    return updated;
  };

  readonly submit_vehicle = async (user_id: string, input: VehicleInput) => {
    const vehicle = await this.driverRepository.create_vehicle(user_id, input);
    if (!vehicle)
      throw new AppError(
        404,
        'DRIVER_PROFILE_NOT_FOUND',
        DRIVER_PROFILE_NOT_FOUND_MESSAGE,
      );
    return vehicle;
  };

  readonly update_driver_vehicle_category = (
    user_id: string,
    vehicle_id: string,
    category_id: string,
  ) =>
    this.driverRepository.change_vehicle_category(
      user_id,
      vehicle_id,
      category_id,
    );

  readonly update_active_vehicle = (user_id: string, vehicle_id: string) =>
    this.driverRepository.select_active_vehicle(user_id, vehicle_id);

  readonly get_driver_offers = async (user_id: string) =>
    (await this.operations.dashboard(user_id)).offers;

  readonly accept_driver_offer = async (user_id: string, offer_id: string) => {
    const result = await this.driverRepository.accept_offer(user_id, offer_id);
    if (result.kind === 'not_found')
      throw new AppError(404, 'OFFER_NOT_FOUND', OFFER_NOT_FOUND_MESSAGE);
    if (result.kind === 'not_available')
      throw new AppError(
        409,
        'OFFER_NOT_AVAILABLE',
        OFFER_NOT_AVAILABLE_MESSAGE,
      );
    return result.ride_id;
  };

  readonly reject_driver_offer = async (user_id: string, offer_id: string) => {
    if (!(await this.driverRepository.reject_offer(user_id, offer_id)))
      throw new AppError(404, 'OFFER_NOT_FOUND', OFFER_NOT_FOUND_MESSAGE);
  };

  readonly update_driver_location = async (
    user_id: string,
    input: LocationInput,
  ) => {
    const updated = await this.driverRepository.record_location(user_id, input);
    if (!updated)
      throw new AppError(
        404,
        'DRIVER_PROFILE_NOT_FOUND',
        DRIVER_PROFILE_NOT_FOUND_MESSAGE,
      );
    return updated;
  };

  readonly transition_driver_ride = async (
    user_id: string,
    ride_id: string,
    target: 'DRIVER_WAITING' | 'IN_PROGRESS' | 'COMPLETED',
    code?: string,
  ) => {
    if (target === 'DRIVER_WAITING')
      return this.operations.arrive(user_id, ride_id);
    if (target === 'COMPLETED')
      return this.operations.complete(user_id, ride_id);
    return this.operations.start_proof(
      user_id,
      ride_id,
      trip_code_input.parse({ code }).code,
    );
  };
}

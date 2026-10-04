import { AppError } from '../../core/error.js';
import { DRIVER_NOT_VERIFIED_MESSAGE, DRIVER_PROFILE_NOT_FOUND_MESSAGE, DRIVER_RIDE_NOT_FOUND_MESSAGE, DRIVER_RIDE_STATE_MESSAGE, OFFER_NOT_AVAILABLE_MESSAGE, OFFER_NOT_FOUND_MESSAGE } from './driver.constant.js';
import { accept_offer, create_driver_profile, create_vehicle, get_profile_by_user, list_offers, record_location, reject_offer, set_availability, transition_ride } from './driver.repo.js';
import type { AvailabilityInput, DriverProfileInput, LocationInput, VehicleInput } from './driver.type.js';

export const get_driver_profile = async (user_id: string) => {
  const profile = await get_profile_by_user(user_id);
  if (!profile) throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', DRIVER_PROFILE_NOT_FOUND_MESSAGE);
  return profile;
};

export const submit_driver_profile = async (user_id: string, input: DriverProfileInput) => create_driver_profile(user_id, input);

export const update_driver_availability = async (user_id: string, input: AvailabilityInput) => {
  const profile = await get_driver_profile(user_id);
  if (input.availability === 'AVAILABLE' && profile.verification_status !== 'VERIFIED') throw new AppError(403, 'DRIVER_NOT_VERIFIED', DRIVER_NOT_VERIFIED_MESSAGE);
  const updated = await set_availability(user_id, input);
  if (!updated) throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', DRIVER_PROFILE_NOT_FOUND_MESSAGE);
  return updated;
};

export const submit_vehicle = async (user_id: string, input: VehicleInput) => {
  const vehicle = await create_vehicle(user_id, input);
  if (!vehicle) throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', DRIVER_PROFILE_NOT_FOUND_MESSAGE);
  return vehicle;
};

export const get_driver_offers = (user_id: string) => list_offers(user_id);

export const accept_driver_offer = async (user_id: string, offer_id: string) => {
  const result = await accept_offer(user_id, offer_id);
  if (result.kind === 'not_found') throw new AppError(404, 'OFFER_NOT_FOUND', OFFER_NOT_FOUND_MESSAGE);
  if (result.kind === 'not_available') throw new AppError(409, 'OFFER_NOT_AVAILABLE', OFFER_NOT_AVAILABLE_MESSAGE);
  return result.ride_id;
};

export const reject_driver_offer = async (user_id: string, offer_id: string) => {
  if (!(await reject_offer(user_id, offer_id))) throw new AppError(404, 'OFFER_NOT_FOUND', OFFER_NOT_FOUND_MESSAGE);
};

export const update_driver_location = async (user_id: string, input: LocationInput) => {
  const updated = await record_location(user_id, input);
  if (!updated) throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', DRIVER_PROFILE_NOT_FOUND_MESSAGE);
  return updated;
};

export const transition_driver_ride = async (user_id: string, ride_id: string, target: 'DRIVER_WAITING' | 'IN_PROGRESS' | 'COMPLETED') => {
  const result = await transition_ride(user_id, ride_id, target);
  if (result.kind === 'not_found') throw new AppError(404, 'DRIVER_RIDE_NOT_FOUND', DRIVER_RIDE_NOT_FOUND_MESSAGE);
  if (result.kind === 'invalid_state') throw new AppError(409, 'DRIVER_RIDE_STATE', DRIVER_RIDE_STATE_MESSAGE);
  return result.ride;
};

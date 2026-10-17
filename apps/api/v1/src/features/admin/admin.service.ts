import { AppError } from '../../core/error.js';
import { DRIVER_NOT_ELIGIBLE_MESSAGE, DRIVER_PROFILE_NOT_FOUND_MESSAGE, RIDE_NOT_FOUND_MESSAGE, RIDE_NOT_SEARCHING_MESSAGE, RIDE_OFFER_EXISTS_MESSAGE } from './admin.constant.js';
import { create_ride_offer, update_driver_verification } from './admin.repo.js';
import type { OfferInput, VerificationInput } from './admin.type.js';

export const verify_driver = async (actor_id: string, driver_id: string, input: VerificationInput) => {
  const result = await update_driver_verification(actor_id, driver_id, input);
  if (result.kind === 'not_found') throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', DRIVER_PROFILE_NOT_FOUND_MESSAGE);
  return result.profile;
};

export const dispatch_ride_offer = async (actor_id: string, ride_id: string, input: OfferInput) => {
  const result = await create_ride_offer(actor_id, ride_id, input);
  if (result.kind === 'ride_not_found') throw new AppError(404, 'RIDE_NOT_FOUND', RIDE_NOT_FOUND_MESSAGE);
  if (result.kind === 'ride_not_searching') throw new AppError(409, 'RIDE_NOT_SEARCHING', RIDE_NOT_SEARCHING_MESSAGE);
  if (result.kind === 'driver_not_found') throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', DRIVER_PROFILE_NOT_FOUND_MESSAGE);
  if (result.kind === 'driver_not_eligible') throw new AppError(409, 'DRIVER_NOT_ELIGIBLE', DRIVER_NOT_ELIGIBLE_MESSAGE);
  if (result.kind === 'offer_exists') throw new AppError(409, 'RIDE_OFFER_EXISTS', RIDE_OFFER_EXISTS_MESSAGE);
  return result.offer;
};

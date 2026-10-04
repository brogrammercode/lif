import { Prisma } from '@prisma/client';
import { prisma } from '../../infra/database/client.js';
import { create_user_log } from '../../infra/database/user_log.js';
import type { OfferInput, VerificationInput } from './admin.type.js';

export const update_driver_verification = async (actor_id: string, driver_id: string, input: VerificationInput) =>
  prisma.$transaction(async (tx) => {
    const profile = await tx.driverProfile.findUnique({ where: { id: driver_id } });
    if (!profile) return { kind: 'not_found' as const };
    const updated = await tx.driverProfile.update({
      where: { id: driver_id },
      data: { verification_status: input.status, verified_at: input.status === 'VERIFIED' ? new Date() : null },
    });
    await create_user_log(tx, {
      actor_id,
      entity_type: 'DriverProfile',
      entity_id: driver_id,
      action: 'UPDATE_DRIVER_VERIFICATION',
      before_data: { verification_status: profile.verification_status } as Prisma.InputJsonObject,
      after_data: { verification_status: updated.verification_status } as Prisma.InputJsonObject,
    });
    return { kind: 'success' as const, profile: updated };
  });

export const create_ride_offer = async (actor_id: string, ride_id: string, input: OfferInput) =>
  prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findUnique({ where: { id: ride_id } });
    if (!ride) return { kind: 'ride_not_found' as const };
    if (ride.status !== 'SEARCHING') return { kind: 'ride_not_searching' as const };
    const driver = await tx.driverProfile.findUnique({ where: { id: input.driver_id } });
    if (!driver) return { kind: 'driver_not_found' as const };
    if (driver.verification_status !== 'VERIFIED' || driver.availability !== 'AVAILABLE') return { kind: 'driver_not_eligible' as const };
    const existing = await tx.rideOffer.findUnique({ where: { ride_id_driver_id: { ride_id, driver_id: input.driver_id } } });
    if (existing) return { kind: 'offer_exists' as const };
    const offer = await tx.rideOffer.create({ data: { ride_id, driver_id: input.driver_id, expires_at: new Date(Date.now() + input.expires_in_minutes * 60 * 1000) } });
    await create_user_log(tx, {
      actor_id,
      entity_type: 'RideOffer',
      entity_id: offer.id,
      action: 'CREATE_RIDE_OFFER',
      after_data: { ride_id, driver_id: input.driver_id, expires_at: offer.expires_at } as unknown as Prisma.InputJsonObject,
    });
    return { kind: 'success' as const, offer };
  });

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { Prisma } from '@prisma/client';
import { create_user_log } from '../../infra/database/user_log.js';
import type { OfferInput, VerificationInput } from './admin.type.js';
import {
  is_vehicle_eligible,
  MATCHING_VEHICLE_INCLUDE,
} from '../vehicle_category/vehicle_category.security.js';
@Injectable()
export class AdminRepository {
  constructor(private readonly prismaService: PrismaService) {}
  readonly update_driver_verification = async (
    actor_id: string,
    driver_id: string,
    input: VerificationInput,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      const initial = await tx.driverProfile.findUnique({
        where: { id: driver_id },
        select: { user_id: true },
      });
      if (!initial) return { kind: 'not_found' as const };
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${initial.user_id}))`;
      const profile = await tx.driverProfile.findUnique({
        where: { id: driver_id },
      });
      if (!profile) return { kind: 'not_found' as const };
      const updated = await tx.driverProfile.update({
        where: { id: driver_id },
        data: {
          verification_status: input.status,
          verified_at: input.status === 'VERIFIED' ? new Date() : null,
          availability:
            input.status === 'VERIFIED' ||
            ['EN_ROUTE', 'ON_TRIP'].includes(profile.availability)
              ? profile.availability
              : 'OFFLINE',
        },
      });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'DriverProfile',
        entity_id: driver_id,
        action: 'UPDATE_DRIVER_VERIFICATION',
        before_data: {
          verification_status: profile.verification_status,
          availability: profile.availability,
        } as Prisma.InputJsonObject,
        after_data: {
          verification_status: updated.verification_status,
          availability: updated.availability,
        } as Prisma.InputJsonObject,
      });
      return { kind: 'success' as const, profile: updated };
    });

  readonly create_ride_offer = async (
    actor_id: string,
    ride_id: string,
    input: OfferInput,
  ) =>
    this.prismaService.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${ride_id}))`;
        const ride = await tx.ride.findUnique({
          where: { id: ride_id },
          include: { quotes: { where: { selected_at: { not: null } } } },
        });
        if (!ride) return { kind: 'ride_not_found' as const };
        if (ride.status !== 'SEARCHING')
          return { kind: 'ride_not_searching' as const };
        const initial_driver = await tx.driverProfile.findUnique({
          where: { id: input.driver_id },
          select: { user_id: true },
        });
        if (!initial_driver) return { kind: 'driver_not_found' as const };
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${initial_driver.user_id}))`;
        const driver = await tx.driverProfile.findUnique({
          where: { id: input.driver_id },
          include: {
            user: { select: { status: true } },
            active_vehicle: { include: MATCHING_VEHICLE_INCLUDE },
          },
        });
        if (!driver) return { kind: 'driver_not_found' as const };
        if (
          driver.verification_status !== 'VERIFIED' ||
          driver.availability !== 'AVAILABLE'
        )
          return { kind: 'driver_not_eligible' as const };
        const selected_quote = ride.quotes[0];
        if (
          driver.user.status !== 'ACTIVE' ||
          !is_vehicle_eligible(driver.active_vehicle, selected_quote, driver.id)
        )
          return { kind: 'driver_not_eligible' as const };
        const existing = await tx.rideOffer.findUnique({
          where: { ride_id_driver_id: { ride_id, driver_id: input.driver_id } },
        });
        if (existing) return { kind: 'offer_exists' as const };
        const offer = await tx.rideOffer.create({
          data: {
            ride_id,
            driver_id: input.driver_id,
            expires_at: new Date(
              Date.now() + input.expires_in_minutes * 60 * 1000,
            ),
          },
        });
        await create_user_log(tx, {
          actor_id,
          entity_type: 'RideOffer',
          entity_id: offer.id,
          action: 'CREATE_RIDE_OFFER',
          after_data: {
            ride_id,
            driver_id: input.driver_id,
            expires_at: offer.expires_at,
          } as unknown as Prisma.InputJsonObject,
        });
        return { kind: 'success' as const, offer };
      },
      { maxWait: 10000, timeout: 15000 },
    );
}

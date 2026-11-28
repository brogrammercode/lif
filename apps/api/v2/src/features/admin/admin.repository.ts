import { Injectable } from '@nestjs/common';
import { nextEntityId } from '../../database/entity-id.js';
import { PostgresService } from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import { is_vehicle_eligible } from '../vehicle_category/vehicle_category.security.js';
import type { OfferInput, VerificationInput } from './dto/admin.dto.js';
import { adminSql } from './sql/admin.sql.js';

type Verification = { verification_status: string; availability: string };
type MatchingVehicle = Parameters<typeof is_vehicle_eligible>[0];
type MatchingQuote = NonNullable<Parameters<typeof is_vehicle_eligible>[1]>;

@Injectable()
export class AdminRepository {
  constructor(private readonly db: PostgresService) {}

  update_driver_verification(
    actorId: string,
    driverId: string,
    input: VerificationInput,
  ) {
    return this.db.transaction(async (tx) => {
      const user = (
        await tx.query<{ user_id: string }>(adminSql.driverUser, [driverId])
      ).rows[0];
      if (!user) return { kind: 'not_found' as const };
      await tx.query('SELECT pg_advisory_xact_lock(720043, hashtext($1))', [
        user.user_id,
      ]);
      const before = (
        await tx.query<Verification>(adminSql.verification, [driverId])
      ).rows[0];
      if (!before) return { kind: 'not_found' as const };
      const after = (
        await tx.query<Verification & Record<string, unknown>>(
          adminSql.verify,
          [driverId, input.status],
        )
      ).rows[0]!;
      await insertUserLog(tx, {
        actor_id: actorId,
        entity_type: 'DriverProfile',
        entity_id: driverId,
        action: 'UPDATE_DRIVER_VERIFICATION',
        before_data: before,
        after_data: {
          verification_status: after.verification_status,
          availability: after.availability,
        },
      });
      return { kind: 'success' as const, profile: after };
    });
  }

  create_ride_offer(actorId: string, rideId: string, input: OfferInput) {
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
      await tx.query('SELECT pg_advisory_xact_lock(720044, hashtext($1))', [
        rideId,
      ]);
      const ride = (await tx.query<{ status: string }>(adminSql.ride, [rideId]))
        .rows[0];
      if (!ride) return { kind: 'ride_not_found' as const };
      if (ride.status !== 'SEARCHING')
        return { kind: 'ride_not_searching' as const };
      const quote = (
        await tx.query<MatchingQuote>(adminSql.selectedQuote, [rideId])
      ).rows[0];
      const user = (
        await tx.query<{ user_id: string }>(adminSql.driverUser, [
          input.driver_id,
        ])
      ).rows[0];
      if (!user) return { kind: 'driver_not_found' as const };
      await tx.query('SELECT pg_advisory_xact_lock(720043, hashtext($1))', [
        user.user_id,
      ]);
      const driver = (
        await tx.query<
          Verification & { user_status: string; vehicle: MatchingVehicle }
        >(adminSql.matchingDriver, [input.driver_id])
      ).rows[0];
      if (!driver) return { kind: 'driver_not_found' as const };
      if (
        driver.verification_status !== 'VERIFIED' ||
        driver.availability !== 'AVAILABLE' ||
        driver.user_status !== 'ACTIVE' ||
        !is_vehicle_eligible(driver.vehicle, quote, input.driver_id)
      )
        return { kind: 'driver_not_eligible' as const };
      const offer = (
        await tx.query<{ id: string; expires_at: Date }>(adminSql.offer, [
          nextEntityId(),
          rideId,
          input.driver_id,
          new Date(Date.now() + input.expires_in_minutes * 60000),
        ])
      ).rows[0];
      if (!offer) return { kind: 'offer_exists' as const };
      await insertUserLog(tx, {
        actor_id: actorId,
        entity_type: 'RideOffer',
        entity_id: offer.id,
        action: 'CREATE_RIDE_OFFER',
        after_data: {
          ride_id: rideId,
          driver_id: input.driver_id,
          expires_at: offer.expires_at,
        },
      });
      return { kind: 'success' as const, offer };
    });
  }
}

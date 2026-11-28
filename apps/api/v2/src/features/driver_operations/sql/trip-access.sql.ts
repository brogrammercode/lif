import { AppError } from '../../../core/error.js';
import {
  requireActiveAccount,
  requireDriverParticipation,
} from '../../../database/account-locks.js';
import type {
  PostgresService,
  SqlClient,
} from '../../../database/postgres.service.js';

export type RideAccess = {
  id: string;
  rider_id: string;
  driver_user_id: string | null;
  status: string;
  pickup_latitude: string;
  pickup_longitude: string;
  dropoff_latitude: string;
  dropoff_longitude: string;
  current_latitude: string | null;
  current_longitude: string | null;
  last_location_at: Date | null;
  last_location_accuracy_m: number | null;
  driver_phone: string | null;
  rider_phone: string | null;
  payment_status: string | null;
};

const ownedRideAccess = `SELECT r.id,r.rider_id,d.user_id AS driver_user_id,r.status,
  r.pickup_latitude,r.pickup_longitude,r.dropoff_latitude,r.dropoff_longitude,
  d.current_latitude,d.current_longitude,d.last_location_at,d.last_location_accuracy_m,
  u.phone_e164 AS driver_phone,ru.phone_e164 AS rider_phone,p.status AS payment_status
  FROM rides r LEFT JOIN driver_profiles d ON d.id=r.driver_id LEFT JOIN users u ON u.id=d.user_id
  JOIN users ru ON ru.id=r.rider_id LEFT JOIN payments p ON p.ride_id=r.id
  WHERE r.id=$1 AND (r.rider_id=$2 OR d.user_id=$2)`;

export async function readRideAccess(
  db: SqlClient,
  rideId: string,
  userId: string,
) {
  const {
    rows: [trip],
  } = await db.query<RideAccess>(ownedRideAccess, [rideId, userId]);
  if (!trip)
    throw new AppError(
      404,
      'RIDE_NOT_FOUND',
      'This trip is not available to your account.',
    );
  return trip;
}

export function writeRideAccess<T>(
  db: PostgresService,
  rideId: string,
  userId: string,
  action: (tx: SqlClient, trip: RideAccess) => Promise<T>,
  driverOnly = false,
) {
  return db.transaction(
    async (tx) => {
      await requireActiveAccount(tx, userId);
      await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
      await tx.query('SELECT pg_advisory_xact_lock(720044,hashtext($1))', [
        rideId,
      ]);
      const trip = await readRideAccess(tx, rideId, userId);
      if (driverOnly && trip.driver_user_id !== userId)
        throw new AppError(
          403,
          'ASSIGNED_DRIVER_REQUIRED',
          'Only the assigned driver can perform this action.',
        );
      if (trip.driver_user_id) {
        await tx.query('SELECT pg_advisory_xact_lock(720043,hashtext($1))', [
          trip.driver_user_id,
        ]);
        if (driverOnly) await requireDriverParticipation(tx, userId);
        return action(tx, await readRideAccess(tx, rideId, userId));
      }
      return action(tx, trip);
    },
    'READ COMMITTED',
    { checkoutMs: 10000, statementMs: 30000 },
  );
}

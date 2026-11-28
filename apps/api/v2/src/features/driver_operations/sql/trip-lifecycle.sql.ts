import { nextEntityId } from '../../../database/entity-id.js';
import type { SqlClient } from '../../../database/postgres.service.js';
import { new_trip_code } from '../trip.rules.js';

export async function resetTripVerification(
  tx: SqlClient,
  rideId: string,
  driverId: string,
  assignmentAt: Date,
) {
  const code = new_trip_code(rideId);
  await tx.query(
    `INSERT INTO ride_start_verifications
    (ride_id,driver_id,assignment_at,code_hash,code_ciphertext,expires_at,attempts,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,0,clock_timestamp())
    ON CONFLICT (ride_id) DO UPDATE SET driver_id=EXCLUDED.driver_id,assignment_at=EXCLUDED.assignment_at,
      code_hash=EXCLUDED.code_hash,code_ciphertext=EXCLUDED.code_ciphertext,expires_at=EXCLUDED.expires_at,
      attempts=0,rider_confirmed_at=NULL,driver_verified_at=NULL,used_at=NULL,updated_at=clock_timestamp()`,
    [
      rideId,
      driverId,
      assignmentAt,
      code.code_hash,
      code.code_ciphertext,
      code.expires_at,
    ],
  );
}

export async function recordTripEvent(
  tx: SqlClient,
  rideId: string,
  actorId: string,
  eventType: string,
  metadata?: unknown,
) {
  await tx.query(
    `INSERT INTO ride_events (id,ride_id,actor_id,event_type,metadata,updated_at)
    VALUES ($1,$2,$3,$4,$5::jsonb,clock_timestamp())`,
    [nextEntityId(), rideId, actorId, eventType, JSON.stringify(metadata)],
  );
}

export async function notifyTripParticipant(
  tx: SqlClient,
  userId: string,
  rideId: string,
  title: string,
  body: string,
) {
  await tx.query(
    `INSERT INTO notifications (id,user_id,type,title,body,data,updated_at)
    VALUES ($1,$2,'RIDE_UPDATE',$3,$4,jsonb_build_object('ride_id',$5::text),clock_timestamp())`,
    [nextEntityId(), userId, title, body, rideId],
  );
}

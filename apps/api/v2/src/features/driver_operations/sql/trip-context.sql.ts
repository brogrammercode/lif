import {
  participantJoins,
  rideColumns,
} from '../../ride/sql/rider-rides.sql.js';
import { receiptVehicle } from '../../travel_context/sql/travel-context.sql.js';
import {
  matchingJoins,
  matchingVehicleProjection,
} from '../../driver/sql/driver-profile.sql.js';

const iso = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const person = (alias: 'ru' | 'du') => `jsonb_build_object(
  'id',${alias}.id,'first_name',${alias}.first_name,'last_name',${alias}.last_name,
  'avatar_url',${alias}.avatar_url,'phone_e164',${alias}.phone_e164,'status',${alias}.status
)`;

export const tripContextSnapshot = `SELECT ${rideColumns},${person('ru')} AS rider,
  ${receiptVehicle} AS vehicle, to_jsonb(route) || jsonb_build_object(
    'created_at',${iso('route.created_at')},'updated_at',${iso('route.updated_at')}) AS route,
  CASE WHEN d.id IS NOT NULL THEN jsonb_build_object(
    'id',d.id,'user_id',d.user_id,'availability',d.availability,'user',${person('du')},
    'verification_status',d.verification_status,'active_vehicle',selected_vehicle.details,
    'rating_average',trim_scale(d.rating_average)::text,'ratings_count',d.ratings_count,
    'last_location_at',${iso('d.last_location_at')},'last_location_accuracy_m',d.last_location_accuracy_m,
    'current_latitude',trim_scale(d.current_latitude)::text,'current_longitude',trim_scale(d.current_longitude)::text
  ) END AS driver,
  CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(
    'id',p.id,'status',p.status,'provider',p.provider,'provider_payment_id',p.provider_payment_id,
    'recipient_upi',p.recipient_upi,'collection_method',p.collection_method,'unpaid_reason',p.unpaid_reason,
    'amount',trim_scale(p.amount)::text,'updated_at',${iso('p.updated_at')}
  ) END AS payment,
  to_jsonb(proof) AS start_verification,
  to_jsonb(review) || jsonb_build_object('fee_amount',trim_scale(review.fee_amount)::text,
    'created_at',${iso('review.created_at')},'updated_at',${iso('review.updated_at')}) AS settlement_review,
  COALESCE((SELECT jsonb_agg(to_jsonb(q) || jsonb_build_object(
    'base_fare',trim_scale(q.base_fare)::text,'distance_fare',trim_scale(q.distance_fare)::text,
    'time_fare',trim_scale(q.time_fare)::text,'total_fare',trim_scale(q.total_fare)::text,
    'surge_multiplier',trim_scale(q.surge_multiplier)::text,
    'created_at',${iso('q.created_at')},'updated_at',${iso('q.updated_at')},
    'expires_at',${iso('q.expires_at')},'selected_at',${iso('q.selected_at')}
  ) ORDER BY q.created_at,q.id) FROM fare_quotes q
    WHERE q.ride_id=r.id AND q.selected_at IS NOT NULL),'[]'::jsonb) AS quotes,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'created_at',${iso('e.created_at')})
    ORDER BY e.created_at DESC,e.id DESC) FROM (
      SELECT id,event_type,created_at FROM ride_events WHERE ride_id=r.id ORDER BY created_at DESC,id DESC LIMIT 200
    ) e),'[]'::jsonb) AS events,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',rv.id,'reviewer_id',rv.reviewer_id,'score',rv.score,'comment',rv.comment))
    FROM reviews rv WHERE rv.ride_id=r.id),'[]'::jsonb) AS reviews,
  EXISTS(SELECT 1 FROM rides other WHERE other.driver_id=d.id AND
    other.status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_WAITING','IN_PROGRESS')) AS has_active_trip,
  EXISTS(SELECT 1 FROM ride_events ce WHERE ce.ride_id=r.id AND ce.actor_id=$2 AND
    ce.event_type='CALL_ATTEMPT' AND ce.created_at>=r.arrived_at) AS contact_attempted,
  w.available_paise::text AS wallet_available,
  ps.wallet_ride_collection_enabled AS wallet_enabled,
  ps.razorpay_ride_upi_enabled AS razorpay_upi_enabled
  FROM rides r ${participantJoins} JOIN users ru ON ru.id=r.rider_id
  LEFT JOIN LATERAL (SELECT ${matchingVehicleProjection()} AS details FROM vehicles v
    ${matchingJoins} WHERE v.id=d.active_vehicle_id) selected_vehicle ON TRUE
  LEFT JOIN ride_routes route ON route.ride_id=r.id
  LEFT JOIN ride_start_verifications proof ON proof.ride_id=r.id
  LEFT JOIN ride_settlement_reviews review ON review.ride_id=r.id
  LEFT JOIN wallets w ON r.status='COMPLETED' AND r.rider_id=$2 AND w.user_id=$2 AND w.kind='RIDER'
  LEFT JOIN payout_schedules ps ON r.status='COMPLETED' AND ps.id='default'
  WHERE r.id=$1 AND (r.rider_id=$2 OR d.user_id=$2)`;

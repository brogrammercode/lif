import {
  receiptDriver,
  receiptVehicle,
} from '../../travel_context/sql/travel-context.sql.js';

export const rideColumns = `r.*,
  trim_scale(r.pickup_latitude)::text AS pickup_latitude,
  trim_scale(r.pickup_longitude)::text AS pickup_longitude,
  trim_scale(r.dropoff_latitude)::text AS dropoff_latitude,
  trim_scale(r.dropoff_longitude)::text AS dropoff_longitude,
  trim_scale(r.estimated_fare)::text AS estimated_fare,
  trim_scale(r.final_fare)::text AS final_fare`;

export const rideParticipants = `${receiptDriver} AS driver,${receiptVehicle} AS vehicle,
  CASE WHEN p.id IS NOT NULL THEN to_jsonb(p) || jsonb_build_object(
    'amount',trim_scale(p.amount)::text,
    'paid_at',to_char(p.paid_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'failed_at',to_char(p.failed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'refunded_at',to_char(p.refunded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'created_at',to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updated_at',to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) END AS payment`;

export const participantJoins = `LEFT JOIN payments p ON p.ride_id=r.id
  LEFT JOIN driver_profiles d ON d.id=r.driver_id LEFT JOIN users du ON du.id=d.user_id
  LEFT JOIN vehicles v ON v.id=r.vehicle_id LEFT JOIN vehicle_brands b ON b.id=v.brand_id`;

export const quoteRows = `SELECT q.*,trim_scale(q.base_fare)::text AS base_fare,
  trim_scale(q.distance_fare)::text AS distance_fare,trim_scale(q.time_fare)::text AS time_fare,
  trim_scale(q.total_fare)::text AS total_fare,trim_scale(q.surge_multiplier)::text AS surge_multiplier
  FROM fare_quotes q WHERE q.ride_id=$1 ORDER BY q.created_at,q.id`;
export const eligibleCategories = `
  FROM vehicle_categories c LEFT JOIN vehicle_categories p ON p.id=c.parent_id
  WHERE c.is_active AND (c.parent_id IS NULL OR p.is_active)
    AND NOT EXISTS(SELECT 1 FROM vehicle_categories child WHERE child.parent_id=c.id)`;
export const insertQuoteRows = `
  INSERT INTO fare_quotes (id,ride_id,vehicle_type,vehicle_category_id,category_snapshot,distance_m,duration_s,
    pickup_eta_s,base_fare,distance_fare,time_fare,total_fare,currency,expires_at,updated_at)
  SELECT id,$1,vehicle_type::"VehicleType",vehicle_category_id,category_snapshot,distance_m,duration_s,
    pickup_eta_s,base_fare,distance_fare,time_fare,total_fare,$2,$3,clock_timestamp()
  FROM jsonb_to_recordset($4::jsonb) AS q(id text,vehicle_type text,vehicle_category_id text,
    category_snapshot jsonb,distance_m int,duration_s int,pickup_eta_s int,base_fare numeric,
    distance_fare numeric,time_fare numeric,total_fare numeric)`;

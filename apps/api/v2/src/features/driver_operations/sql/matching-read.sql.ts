import {
  matchingJoins,
  matchingVehicleProjection,
} from '../../driver/sql/driver-profile.sql.js';

export const matchingSettings = `SELECT arrival_radius_m,location_max_age_s,matching_initial_radius_km,
  matching_max_radius_km,matching_expansion_s,search_timeout_s,offer_lifetime_s
  FROM ride_fare_policies WHERE key='default'`;

export const availabilityDraftQuote = `SELECT r.pickup_latitude,r.pickup_longitude,
  q.vehicle_category_id,q.vehicle_type,q.category_snapshot
  FROM rides r JOIN users u ON u.id=r.rider_id
  JOIN fare_quotes q ON q.ride_id=r.id
  WHERE r.id=$1 AND r.rider_id=$2 AND r.status='DRAFT'
    AND u.status='ACTIVE' AND u.deleted_at IS NULL
    AND q.id=$3 AND q.expires_at>statement_timestamp()`;

export const availabilityDrivers = `SELECT p.id,p.user_id,p.current_latitude,p.current_longitude,
  trim_scale(p.rating_average)::text AS rating_average,p.ratings_count,u.first_name,u.avatar_url,
  ${matchingVehicleProjection()} AS active_vehicle
  FROM driver_profiles p JOIN users u ON u.id=p.user_id
  JOIN vehicles v ON v.id=p.active_vehicle_id
  ${matchingJoins}
  LEFT JOIN partner_applications a ON a.current_user_id=p.user_id
  WHERE p.user_id<>$1 AND p.verification_status='VERIFIED' AND p.availability='AVAILABLE'
    AND p.current_latitude BETWEEN $2 AND $3 AND p.current_longitude BETWEEN $4 AND $5
    AND p.last_location_at >= $6 AND p.last_location_accuracy_m <= $7
    AND v.status='ACTIVE' AND v.vehicle_category_id=$8 AND v.capacity >= $9
    AND u.status='ACTIVE' AND u.deleted_at IS NULL
    AND (a.id IS NULL OR a.status='ACTIVATED')
    AND NOT EXISTS (SELECT 1 FROM rides r WHERE r.driver_id=p.id
      AND r.status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_WAITING','IN_PROGRESS'))
  ORDER BY p.last_location_at DESC,p.id LIMIT 100`;

export const dashboardDispatchQueue = `SELECT id FROM rides WHERE status='SEARCHING'
  AND (next_dispatch_at IS NULL OR next_dispatch_at <= statement_timestamp())
  ORDER BY requested_at,id LIMIT 3`;

export const dashboardOffers = `SELECT o.id,o.expires_at,jsonb_build_object(
  'id',r.id,'pickup_address',r.pickup_address,'pickup_latitude',trim_scale(r.pickup_latitude)::text,
  'pickup_longitude',trim_scale(r.pickup_longitude)::text,'dropoff_address',r.dropoff_address,
  'dropoff_latitude',trim_scale(r.dropoff_latitude)::text,'dropoff_longitude',trim_scale(r.dropoff_longitude)::text,
  'estimated_fare',trim_scale(r.estimated_fare)::text,'estimated_distance_m',r.estimated_distance_m,
  'estimated_duration_s',r.estimated_duration_s,'passenger_count',r.passenger_count,'rider_note',r.rider_note,
  'rider',jsonb_build_object('id',u.id,'first_name',u.first_name,'last_name',u.last_name,'avatar_url',u.avatar_url)
) AS ride
  FROM ride_offers o JOIN rides r ON r.id=o.ride_id JOIN users u ON u.id=r.rider_id
  WHERE o.driver_id=$1 AND o.status='SENT' AND o.expires_at>statement_timestamp() AND r.status='SEARCHING'
  ORDER BY o.sent_at DESC,o.id DESC LIMIT 20`;

export const dispatchRide = `SELECT r.status,r.rider_id,r.pickup_latitude,r.pickup_longitude,
  r.requested_at,r.created_at,r.next_dispatch_at,r.collection_preference,r.passenger_count,
  (SELECT jsonb_build_object('vehicle_category_id',q.vehicle_category_id,
    'vehicle_type',q.vehicle_type,'category_snapshot',q.category_snapshot)
    FROM fare_quotes q WHERE q.ride_id=r.id AND q.selected_at IS NOT NULL
    ORDER BY q.created_at,q.id LIMIT 1) AS quote
  FROM rides r WHERE r.id=$1`;

export const dispatchCandidates = `SELECT p.id,p.user_id,p.availability,p.current_latitude,p.current_longitude,
  ${matchingVehicleProjection()} AS active_vehicle
  FROM driver_profiles p JOIN users u ON u.id=p.user_id JOIN vehicles v ON v.id=p.active_vehicle_id
  ${matchingJoins}
  LEFT JOIN partner_applications a ON a.current_user_id=p.user_id
  WHERE p.user_id<>$1 AND p.verification_status='VERIFIED' AND p.availability IN ('AVAILABLE','ON_TRIP')
    AND p.current_latitude BETWEEN $2 AND $3 AND p.current_longitude BETWEEN $4 AND $5
    AND p.last_location_at >= $6 AND p.last_location_accuracy_m <= $7
    AND v.status='ACTIVE' AND v.vehicle_category_id=$8
    AND u.status='ACTIVE' AND u.deleted_at IS NULL AND (a.id IS NULL OR a.status='ACTIVATED')
  ORDER BY p.availability,p.last_location_at DESC,p.id LIMIT 100`;

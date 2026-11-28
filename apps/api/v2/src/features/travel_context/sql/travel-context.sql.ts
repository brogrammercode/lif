const summary =
  'r.id, r.status, r.pickup_address, r.dropoff_address, r.requested_at, r.created_at';
const distances = 'r.actual_distance_m, r.estimated_distance_m';
const fare = `trim_scale(r.final_fare)::text AS final_fare,
  trim_scale(r.estimated_fare)::text AS estimated_fare, r.currency`;
const coordinates = `trim_scale(r.pickup_latitude)::text AS pickup_latitude,
  trim_scale(r.pickup_longitude)::text AS pickup_longitude,
  trim_scale(r.dropoff_latitude)::text AS dropoff_latitude,
  trim_scale(r.dropoff_longitude)::text AS dropoff_longitude`;
const iso = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const farePayment = `'status', p.status, 'amount', trim_scale(p.amount)::text,
  'collection_method', p.collection_method`;
const fullPayment = `CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(
  ${farePayment}, 'paid_at', ${iso('p.paid_at')}, 'refunded_at', ${iso('p.refunded_at')},
  'provider', p.provider) END AS payment`;
const passenger = (alias: string) =>
  `jsonb_build_object('id', ${alias}.id, 'first_name', ${alias}.first_name,
  'last_name', ${alias}.last_name, 'avatar_url', ${alias}.avatar_url)`;
const vehicle = `'id', v.id, 'make', v.make, 'model', v.model, 'plate_number', v.plate_number,
  'color', v.color, 'type', v.type`;
export const receiptDriver = `CASE WHEN d.id IS NOT NULL THEN jsonb_build_object('id', d.id,
  'user_id', d.user_id, 'rating_average', trim_scale(d.rating_average)::text,
  'ratings_count', d.ratings_count, 'user', ${passenger('du')}) END`;
export const receiptVehicle = `CASE WHEN v.id IS NOT NULL THEN jsonb_build_object(${vehicle},
  'capacity', v.capacity, 'photo_url', v.photo_url, 'brand',
  CASE WHEN b.id IS NOT NULL THEN jsonb_build_object('name', b.name, 'logo_url', b.logo_url) END) END`;
const resumable = (activeStatuses: string) =>
  `(r.status IN (${activeStatuses}) OR (
    r.status = 'COMPLETED' AND r.driver_id IS NOT NULL AND r.final_fare > 0
    AND (p.id IS NULL OR p.status IN ('PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'FAILED'))
  ))`;
const driverActiveStatuses = [
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_WAITING',
  'IN_PROGRESS',
];
export const riderActiveStatuses = [
  'REQUESTED',
  'SEARCHING',
  ...driverActiveStatuses,
];
const driverActive = driverActiveStatuses
  .map((status) => `'${status}'`)
  .join(', ');
const riderActive = riderActiveStatuses
  .map((status) => `'${status}'`)
  .join(', ');
const resumableOrder =
  'r.completed_at ASC NULLS FIRST, r.created_at ASC, r.id ASC';
export const driverResumableRideId = `SELECT r.id,r.status FROM rides r
  LEFT JOIN payments p ON p.ride_id=r.id WHERE r.driver_id=$1
    AND ${resumable(driverActive)} ORDER BY ${resumableOrder} LIMIT 1`;
const rideOrder = 'r.created_at DESC, r.id DESC';
const driverDetail = `SELECT ${summary}, ${fare}, ${coordinates}, ${distances},
  r.matched_at, r.arrived_at, r.started_at, r.completed_at, r.cancelled_at,
  r.cancel_reason, r.estimated_duration_s, r.actual_duration_s, r.rider_note, r.collection_preference,
  CASE WHEN u.id IS NOT NULL THEN ${passenger('u')} END AS rider,
  CASE WHEN v.id IS NOT NULL THEN jsonb_build_object(${vehicle}) END AS vehicle,
  CASE WHEN rr.id IS NOT NULL THEN jsonb_build_object('id', rr.id, 'ride_id', rr.ride_id,
    'provider', rr.provider, 'encoded_polyline', rr.encoded_polyline, 'route_data', rr.route_data,
    'distance_m', rr.distance_m, 'duration_s', rr.duration_s, 'created_at', ${iso('rr.created_at')},
    'updated_at', ${iso('rr.updated_at')}) END AS route,
  ${fullPayment},
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type,
    'created_at', ${iso('e.created_at')}) ORDER BY e.created_at) FROM ride_events e WHERE e.ride_id = r.id),
    '[]'::jsonb) AS events
  FROM rides r JOIN driver_profiles d ON d.id = r.driver_id
  LEFT JOIN users u ON u.id = r.rider_id
  LEFT JOIN vehicles v ON v.id = r.vehicle_id
  LEFT JOIN ride_routes rr ON rr.ride_id = r.id
  LEFT JOIN payments p ON p.ride_id = r.id
  WHERE d.user_id = $1`;
const scope = `r.rider_id = $1 AND r.status <> 'DRAFT'
  AND ($2::text = '' OR r.id ILIKE '%' || $2 || '%' OR r.pickup_address ILIKE '%' || $3 || '%'
       OR r.dropoff_address ILIKE '%' || $3 || '%')
  AND ($4::text IS NULL OR EXISTS (SELECT 1 FROM fare_quotes f WHERE f.ride_id = r.id
       AND f.selected_at IS NOT NULL AND f.vehicle_category_id = $4))
  AND ($5::timestamptz IS NULL OR (r.created_at >= $5 AND r.created_at < $6))`;

export const travelSql = {
  context: `SELECT u.role, u.partner_activated_at, a.status AS partner_status, d.availability,
    (SELECT jsonb_build_object('id', r.id, 'status', r.status, 'pickup_address', r.pickup_address,
       'dropoff_address', r.dropoff_address, 'requested_at', ${iso('r.requested_at')}, 'created_at', ${iso('r.created_at')})
     FROM rides r LEFT JOIN payments p ON p.ride_id = r.id
     WHERE r.rider_id = u.id AND ${resumable(riderActive)} ORDER BY ${resumableOrder} LIMIT 1) AS rider_ride,
    (SELECT jsonb_build_object('id', r.id, 'status', r.status, 'pickup_address', r.pickup_address,
       'dropoff_address', r.dropoff_address, 'requested_at', ${iso('r.requested_at')}, 'created_at', ${iso('r.created_at')})
     FROM rides r LEFT JOIN payments p ON p.ride_id = r.id
     WHERE r.driver_id = d.id AND ${resumable(driverActive)} ORDER BY ${resumableOrder} LIMIT 1) AS driver_ride
    FROM users u LEFT JOIN partner_applications a ON a.current_user_id = u.id
    LEFT JOIN driver_profiles d ON d.user_id = u.id WHERE u.id = $1`,
  driverCurrent: `${driverDetail} AND ${resumable(driverActive)} ORDER BY ${resumableOrder} LIMIT 1`,
  driverDetail: `${driverDetail} AND r.id = $2`,
  driverTotal: `SELECT count(*)::int AS total FROM rides r
    JOIN driver_profiles d ON d.id = r.driver_id WHERE d.user_id = $1`,
  driverList: `SELECT ${summary}, ${fare}, ${distances},
    CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(${farePayment}) END AS payment
    FROM rides r JOIN driver_profiles d ON d.id = r.driver_id LEFT JOIN payments p ON p.ride_id = r.id
    WHERE d.user_id = $1 ORDER BY ${rideOrder} LIMIT $2 OFFSET $3`,
  riderCounts: `SELECT r.status, count(*)::int AS total FROM rides r WHERE ${scope} GROUP BY r.status`,
  riderList: `SELECT ${summary}, ${fare}, ${coordinates}, ${distances}, r.estimated_duration_s, r.actual_duration_s,
    r.matched_at, r.started_at, r.completed_at, r.cancelled_at, r.cancel_reason, r.collection_preference,
    ${receiptDriver} AS driver,
    ${receiptVehicle} AS vehicle,
    ${fullPayment},
    CASE WHEN sr.id IS NOT NULL THEN jsonb_build_object('kind', sr.kind, 'status', sr.status,
      'fee_amount', trim_scale(sr.fee_amount)::text, 'resolution_note', sr.resolution_note) END AS settlement_review,
    COALESCE((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT score FROM reviews
      WHERE ride_id = r.id AND reviewer_id = $1 LIMIT 1) q), '[]'::jsonb) AS reviews,
    COALESCE((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT category_snapshot, vehicle_type, vehicle_category_id
      FROM fare_quotes WHERE ride_id = r.id AND selected_at IS NOT NULL LIMIT 1) q), '[]'::jsonb) AS quotes
    FROM rides r LEFT JOIN driver_profiles d ON d.id = r.driver_id LEFT JOIN users du ON du.id = d.user_id
    LEFT JOIN vehicles v ON v.id = r.vehicle_id LEFT JOIN vehicle_brands b ON b.id = v.brand_id
    LEFT JOIN payments p ON p.ride_id = r.id LEFT JOIN ride_settlement_reviews sr ON sr.ride_id = r.id
    WHERE ${scope} AND ($7::"RideStatus"[] IS NULL OR r.status = ANY($7))
    ORDER BY ${rideOrder} LIMIT $8 OFFSET $9`,
};

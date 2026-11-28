const profile = `id, user_id, availability, verification_status, license_number,
  trim_scale(rating_average)::text AS rating_average, ratings_count, completed_rides,
  trim_scale(current_latitude)::text AS current_latitude, trim_scale(current_longitude)::text AS current_longitude,
  last_location_at, active_vehicle_id, verified_at, created_at, updated_at, last_location_accuracy_m`;

export const adminSql = {
  driverUser: 'SELECT user_id FROM driver_profiles WHERE id = $1',
  verification:
    'SELECT availability, verification_status FROM driver_profiles WHERE id = $1',
  verify: `UPDATE driver_profiles SET verification_status = $2::"VerificationStatus",
    verified_at = CASE WHEN $2::"VerificationStatus" = 'VERIFIED' THEN clock_timestamp() ELSE NULL END,
    availability = CASE WHEN $2::"VerificationStatus" = 'VERIFIED' OR availability IN ('EN_ROUTE','ON_TRIP')
      THEN availability ELSE 'OFFLINE' END, updated_at = clock_timestamp()
    WHERE id = $1 RETURNING ${profile}`,
  ride: 'SELECT status FROM rides WHERE id = $1',
  selectedQuote:
    'SELECT vehicle_category_id, vehicle_type, category_snapshot FROM fare_quotes WHERE ride_id = $1 AND selected_at IS NOT NULL LIMIT 1',
  matchingDriver: `SELECT d.verification_status, d.availability, u.status AS user_status,
    CASE WHEN v.id IS NOT NULL THEN jsonb_build_object(
      'driver_id', v.driver_id, 'status', v.status, 'verification_version', v.verification_version,
      'verification_fields', v.verification_fields, 'brand_id', v.brand_id, 'type', v.type,
      'capacity', v.capacity, 'vehicle_category_id', v.vehicle_category_id,
      'brand', CASE WHEN b.id IS NOT NULL THEN jsonb_build_object('is_active', b.is_active, 'status', b.status) END,
      'catalog_model', CASE WHEN m.id IS NOT NULL THEN jsonb_build_object(
        'is_active', m.is_active, 'status', m.status, 'brand_id', m.brand_id,
        'vehicle_type', m.vehicle_type, 'seating_capacity', m.seating_capacity) END,
      'vehicle_category', CASE WHEN c.id IS NOT NULL THEN jsonb_build_object(
        'is_active', c.is_active, 'capacity', c.capacity, 'vehicle_type', c.vehicle_type,
        'parent', CASE WHEN parent.id IS NOT NULL THEN jsonb_build_object('is_active', parent.is_active) END,
        '_count', jsonb_build_object('children', (SELECT count(*) FROM vehicle_categories WHERE parent_id = c.id))) END
    ) END AS vehicle
    FROM driver_profiles d JOIN users u ON u.id = d.user_id
    LEFT JOIN vehicles v ON v.id = d.active_vehicle_id
    LEFT JOIN vehicle_brands b ON b.id = v.brand_id
    LEFT JOIN vehicle_models m ON m.id = v.model_id
    LEFT JOIN vehicle_categories c ON c.id = v.vehicle_category_id
    LEFT JOIN vehicle_categories parent ON parent.id = c.parent_id WHERE d.id = $1`,
  offer: `INSERT INTO ride_offers (id, ride_id, driver_id, expires_at, updated_at)
    VALUES ($1, $2, $3, $4, clock_timestamp())
    ON CONFLICT (ride_id, driver_id) DO NOTHING
    RETURNING id, ride_id, driver_id, status, sent_at, responded_at, expires_at, created_at, updated_at`,
};

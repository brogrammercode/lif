const categoryMoney = (
  alias: 'category' | 'parent',
) => `to_jsonb(${alias}) || jsonb_build_object(
  'base_fare',trim_scale(${alias}.base_fare)::text,
  'per_kilometer',trim_scale(${alias}.per_kilometer)::text,
  'per_minute',trim_scale(${alias}.per_minute)::text,
  'max_profit_km',trim_scale(${alias}.max_profit_km)::text,
  'normal_fare_per_km',trim_scale(${alias}.normal_fare_per_km)::text,
  'profit_fare_per_km',trim_scale(${alias}.profit_fare_per_km)::text,
  'commission_percent',trim_scale(${alias}.commission_percent)::text)`;

export const categoryView = categoryMoney('category');

export const selectableDriverCategory = `SELECT category.id,category.vehicle_type,category.capacity
  FROM vehicle_categories category LEFT JOIN vehicle_categories parent ON parent.id=category.parent_id
  WHERE (CASE WHEN $1 THEN category.id ELSE category.code END)=$2
    AND category.is_active AND (parent.id IS NULL OR parent.is_active)
    AND NOT EXISTS (SELECT 1 FROM vehicle_categories child WHERE child.parent_id=category.id)`;

export const driverProfileColumns = `p.*,
  trim_scale(p.rating_average)::text AS rating_average,
  trim_scale(p.current_latitude)::text AS current_latitude,
  trim_scale(p.current_longitude)::text AS current_longitude`;

export const driverProfileView = `SELECT ${driverProfileColumns},
  to_jsonb(u) || jsonb_build_object(
    'last_known_latitude',trim_scale(u.last_known_latitude)::text,
    'last_known_longitude',trim_scale(u.last_known_longitude)::text
  ) AS "user",
  to_jsonb(active_vehicle) AS active_vehicle,
  COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at,d.id)
    FROM driver_documents d WHERE d.driver_id=p.id),'[]'::jsonb) AS documents,
  COALESCE((SELECT jsonb_agg(to_jsonb(v) || jsonb_build_object('vehicle_category',
    CASE WHEN category.id IS NULL THEN NULL ELSE ${categoryMoney('category')}
      || jsonb_build_object('parent',CASE WHEN parent.id IS NULL THEN NULL
        ELSE ${categoryMoney('parent')} END) END
    ) ORDER BY v.created_at,v.id)
    FROM vehicles v LEFT JOIN vehicle_categories category ON category.id=v.vehicle_category_id
    LEFT JOIN vehicle_categories parent ON parent.id=category.parent_id
    WHERE v.driver_id=p.id),'[]'::jsonb) AS vehicles
  FROM driver_profiles p
  JOIN users u ON u.id=p.user_id
  LEFT JOIN vehicles active_vehicle ON active_vehicle.id=p.active_vehicle_id
  WHERE p.user_id=$1`;

export const updateDriverLocation = `UPDATE driver_profiles p SET
  current_latitude=$2,current_longitude=$3,last_location_at=$4,
  last_location_accuracy_m=$5,updated_at=clock_timestamp()
  WHERE p.id=$1 RETURNING ${driverProfileColumns}`;

export const appendActiveRideLocation = `INSERT INTO ride_locations
  (id,ride_id,driver_id,latitude,longitude,heading,speed_kph,recorded_at,updated_at)
  SELECT $1,r.id,$2,$3,$4,$5,$6,$7,clock_timestamp()
  FROM rides r WHERE r.driver_id=$2
    AND r.status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_WAITING','IN_PROGRESS')
  ORDER BY r.created_at DESC,r.id DESC LIMIT 1`;

export const matchingVehicleProjection = (
  includeDocuments = false,
) => `CASE WHEN v.id IS NULL THEN NULL ELSE to_jsonb(v) ||
  jsonb_build_object(
    'brand', CASE WHEN b.id IS NOT NULL THEN jsonb_build_object(
      'id',b.id,'name',b.name,'logo_url',b.logo_url,'status',b.status,'is_active',b.is_active) END,
    'catalog_model', CASE WHEN m.id IS NOT NULL THEN jsonb_build_object(
      'id',m.id,'name',m.name,'brand_id',m.brand_id,'status',m.status,'is_active',m.is_active,
      'vehicle_type',m.vehicle_type,'seating_capacity',m.seating_capacity
      ${includeDocuments ? ",'logo_url',m.logo_url" : ''}) END,
    'vehicle_category', CASE WHEN category.id IS NOT NULL THEN ${categoryView} ||
      jsonb_build_object(
        'parent',CASE WHEN parent.id IS NOT NULL THEN ${categoryMoney('parent')} END,
        '_count',jsonb_build_object('children',(SELECT count(*) FROM vehicle_categories WHERE parent_id=category.id))
      ) END
    ${
      includeDocuments
        ? `,'verification_assets',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',a.id,'field_key',a.field_key,'file_name',a.file_name)
        ORDER BY a.created_at,a.id) FROM vehicle_verification_assets a WHERE a.vehicle_id=v.id
    ),'[]'::jsonb)`
        : ''
    }
  ) END`;

export const matchingJoins = `LEFT JOIN vehicle_brands b ON b.id=v.brand_id
  LEFT JOIN vehicle_models m ON m.id=v.model_id
  LEFT JOIN vehicle_categories category ON category.id=v.vehicle_category_id
  LEFT JOIN vehicle_categories parent ON parent.id=category.parent_id`;

export const findDriverMatchingProfile = `SELECT ${driverProfileColumns},
  jsonb_build_object('status',u.status) AS "user",
  ${matchingVehicleProjection()} AS active_vehicle
  FROM driver_profiles p JOIN users u ON u.id=p.user_id
  LEFT JOIN vehicles v ON v.id=p.active_vehicle_id
  ${matchingJoins}
  WHERE p.user_id=$1`;

export const findOwnedMatchingVehicle = `SELECT ${matchingVehicleProjection()} AS vehicle
  FROM vehicles v JOIN driver_profiles p ON p.id=v.driver_id
  JOIN users u ON u.id=p.user_id
  ${matchingJoins}
  WHERE v.id=$1 AND p.user_id=$2 AND u.status='ACTIVE'`;

const activeRideStates =
  "'DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_WAITING','IN_PROGRESS'";
export const findDriverActiveRide = `SELECT id FROM rides
  WHERE driver_id=$1 AND status IN (${activeRideStates}) LIMIT 1`;
export const findRiderActiveRide = `SELECT id FROM rides
  WHERE rider_id=$1 AND status IN ('REQUESTED','SEARCHING',${activeRideStates}) LIMIT 1`;

export const findMatchingRules = `SELECT location_max_age_s,arrival_radius_m,matching_max_radius_km,search_timeout_s
  FROM ride_fare_policies WHERE key='default'`;

export const findOwnedOfferRide = `SELECT o.ride_id FROM ride_offers o
  JOIN driver_profiles p ON p.id=o.driver_id WHERE o.id=$1 AND p.user_id=$2`;

export const findOfferDetails = `SELECT o.status,o.expires_at,o.ride_id,r.driver_id,
  r.status AS ride_status,r.requested_at,r.created_at,r.pickup_latitude,r.pickup_longitude,
  r.search_radius_km,r.collection_preference,r.passenger_count,
  (SELECT jsonb_build_object('vehicle_category_id',q.vehicle_category_id,
    'vehicle_type',q.vehicle_type,'category_snapshot',q.category_snapshot)
    FROM fare_quotes q WHERE q.ride_id=r.id AND q.selected_at IS NOT NULL
    ORDER BY q.created_at,q.id LIMIT 1) AS selected_quote
  FROM ride_offers o JOIN rides r ON r.id=o.ride_id
  JOIN driver_profiles p ON p.id=o.driver_id WHERE o.id=$1 AND p.user_id=$2`;

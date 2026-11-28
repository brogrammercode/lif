const iso = (field: string) =>
  `to_char(${field} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const person = (
  alias: 'ru' | 'du' | 'reporter',
) => `CASE WHEN ${alias}.id IS NOT NULL THEN jsonb_build_object(
  'id',${alias}.id,'first_name',${alias}.first_name,'last_name',${alias}.last_name,
  'email',${alias}.email,'phone_e164',${alias}.phone_e164
) END`;

export const settlementReviewsPage = `SELECT s.*,trim_scale(s.fee_amount)::text AS fee_amount,
  ${person('reporter')} AS reported_by,
  jsonb_build_object(
    'rider_id',r.rider_id,'driver_id',r.driver_id,'created_at',${iso('r.created_at')},
    'status',r.status,'pickup_address',r.pickup_address,'dropoff_address',r.dropoff_address,
    'matched_at',${iso('r.matched_at')},'arrived_at',${iso('r.arrived_at')},'cancelled_at',${iso('r.cancelled_at')},
    'estimated_fare',trim_scale(r.estimated_fare)::text,'final_fare',trim_scale(r.final_fare)::text,
    'rider',${person('ru')},'driver',CASE WHEN d.id IS NOT NULL THEN jsonb_build_object('user',${person('du')}) END,
    'payment',CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('status',p.status,'collection_method',p.collection_method) END,
    'vehicle',CASE WHEN v.id IS NOT NULL THEN jsonb_build_object(
      'type',v.type,'plate_number',v.plate_number,'make',v.make,'model',v.model,
      'brand',CASE WHEN b.id IS NOT NULL THEN jsonb_build_object('name',b.name,'logo_url',b.logo_url) END,
      'catalog_model',CASE WHEN m.id IS NOT NULL THEN jsonb_build_object('name',m.name,'logo_url',m.logo_url) END,
      'vehicle_category',CASE WHEN c.id IS NOT NULL THEN jsonb_build_object(
        'name',c.name,'image_url',c.image_url,'vehicle_type',c.vehicle_type) END) END,
    'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,
      'created_at',${iso('e.created_at')},'metadata',e.metadata) ORDER BY e.created_at,e.id)
      FROM ride_events e WHERE e.ride_id=r.id AND e.event_type IN (
        'DRIVER_WAITING','CALL_ATTEMPT','CANCELLATION_REPORTED','PASSENGER_NO_SHOW_REPORTED',
        'FARE_UNPAID_REPORTED','CHARGE_DISPUTED')),'[]'::jsonb)
  ) AS ride
  FROM ride_settlement_reviews s JOIN rides r ON r.id=s.ride_id JOIN users ru ON ru.id=r.rider_id
  LEFT JOIN users reporter ON reporter.id=s.reported_by_id
  LEFT JOIN driver_profiles d ON d.id=r.driver_id LEFT JOIN users du ON du.id=d.user_id
  LEFT JOIN vehicles v ON v.id=r.vehicle_id LEFT JOIN vehicle_brands b ON b.id=v.brand_id
  LEFT JOIN vehicle_models m ON m.id=v.model_id LEFT JOIN vehicle_categories c ON c.id=v.vehicle_category_id
  LEFT JOIN payments p ON p.ride_id=r.id
  WHERE ($1::text[] IS NULL OR s.status=ANY($1))
  ORDER BY s.created_at DESC,s.id DESC LIMIT $2 OFFSET $3`;

import { pending_vehicle_sql } from '../../admin_pending/sql/pending-predicates.sql.js';

export const visibleUser = "deleted_at IS NULL AND status<>'DELETED'";
export const userSummary =
  'id,first_name,last_name,email,avatar_url,role,partner_activated_at,status';
export const userDetail =
  userSummary +
  ',phone_e164,last_known_latitude,last_known_longitude,created_at,updated_at,last_login_at,last_admin_login_at';
const driver = "(u.role='DRIVER' OR u.partner_activated_at IS NOT NULL)";
export const userFilters = `
  FROM users u WHERE ${visibleUser}
    AND ($1::text='all' OR ($1='driver' AND ${driver}) OR ($1='user' AND NOT ${driver}))
    AND (NOT $2::boolean OR (u.status='ACTIVE' AND ${driver}
      AND NOT EXISTS (SELECT 1 FROM partner_applications a WHERE a.current_user_id=u.id AND a.status='EXITED')
      AND EXISTS (SELECT 1 FROM driver_profiles d JOIN vehicles v ON v.driver_id=d.id
        WHERE d.user_id=u.id AND ${pending_vehicle_sql})))
    AND NOT EXISTS (SELECT 1 FROM unnest($3::text[]) AS t(term)
      WHERE NOT (u.id ILIKE '%'||t.term||'%'
        OR COALESCE(u.first_name,'') ILIKE '%'||t.term||'%'
        OR COALESCE(u.last_name,'') ILIKE '%'||t.term||'%'
        OR COALESCE(u.email,'') ILIKE '%'||t.term||'%'
        OR COALESCE(u.phone_e164,'') ILIKE '%'||t.term||'%'))`;

export const rideFilters = `
  WHERE (($2::boolean AND d.user_id=$1) OR (NOT $2 AND r.rider_id=$1))
    AND r.status<>'DRAFT' AND (r.status<>'EXPIRED' OR r.requested_at IS NOT NULL)
    AND ($3::text='all' OR ($3='completed' AND r.status='COMPLETED')
      OR ($3='cancelled' AND r.status IN ('CANCELLED','EXPIRED','NO_DRIVER_FOUND'))
      OR ($3='active' AND r.status IN ('REQUESTED','SEARCHING','DRIVER_ASSIGNED',
         'DRIVER_ARRIVING','DRIVER_WAITING','IN_PROGRESS')))`;

const person = (alias: 'rider' | 'owner') => `jsonb_build_object(
  'id',${alias}.id,'first_name',${alias}.first_name,'last_name',${alias}.last_name,
  'email',${alias}.email,'phone_e164',${alias}.phone_e164)`;
export const adminRideRows = `
  SELECT r.id,r.status,r.created_at,r.requested_at,r.matched_at,r.arrived_at,r.started_at,
    r.completed_at,r.cancelled_at,r.cancel_reason,r.pickup_address,r.dropoff_address,
    r.estimated_distance_m,r.actual_distance_m,trim_scale(r.estimated_fare)::text AS estimated_fare,
    trim_scale(r.final_fare)::text AS final_fare,r.currency,
    ${person('rider')} AS rider, CASE WHEN d.id IS NOT NULL THEN jsonb_build_object('user',${person('owner')}) END AS driver,
    CASE WHEN v.id IS NOT NULL THEN jsonb_build_object(
      'type',v.type,'plate_number',v.plate_number,'make',v.make,'model',v.model,
      'brand',CASE WHEN b.id IS NOT NULL THEN jsonb_build_object('name',b.name,'logo_url',b.logo_url) END,
      'catalog_model',CASE WHEN m.id IS NOT NULL THEN jsonb_build_object('name',m.name,'logo_url',m.logo_url) END,
      'vehicle_category',CASE WHEN c.id IS NOT NULL THEN jsonb_build_object(
        'name',c.name,'image_url',c.image_url,'vehicle_type',c.vehicle_type) END
    ) END AS vehicle,
    CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('status',p.status,'collection_method',p.collection_method) END AS payment
  FROM rides r LEFT JOIN driver_profiles d ON d.id=r.driver_id
    JOIN users rider ON rider.id=r.rider_id LEFT JOIN users owner ON owner.id=d.user_id
    LEFT JOIN vehicles v ON v.id=r.vehicle_id LEFT JOIN vehicle_brands b ON b.id=v.brand_id
    LEFT JOIN vehicle_models m ON m.id=v.model_id LEFT JOIN vehicle_categories c ON c.id=v.vehicle_category_id
    LEFT JOIN payments p ON p.ride_id=r.id
  ${rideFilters} ORDER BY r.created_at DESC,r.id DESC LIMIT 20 OFFSET $4`;

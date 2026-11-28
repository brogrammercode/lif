import {
  receiptDriver,
  receiptVehicle,
} from '../../travel_context/sql/travel-context.sql.js';

export const receiptSql = `
  SELECT r.*,
    trim_scale(r.pickup_latitude)::text AS pickup_latitude,
    trim_scale(r.pickup_longitude)::text AS pickup_longitude,
    trim_scale(r.dropoff_latitude)::text AS dropoff_latitude,
    trim_scale(r.dropoff_longitude)::text AS dropoff_longitude,
    trim_scale(r.estimated_fare)::text AS estimated_fare,
    trim_scale(r.final_fare)::text AS final_fare,
    CASE WHEN p.id IS NOT NULL THEN to_jsonb(p) ||
      jsonb_build_object('amount',trim_scale(p.amount)::text) END AS payment,
    ${receiptDriver} AS driver, ${receiptVehicle} AS vehicle,
    CASE WHEN rr.id IS NOT NULL THEN to_jsonb(rr) END AS route
  FROM rides r LEFT JOIN payments p ON p.ride_id=r.id
    LEFT JOIN driver_profiles d ON d.id=r.driver_id LEFT JOIN users du ON du.id=d.user_id
    LEFT JOIN vehicles v ON v.id=r.vehicle_id LEFT JOIN vehicle_brands b ON b.id=v.brand_id
    LEFT JOIN ride_routes rr ON rr.ride_id=r.id
  WHERE r.id=$1 AND r.rider_id=$2`;

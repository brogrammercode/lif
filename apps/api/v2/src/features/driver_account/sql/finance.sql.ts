const trips = `FROM rides r LEFT JOIN payments p ON p.ride_id=r.id
  WHERE r.driver_id=$1 AND r.status='COMPLETED' AND r.completed_at >= $2 AND r.completed_at < $3`;
const charges = `FROM ride_settlement_reviews
  WHERE driver_id=$1 AND updated_at >= $2 AND updated_at < $3 AND kind<>'UNPAID'`;

export const financeTotalsSql = `
  WITH trips AS (
    SELECT
      trim_scale(COALESCE(sum(r.final_fare),0))::text AS gross_fares,
      count(*)::int AS completed_trips,
      (count(*)-count(r.final_fare))::int AS unpriced_trips,
      trim_scale(COALESCE(sum(r.final_fare) FILTER (WHERE p.id IS NULL),0))::text AS receipt_unrecorded,
      trim_scale(COALESCE(sum(p.amount) FILTER (WHERE p.status='CAPTURED' AND p.collection_method='CASH'),0))::text AS cash_received,
      trim_scale(COALESCE(sum(p.amount) FILTER (WHERE p.status='CAPTURED' AND p.collection_method='UPI'),0))::text AS upi_received,
      trim_scale(COALESCE(sum(p.amount) FILTER (WHERE p.status='CAPTURED' AND
        (p.collection_method IS NULL OR p.collection_method NOT IN ('CASH','UPI'))),0))::text AS other_received,
      trim_scale(COALESCE(sum(p.amount) FILTER (WHERE p.status IN ('PENDING','FAILED')),0))::text AS collection_pending,
      trim_scale(COALESCE(sum(p.amount) FILTER (WHERE p.status='CANCELLED'),0))::text AS waived,
      trim_scale(COALESCE(sum(p.amount) FILTER (WHERE p.status IN
        ('REFUNDED','PARTIALLY_REFUNDED','AUTHORIZED','REQUIRES_ACTION')),0))::text AS provider_resolved
    ${trips}
  ), charges AS (
    SELECT count(*)::int AS charge_count,
      trim_scale(COALESCE(sum(fee_amount) FILTER (WHERE status='APPROVED'),0))::text AS approved_charges_due,
      trim_scale(COALESCE(sum(fee_amount) FILTER (WHERE status='SETTLED'),0))::text AS charges_received,
      trim_scale(COALESCE(sum(fee_amount) FILTER (WHERE status IN ('REQUESTED','DISPUTED')),0))::text AS charges_under_review
    ${charges}
  )
  SELECT trips.*,charges.* FROM trips CROSS JOIN charges`;

export const tripRowsSql = `
  SELECT r.id,r.completed_at,r.pickup_address,r.dropoff_address,
    trim_scale(r.final_fare)::text AS final_fare,r.currency,
    CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(
      'status',p.status,'amount',trim_scale(p.amount)::text,'collection_method',p.collection_method,
      'paid_at',to_char(p.paid_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) END AS payment
  ${trips} ORDER BY r.completed_at DESC,r.id DESC LIMIT 20 OFFSET $4`;
export const chargeRowsSql = `
  SELECT id,ride_id,kind,status,reason,trim_scale(fee_amount)::text AS fee_amount,updated_at,resolution_note
  ${charges} ORDER BY updated_at DESC,id DESC LIMIT 20 OFFSET $4`;

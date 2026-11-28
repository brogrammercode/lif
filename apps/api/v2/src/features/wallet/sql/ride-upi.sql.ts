import type { Payment } from '../../payment/payment.row.js';
import type { SqlClient } from '../../../database/postgres.service.js';
import { AppError } from '../../../core/error.js';

export type UpiPayment = Omit<Payment, 'amount'> & { amount: string };
export const upiCheckoutRide = `SELECT r.status,r.currency,r.final_fare,r.driver_id,d.user_id AS driver_user_id,
   CASE WHEN p.id IS NOT NULL THEN to_jsonb(p)||jsonb_build_object('amount',trim_scale(p.amount)::text) END AS payment,
   EXISTS(SELECT 1 FROM ride_settlement_reviews s WHERE s.ride_id=r.id) AS under_review,
   (SELECT q.category_snapshot FROM fare_quotes q WHERE q.ride_id=r.id AND q.selected_at IS NOT NULL
    ORDER BY q.selected_at DESC,q.id DESC LIMIT 1) AS category_snapshot
   FROM rides r LEFT JOIN payments p ON p.ride_id=r.id LEFT JOIN driver_profiles d ON d.id=r.driver_id
   WHERE r.id=$1 AND r.rider_id=$2`;

export const ownedUpiPayment = `SELECT p.* FROM payments p JOIN rides r ON r.id=p.ride_id
  LEFT JOIN driver_profiles d ON d.id=r.driver_id
  WHERE p.ride_id=$1 AND p.provider=$2 AND (r.rider_id=$3 OR d.user_id=$3)`;

export const upiCapturePayment = `SELECT p.*,r.rider_id,r.status AS ride_status,d.user_id AS driver_user_id,
  (SELECT q.category_snapshot FROM fare_quotes q WHERE q.ride_id=r.id AND q.selected_at IS NOT NULL
   ORDER BY q.selected_at DESC,q.id DESC LIMIT 1) AS category_snapshot
  FROM payments p JOIN rides r ON r.id=p.ride_id LEFT JOIN driver_profiles d ON d.id=r.driver_id
  WHERE p.id=$1`;

export async function requireUpiPayment(db: SqlClient, id: string) {
  const {
    rows: [payment],
  } = await db.query<UpiPayment>('SELECT * FROM payments WHERE id=$1', [id]);
  if (!payment)
    throw new AppError(404, 'PAYMENT_NOT_FOUND', 'UPI payment not found.');
  return payment;
}

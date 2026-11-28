// PostgreSQL query row and persisted status types.
type PaymentStatus =
  | 'PENDING'
  | 'REQUIRES_ACTION'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'CANCELLED';

type PaymentMethodType = 'CASH' | 'CARD' | 'UPI' | 'WALLET';

export type Payment = {
  collection_method: PaymentMethodType | null;
  recipient_upi: string | null;
  confirmed_by_id: string | null;
  unpaid_reason: string | null;
  id: string;
  ride_id: string;
  payment_method_id: string | null;
  status: PaymentStatus;
  provider: string | null;
  provider_payment_id: string | null;
  provider_order_id: string | null;
  provider_order_claimed: boolean;
  amount: string;
  currency: string;
  paid_at: Date | null;
  failed_at: Date | null;
  refunded_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

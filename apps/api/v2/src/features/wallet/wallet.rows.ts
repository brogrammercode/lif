// PostgreSQL query row and persisted status types.
type WalletTopUpStatus =
  | 'CREATING'
  | 'PENDING'
  | 'CAPTURED'
  | 'FAILED'
  | 'REFUNDED'
  | 'REVIEW_REQUIRED'
  | 'CANCELLED';

type WalletTopUpMode = 'disabled' | 'test' | 'live';

export type WalletKind = 'RIDER' | 'DRIVER';

export const walletEntryKinds = [
  'TOP_UP',
  'RIDE_DEBIT',
  'RIDE_EARNING',
  'REFUND',
  'ADJUSTMENT',
  'PAYOUT_HOLD',
  'PAYOUT_SETTLED',
  'PAYOUT_RELEASE',
  'CASH_PAYMENT',
] as const;
export type WalletEntryKind = (typeof walletEntryKinds)[number];

type PayoutMethodStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'DISABLED';

type PayoutMethodKind = 'UPI' | 'DEBIT_CARD' | 'BANK_ACCOUNT';

type PayoutFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type PayoutSchedule = {
  id: string;
  enabled: boolean;
  razorpay_ride_upi_enabled: boolean;
  wallet_ride_collection_enabled: boolean;
  wallet_topup_mode: WalletTopUpMode;
  wallet_live_topup_approved: boolean;
  razorpay_x_upi_setup_enabled: boolean;
  razorpay_x_transfers_enabled: boolean;
  frequency: PayoutFrequency;
  minute_of_day_ist: number;
  weekday_ist: number;
  month_day_ist: number;
  minimum_paise: bigint;
  require_approval: boolean;
  next_run_at: Date | null;
  replaced_run_at: Date | null;
  version: number;
  updated_at: Date;
};

export type DriverPayoutMethod = {
  pending_details: string | null;
  link_attempted_at: Date | null;
  destination_hash: string | null;
  provider_validation_id: string | null;
  beneficiary_name_hash: string | null;
  id: string;
  driver_id: string;
  kind: PayoutMethodKind;
  status: PayoutMethodStatus;
  provider_contact_id: string | null;
  provider_fund_account_id: string | null;
  masked_label: string;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
};

export type WalletTopUp = {
  credited_net_of_refund_paise: bigint;
  reviewed_chargeback_paise: bigint;
  provider_link_id: string | null;
  checkout_url: string | null;
  checkout_kind: string;
  provider_order_create_claimed: boolean;
  failure_reason: string | null;
  provider_mode: string | null;
  id: string;
  wallet_id: string;
  amount_paise: bigint;
  request_key: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  status: WalletTopUpStatus;
  created_at: Date;
  updated_at: Date;
};

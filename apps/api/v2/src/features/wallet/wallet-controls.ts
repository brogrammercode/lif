import type { PayoutSchedule } from './wallet.rows.js';
import { config } from '../../core/config.js';
import type { SqlClient } from '../../database/postgres.service.js';

export const payout_schedule_id = 'default';
export const payout_schedule_lock = 720065;

const control_fields = {
  razorpay_ride_upi_enabled: true,
  wallet_ride_collection_enabled: true,
  wallet_topup_mode: true,
  wallet_live_topup_approved: true,
  razorpay_x_upi_setup_enabled: true,
  razorpay_x_transfers_enabled: true,
} as const;

export type WalletControls = Pick<PayoutSchedule, keyof typeof control_fields>;

export const default_wallet_controls: WalletControls = {
  razorpay_ride_upi_enabled: false,
  wallet_ride_collection_enabled: false,
  wallet_topup_mode: 'disabled',
  wallet_live_topup_approved: false,
  razorpay_x_upi_setup_enabled: false,
  razorpay_x_transfers_enabled: false,
};

export async function readWalletControls(tx: SqlClient) {
  const {
    rows: [settings],
  } = await tx.query<WalletControls>(
    `SELECT razorpay_ride_upi_enabled,wallet_ride_collection_enabled,wallet_topup_mode,
      wallet_live_topup_approved,razorpay_x_upi_setup_enabled,razorpay_x_transfers_enabled
      FROM payout_schedules WHERE id=$1`,
    [payout_schedule_id],
  );
  return settings ?? default_wallet_controls;
}

export async function hasWalletFunding(db: SqlClient, mode: 'test' | 'live') {
  const { rowCount } = await db.query(
    `SELECT t.id FROM wallet_topups t WHERE t.provider_mode=$1 AND
      (t.status IN ('CREATING','PENDING','REVIEW_REQUIRED') OR EXISTS(
        SELECT 1 FROM wallet_entries e WHERE e.topup_id=t.id AND e.kind='TOP_UP'
      )) LIMIT 1`,
    [mode],
  );
  return Boolean(rowCount);
}

export async function payoutSubmissionState(
  db: SqlClient,
  schedule: Pick<
    PayoutSchedule,
    'enabled' | 'razorpay_x_transfers_enabled'
  > | null,
  credentialsReady: boolean,
) {
  if (!schedule?.enabled) return 'schedule_paused';
  if (!schedule.razorpay_x_transfers_enabled) return 'transfers_disabled';
  if (!credentialsReady) return 'credentials_unavailable';
  if (await hasWalletFunding(db, 'test')) return 'test_funding';
  return 'ready';
}

export async function presentWalletSettings<
  T extends WalletControls & { enabled: boolean },
>(db: SqlClient, settings: T) {
  const gatewayMode = gateway_credential_mode();
  const razorpayXReady = razorpay_x_credentials_ready();
  const state = await payoutSubmissionState(db, settings, razorpayXReady);
  return {
    ...settings,
    submission_state: state,
    transfers_enabled: state === 'ready',
    provider_readiness: {
      gateway_mode: gatewayMode,
      topup_active: active_topup_mode(settings, gatewayMode) !== null,
      razorpay_x_ready: razorpayXReady,
    },
  };
}

export function gateway_credential_mode(): 'test' | 'live' | null {
  if (
    !config.RAZORPAY_WALLET_KEY_SECRET ||
    config.RAZORPAY_WALLET_WEBHOOK_SECRET.length < 16
  )
    return null;
  const key = config.RAZORPAY_WALLET_KEY_ID;
  if (key.startsWith('rzp_live_')) return 'live';
  if (
    key.startsWith('rzp_test_') &&
    process.env.NODE_ENV !== 'production' &&
    process.env.VERCEL !== '1'
  )
    return 'test';
  return null;
}

export function razorpay_x_credentials_ready() {
  return (
    config.RAZORPAY_X_KEY_ID.startsWith('rzp_live_') &&
    Boolean(config.RAZORPAY_X_KEY_SECRET && config.RAZORPAY_X_SOURCE_ACCOUNT)
  );
}

export function active_topup_mode(
  controls: WalletControls,
  credential_mode = gateway_credential_mode(),
) {
  if (
    controls.wallet_topup_mode === 'live' &&
    controls.wallet_live_topup_approved &&
    credential_mode === 'live'
  )
    return 'live';
  if (controls.wallet_topup_mode === 'test' && credential_mode === 'test')
    return 'test';
  return null;
}

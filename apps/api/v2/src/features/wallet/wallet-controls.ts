import type { PayoutSchedule } from '@prisma/client';
import { config } from '../../core/config.js';
import type { TransactionClient } from '../../infra/database/client.js';

export const payout_schedule_id = 'default';
export const payout_schedule_lock = 720065;

const control_fields = {
  wallet_ride_collection_enabled: true,
  wallet_topup_mode: true,
  wallet_live_topup_approved: true,
  razorpay_x_upi_setup_enabled: true,
  razorpay_x_transfers_enabled: true,
} as const;

export type WalletControls = Pick<PayoutSchedule, keyof typeof control_fields>;

export const default_wallet_controls: WalletControls = {
  wallet_ride_collection_enabled: false,
  wallet_topup_mode: 'disabled',
  wallet_live_topup_approved: false,
  razorpay_x_upi_setup_enabled: false,
  razorpay_x_transfers_enabled: false,
};

export async function read_wallet_controls(
  db: Pick<TransactionClient, 'payoutSchedule'>,
) {
  return (
    (await db.payoutSchedule.findUnique({
      where: { id: payout_schedule_id },
      select: control_fields,
    })) ?? default_wallet_controls
  );
}

export async function has_wallet_funding(
  db: Pick<TransactionClient, 'walletTopUp'>,
  mode: 'test' | 'live',
) {
  return Boolean(
    await db.walletTopUp.findFirst({
      where: {
        provider_mode: mode,
        OR: [
          { entries: { some: { kind: 'TOP_UP' } } },
          { status: { in: ['CREATING', 'PENDING', 'REVIEW_REQUIRED'] } },
        ],
      },
      select: { id: true },
    }),
  );
}

export async function payout_submission_state(
  db: Pick<TransactionClient, 'walletTopUp'>,
  schedule: Pick<
    PayoutSchedule,
    'enabled' | 'razorpay_x_transfers_enabled'
  > | null,
  credentials_ready: boolean,
) {
  if (!schedule?.enabled) return 'schedule_paused';
  if (!schedule.razorpay_x_transfers_enabled) return 'transfers_disabled';
  if (!credentials_ready) return 'credentials_unavailable';
  if (await has_wallet_funding(db, 'test')) return 'test_funding';
  return 'ready';
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

export async function present_wallet_settings<
  T extends WalletControls & { enabled: boolean },
>(db: Pick<TransactionClient, 'walletTopUp'>, settings: T) {
  const gateway_mode = gateway_credential_mode();
  const razorpay_x_ready = razorpay_x_credentials_ready();
  const submission_state = await payout_submission_state(
    db,
    settings,
    razorpay_x_ready,
  );
  return {
    ...settings,
    submission_state,
    transfers_enabled: submission_state === 'ready',
    provider_readiness: {
      gateway_mode,
      topup_active: active_topup_mode(settings, gateway_mode) !== null,
      razorpay_x_ready,
    },
  };
}

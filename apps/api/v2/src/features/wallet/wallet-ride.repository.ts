import type { JsonValue } from '../../database/json-value.js';
import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  requireActiveAccount,
  requireActiveAdmin,
} from '../../database/account-locks.js';
import { nextEntityId } from '../../database/entity-id.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import { AppError } from '../../core/error.js';
import { recordTripEvent } from '../driver_operations/sql/trip-lifecycle.sql.js';
import { ride_commission } from './cash-ride-entry.js';
import { upiCheckoutRide, type UpiPayment } from './sql/ride-upi.sql.js';
import {
  gateway_credential_mode,
  payout_schedule_lock,
  readWalletControls,
} from './wallet-controls.js';

type WalletRow = { id: string; available_paise: string; held_paise: string };
type FundingEntry = {
  id: string;
  kind: string;
  wallet_id: string;
  available_delta_paise: string;
};

const insufficient = () =>
  new AppError(
    409,
    'WALLET_INSUFFICIENT_BALANCE',
    'Your wallet balance is below the final fare.',
  );
const walletForUser = 'SELECT id FROM wallets WHERE user_id=$1 AND kind=$2';
const changeWallet = `UPDATE wallets SET available_paise=available_paise+$2::bigint
  WHERE id=$1 AND (available_paise+$2::bigint)>=0 RETURNING id,available_paise,held_paise`;

async function lockPayment(tx: SqlClient, rideId: string, refund = false) {
  await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
  await tx.query('SELECT pg_advisory_xact_lock(720044,hashtext($1))', [rideId]);
  await tx.query(
    refund
      ? 'SELECT pg_advisory_xact_lock($1::int)'
      : 'SELECT pg_advisory_xact_lock_shared($1::int)',
    [payout_schedule_lock],
  );
}

async function lockWallets(tx: SqlClient, ids: string[]) {
  await tx.query(
    'SELECT id FROM wallets WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',
    [ids],
  );
}

async function recordWalletEntry(
  tx: SqlClient,
  wallet: WalletRow,
  input: {
    kind: string;
    ride_id: string;
    payment_id: string;
    key: string;
    delta: bigint;
    reverses?: string;
    commission?: bigint;
    percent?: number;
  },
) {
  await tx.query(
    `INSERT INTO wallet_entries (id,wallet_id,kind,ride_id,payment_id,operation_key,available_delta_paise,
      held_delta_paise,available_after_paise,held_after_paise,reverses_entry_id,commission_paise,commission_percent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12)`,
    [
      nextEntityId(),
      wallet.id,
      input.kind,
      input.ride_id,
      input.payment_id,
      input.key,
      String(input.delta),
      wallet.available_paise,
      wallet.held_paise,
      input.reverses ?? null,
      input.commission === undefined ? null : String(input.commission),
      input.percent ?? null,
    ],
  );
}

@Injectable()
export class WalletRideRepository {
  constructor(private readonly db: PostgresService) {}

  async pay_ride(user_id: string, ride_id: string) {
    return this.db.transaction(async (tx) => {
      await requireActiveAccount(tx, user_id);
      await lockPayment(tx, ride_id);
      const {
        rows: [ride],
      } = await tx.query<{
        status: string;
        currency: string;
        final_fare: string | null;
        driver_user_id: string | null;
        payment: UpiPayment | null;
        under_review: boolean;
        category_snapshot: JsonValue;
      }>(upiCheckoutRide, [ride_id, user_id]);
      if (!ride) throw new AppError(404, 'RIDE_NOT_FOUND', 'Ride not found.');
      if (
        ride.payment?.status === 'CAPTURED' &&
        ride.payment.collection_method === 'WALLET'
      )
        return ride.payment;
      const controls = await readWalletControls(tx);
      if (!controls.wallet_ride_collection_enabled)
        throw new AppError(
          503,
          'WALLET_UNAVAILABLE',
          'Wallet ride payments are unavailable.',
        );
      if (
        ride.status !== 'COMPLETED' ||
        ride.currency !== 'INR' ||
        !ride.final_fare ||
        !new Decimal(ride.final_fare).gt(0) ||
        !ride.driver_user_id
      )
        throw new AppError(
          409,
          'RIDE_NOT_PAYABLE',
          'This ride is not payable with Wallet.',
        );
      if (
        (ride.payment &&
          !['PENDING', 'FAILED'].includes(ride.payment.status)) ||
        ride.payment?.provider ||
        ride.payment?.provider_payment_id ||
        ride.under_review
      )
        throw new AppError(
          409,
          'PAYMENT_ALREADY_MANAGED',
          'This payment is already settled or under review.',
        );

      const amount = BigInt(new Decimal(ride.final_fare).mul(100).toFixed(0));
      const { percent, commission } = ride_commission(
        amount,
        ride.category_snapshot,
      );
      const net = amount - commission;
      const {
        rows: [rider],
      } = await tx.query<{ id: string }>(walletForUser, [user_id, 'RIDER']);
      if (!rider) throw insufficient();
      await tx.query(
        "INSERT INTO wallets (id,user_id,kind) VALUES ($1,$2,'DRIVER') ON CONFLICT(user_id,kind) DO NOTHING",
        [nextEntityId(), ride.driver_user_id],
      );
      const {
        rows: [driver],
      } = await tx.query<{ id: string }>(walletForUser, [
        ride.driver_user_id,
        'DRIVER',
      ]);
      if (!driver)
        throw new Error('Driver wallet unavailable for ride payment');
      await lockWallets(tx, [rider.id, driver.id]);
      const review = await tx.query(
        `SELECT t.id FROM wallet_topups t WHERE t.wallet_id=$1 AND (t.status='REVIEW_REQUIRED'
          OR ($2::boolean AND t.provider_mode='test' AND EXISTS(
            SELECT 1 FROM wallet_entries e WHERE e.topup_id=t.id AND e.kind='TOP_UP'
          ))) LIMIT 1`,
        [
          rider.id,
          controls.wallet_topup_mode === 'live' ||
            gateway_credential_mode() !== 'test',
        ],
      );
      if (review.rowCount)
        throw new AppError(
          409,
          'WALLET_REVIEW_REQUIRED',
          'Contact support to resolve a wallet adjustment before paying.',
        );
      const {
        rows: [riderBalance],
      } = await tx.query<WalletRow>(changeWallet, [rider.id, String(-amount)]);
      if (!riderBalance) throw insufficient();
      const {
        rows: [driverBalance],
      } = await tx.query<WalletRow>(changeWallet, [driver.id, String(net)]);
      if (!driverBalance)
        throw new Error('Driver wallet unavailable for ride payment');
      const {
        rows: [payment],
      } = await tx.query<UpiPayment>(
        `INSERT INTO payments (id,ride_id,amount,currency,collection_method,status,paid_at,updated_at)
          VALUES ($1,$2,$3,$4,'WALLET','CAPTURED',statement_timestamp(),clock_timestamp())
          ON CONFLICT(ride_id) DO UPDATE SET amount=EXCLUDED.amount,currency=EXCLUDED.currency,
            collection_method='WALLET',status='CAPTURED',paid_at=EXCLUDED.paid_at,payment_method_id=NULL,
            confirmed_by_id=NULL,recipient_upi=NULL,unpaid_reason=NULL,failed_at=NULL,updated_at=clock_timestamp()
          RETURNING *,trim_scale(amount)::text AS amount`,
        [nextEntityId(), ride_id, ride.final_fare, ride.currency],
      );
      if (!payment) throw new Error('Wallet payment missing during capture');
      await recordWalletEntry(tx, riderBalance, {
        kind: 'RIDE_DEBIT',
        ride_id,
        payment_id: payment.id,
        key: `ride:${ride_id}:RIDE_DEBIT`,
        delta: -amount,
      });
      await recordWalletEntry(tx, driverBalance, {
        kind: 'RIDE_EARNING',
        ride_id,
        payment_id: payment.id,
        key: `ride:${ride_id}:RIDE_EARNING`,
        delta: net,
        commission,
        percent,
      });
      await recordTripEvent(tx, ride_id, user_id, 'PAYMENT_CAPTURED', {
        method: 'WALLET',
      });
      await insertUserLog(tx, {
        actor_id: user_id,
        entity_type: 'Payment',
        entity_id: payment.id,
        action: 'PAY_RIDE_WITH_WALLET',
        after_data: {
          ride_id,
          amount_paise: String(amount),
          commission_paise: String(commission),
          commission_percent: percent,
          driver_net_paise: String(net),
        },
      });
      return payment;
    });
  }

  async refund_ride(
    actor_id: string,
    rider_id: string,
    ride_id: string,
    reason: string,
    platform_funded: boolean,
  ) {
    return this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor_id);
      await lockPayment(tx, ride_id, true);
      const {
        rows: [payment],
      } = await tx.query<{ id: string; status: string }>(
        `SELECT p.id,p.status FROM payments p JOIN rides r ON r.id=p.ride_id
          WHERE p.ride_id=$1 AND p.collection_method='WALLET' AND r.rider_id=$2 AND r.status='COMPLETED'`,
        [ride_id, rider_id],
      );
      if (payment?.status === 'REFUNDED') return { id: payment.id };
      if (payment?.status !== 'CAPTURED')
        throw new AppError(
          409,
          'WALLET_RIDE_NOT_REFUNDABLE',
          'Only a captured wallet ride can be refunded.',
        );
      const { rows: funding } = await tx.query<FundingEntry>(
        `SELECT id,wallet_id,kind,available_delta_paise FROM wallet_entries
          WHERE ride_id=$1 AND payment_id=$2 AND operation_key IN ($3,$4)`,
        [
          ride_id,
          payment.id,
          `ride:${ride_id}:RIDE_DEBIT`,
          `ride:${ride_id}:RIDE_EARNING`,
        ],
      );
      const debit = funding.find((entry) => entry.kind === 'RIDE_DEBIT');
      const earning = funding.find((entry) => entry.kind === 'RIDE_EARNING');
      if (
        !debit ||
        !earning ||
        debit.wallet_id === earning.wallet_id ||
        BigInt(debit.available_delta_paise) >= 0n ||
        BigInt(earning.available_delta_paise) < 0n
      )
        throw new AppError(
          409,
          'WALLET_RIDE_NOT_REFUNDABLE',
          'The wallet ledger is incomplete.',
        );
      const { rows: payouts } = await tx.query<{
        payout_id: string;
        status: string;
      }>(
        `SELECT l.payout_id,p.status FROM driver_payout_lines l JOIN driver_payouts p ON p.id=l.payout_id
          WHERE l.source_entry_id=$1 AND p.status IN ('PAID','DRAFT','READY','PROCESSING','REVIEW_REQUIRED')`,
        [earning.id],
      );
      if (payouts.some((payout) => payout.status !== 'PAID'))
        throw new AppError(
          409,
          'WALLET_REFUND_PAYOUT_LOCKED',
          'Exclude this driver from the draft or wait for the payout to settle.',
        );
      const paid = payouts.find((payout) => payout.status === 'PAID');
      if (paid && !platform_funded)
        throw new AppError(
          409,
          'WALLET_REFUND_PAYOUT_SETTLED',
          'Confirm a platform-funded refund for this already paid ride.',
        );
      const credit = -BigInt(debit.available_delta_paise);
      const source = paid ? 0n : BigInt(earning.available_delta_paise);
      await lockWallets(
        tx,
        paid ? [debit.wallet_id] : [debit.wallet_id, earning.wallet_id],
      );
      const {
        rows: [rider],
      } = await tx.query<WalletRow>(changeWallet, [
        debit.wallet_id,
        String(credit),
      ]);
      if (!rider) throw new Error('Rider wallet unavailable during refund');
      await recordWalletEntry(tx, rider, {
        kind: 'REFUND',
        ride_id,
        payment_id: payment.id,
        key: `ride-refund:${debit.id}`,
        delta: credit,
        reverses: debit.id,
      });
      if (!paid) {
        const {
          rows: [driver],
        } = await tx.query<WalletRow>(changeWallet, [
          earning.wallet_id,
          String(-source),
        ]);
        if (!driver)
          throw new AppError(
            409,
            'WALLET_REFUND_EARNINGS_UNAVAILABLE',
            'Driver earnings are unavailable for reversal.',
          );
        await recordWalletEntry(tx, driver, {
          kind: 'REFUND',
          ride_id,
          payment_id: payment.id,
          key: `ride-refund:${earning.id}`,
          delta: -source,
          reverses: earning.id,
        });
      }
      await tx.query(
        "UPDATE payments SET status='REFUNDED',refunded_at=statement_timestamp(),updated_at=clock_timestamp() WHERE id=$1",
        [payment.id],
      );
      await recordTripEvent(tx, ride_id, actor_id, 'PAYMENT_REFUNDED', {
        method: 'WALLET',
      });
      await insertUserLog(tx, {
        actor_id,
        entity_type: 'Payment',
        entity_id: payment.id,
        action: 'REFUND_WALLET_RIDE',
        after_data: {
          reason,
          ride_id,
          rider_id,
          credited_paise: String(credit),
          recovered_paise: String(source),
          settled_payout_id: paid?.payout_id ?? null,
        },
      });
      return { id: payment.id };
    });
  }
}

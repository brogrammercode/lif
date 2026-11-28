import type { JsonValue } from '../../database/json-value.js';
import {
  type UpiPayment,
  ownedUpiPayment,
  requireUpiPayment,
  upiCapturePayment,
  upiCheckoutRide,
} from './sql/ride-upi.sql.js';
import { recordTripEvent } from '../driver_operations/sql/trip-lifecycle.sql.js';
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { nextEntityId } from '../../database/entity-id.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { requireActiveAccount } from '../../database/account-locks.js';
import { insertUserLog } from '../../database/user-log.js';
import { require_supported_ride_payment } from '../app_configuration/payment_policy.js';
import { RazorpayWallet } from './razorpay-wallet.js';
import { readWalletControls, payout_schedule_lock } from './wallet-controls.js';
import { ride_commission } from './cash-ride-entry.js';

export const ride_upi_provider = 'razorpay-ride';
const receipt_for = (id: string) =>
  'ride_' + createHash('sha256').update(id).digest('hex').slice(0, 35);
const lock_ride = async (tx: SqlClient, ride_id: string) => {
  await tx.query('SELECT pg_advisory_xact_lock_shared(720041)');
  await tx.query('SELECT pg_advisory_xact_lock(720044,hashtext($1))', [
    ride_id,
  ]);
};
const unavailable = () =>
  new AppError(
    503,
    'RIDE_UPI_UNAVAILABLE',
    'Razorpay UPI is unavailable for this ride.',
  );
const amount_paise = (payment: Pick<UpiPayment, 'amount'>) =>
  Number(new Decimal(payment.amount).mul(100).toFixed(0));
const reference_error = () =>
  new AppError(
    409,
    'RIDE_UPI_REFERENCE_MISMATCH',
    'This ride payment needs support review.',
  );

@Injectable()
export class RideUpi {
  constructor(
    private readonly db: PostgresService,
    private readonly provider: RazorpayWallet,
  ) {}

  async checkout(user_id: string, ride_id: string) {
    if (this.provider.credential_mode !== 'live') throw unavailable();
    const { payment, create_order } = await this.db.transaction(async (tx) => {
      await requireActiveAccount(tx, user_id);
      await lock_ride(tx, ride_id);
      const {
        rows: [ride],
      } = await tx.query<{
        status: string;
        currency: string;
        final_fare: string | null;
        driver_id: string | null;
        payment: UpiPayment | null;
        under_review: boolean;
        category_snapshot: JsonValue;
      }>(upiCheckoutRide, [ride_id, user_id]);
      if (!ride) throw new AppError(404, 'RIDE_NOT_FOUND', 'Ride not found.');
      if (ride.payment?.provider === ride_upi_provider) {
        if (!ride.payment.provider_order_claimed) throw reference_error();
        return { payment: ride.payment, create_order: false };
      }
      await tx.query('SELECT pg_advisory_xact_lock_shared($1::int)', [
        payout_schedule_lock,
      ]);
      if (!(await readWalletControls(tx)).razorpay_ride_upi_enabled)
        throw unavailable();
      require_supported_ride_payment(ride.category_snapshot, 'UPI');
      if (
        ride.status !== 'COMPLETED' ||
        ride.currency !== 'INR' ||
        !ride.final_fare ||
        !new Decimal(ride.final_fare).gte(1) ||
        !ride.driver_id ||
        ride.under_review ||
        (ride.payment &&
          (!['FAILED', 'PENDING'].includes(ride.payment.status) ||
            ride.payment.provider ||
            ride.payment.provider_payment_id ||
            ride.payment.provider_order_id))
      )
        throw new AppError(
          409,
          'RIDE_NOT_PAYABLE',
          'This ride is already paid or under review.',
        );
      const {
        rows: [claimed],
      } = await tx.query<UpiPayment>(
        `INSERT INTO payments (id,ride_id,amount,currency,provider,provider_order_claimed,collection_method,status,updated_at)
          VALUES ($1,$2,$3,$4,$5,true,'UPI','PENDING',clock_timestamp())
          ON CONFLICT (ride_id) DO UPDATE SET amount=EXCLUDED.amount,currency=EXCLUDED.currency,
            provider=EXCLUDED.provider,provider_order_claimed=true,collection_method='UPI',
            recipient_upi=NULL,status='PENDING',unpaid_reason=NULL,failed_at=NULL,payment_method_id=NULL,
            updated_at=clock_timestamp() RETURNING *`,
        [
          nextEntityId(),
          ride_id,
          ride.final_fare,
          ride.currency,
          ride_upi_provider,
        ],
      );
      if (!claimed) throw reference_error();
      return { payment: claimed, create_order: true };
    });
    if (!['PENDING', 'FAILED'].includes(payment.status))
      return this.present(payment);
    const receipt = receipt_for(ride_id);
    if (payment.provider_order_id)
      return this.present(await this.sync(payment));
    // The database claim is committed before the network request. An ambiguous
    // response recovers by receipt and never issues a second create.
    const order = create_order
      ? await this.provider.create_order(receipt, amount_paise(payment))
      : await this.provider.find_order(receipt);
    if (!order) return this.present(payment);
    if (order.receipt !== receipt || order.amount !== amount_paise(payment))
      throw reference_error();
    const {
      rows: [stored],
    } = await this.db.query<UpiPayment>(
      `UPDATE payments SET provider_order_id=$2,updated_at=clock_timestamp()
        WHERE id=$1 AND provider=$3 AND provider_order_claimed AND (provider_order_id IS NULL OR provider_order_id=$2)
        RETURNING *`,
      [payment.id, order.id, ride_upi_provider],
    );
    if (!stored) throw reference_error();
    return this.present(
      order.status === 'paid' ? await this.sync(stored) : stored,
    );
  }

  async check(user_id: string, ride_id: string) {
    const {
      rows: [payment],
    } = await this.db.query<UpiPayment>(ownedUpiPayment, [
      ride_id,
      ride_upi_provider,
      user_id,
    ]);
    if (!payment)
      throw new AppError(404, 'PAYMENT_NOT_FOUND', 'UPI payment not found.');
    const checked = await this.sync(payment);
    const reason =
      checked.status === 'FAILED' && checked.provider_order_id
        ? (
            await this.provider.order_failure(
              checked.provider_order_id,
              amount_paise(checked),
              'INR',
            )
          )?.reason
        : undefined;
    return {
      ...this.present(checked, false),
      ...(reason ? { failure_reason: reason } : {}),
    };
  }

  async reconcile_order(order_id: string) {
    const {
      rows: [payment],
    } = await this.db.query<UpiPayment>(
      'SELECT * FROM payments WHERE provider_order_id=$1',
      [order_id],
    );
    if (payment?.provider !== ride_upi_provider) return null;
    return this.sync(payment);
  }

  async flag_refund_or_dispute(
    payment_id: string,
    event: string,
    event_id: string,
    dispute_id?: string,
  ) {
    const {
      rows: [payment],
    } = await this.db.query<UpiPayment & { driver_user_id: string | null }>(
      `SELECT p.*,d.user_id AS driver_user_id FROM payments p JOIN rides r ON r.id=p.ride_id
        LEFT JOIN driver_profiles d ON d.id=r.driver_id WHERE p.provider_payment_id=$1`,
      [payment_id],
    );
    if (payment?.provider !== ride_upi_provider || !payment.driver_user_id)
      return false;
    if (this.provider.credential_mode !== 'live') throw unavailable();
    const result = await this.provider.payment(payment_id);
    if (
      result.id !== payment_id ||
      result.order_id !== payment.provider_order_id ||
      result.amount !== amount_paise(payment) ||
      result.currency !== payment.currency
    ) {
      throw reference_error();
    }
    const refunded = event === 'refund.processed';
    if (refunded && result.amount_refunded <= 0) throw unavailable();
    if (!refunded) {
      if (!dispute_id) throw reference_error();
      const dispute = await this.provider.dispute(dispute_id);
      if (
        dispute.id !== dispute_id ||
        dispute.payment_id !== payment_id ||
        dispute.currency !== payment.currency
      )
        throw reference_error();
    }
    const driver_id = payment.driver_user_id;
    await this.db.transaction(async (tx) => {
      await lock_ride(tx, payment.ride_id);
      await tx.query('SELECT pg_advisory_xact_lock($1::int)', [
        payout_schedule_lock,
      ]);
      const {
        rows: [seen],
      } = await tx.query<{ processed_at: Date | null }>(
        'SELECT processed_at FROM wallet_provider_events WHERE provider=$1 AND event_id=$2',
        [ride_upi_provider, event_id],
      );
      if (seen?.processed_at) return;
      const current = await requireUpiPayment(tx, payment.id);
      if (
        current.provider_payment_id !== payment_id ||
        current.provider !== ride_upi_provider
      )
        throw reference_error();
      if (refunded)
        await tx.query(
          "UPDATE payments SET status=$2,refunded_at=statement_timestamp(),updated_at=clock_timestamp() WHERE id=$1 AND status <> 'REFUNDED'",
          [
            payment.id,
            result.amount_refunded >= result.amount
              ? 'REFUNDED'
              : 'PARTIALLY_REFUNDED',
          ],
        );
      await tx.query(
        `INSERT INTO payout_driver_blocks (driver_id,actor_id,reason)
          VALUES ($1,'razorpay-ride','Razorpay ride refund or dispute requires settlement review.')
          ON CONFLICT(driver_id) DO UPDATE SET expires_at=NULL`,
        [driver_id],
      );
      await tx.query(
        `INSERT INTO wallet_provider_events (provider,event_id,event_type,subject_id,processed_at)
          VALUES ($1,$2,$3,$4,clock_timestamp()) ON CONFLICT(provider,event_id) DO UPDATE SET processed_at=EXCLUDED.processed_at`,
        [ride_upi_provider, event_id, event, payment.id],
      );
    });
    return true;
  }

  private async sync(payment: UpiPayment) {
    if (
      !['PENDING', 'FAILED'].includes(payment.status) ||
      !payment.provider_order_id
    )
      return payment;
    if (this.provider.credential_mode !== 'live') throw unavailable();
    const order = await this.provider.order(payment.provider_order_id);
    const amount = amount_paise(payment);
    if (
      order.id !== payment.provider_order_id ||
      order.receipt !== receipt_for(payment.ride_id) ||
      order.amount !== amount ||
      order.currency !== payment.currency
    )
      throw reference_error();
    const confirmed = await this.provider.settled_order_payment(order);
    if (!confirmed) {
      const failure =
        order.status === 'attempted' &&
        (await this.provider.order_failure(order.id, amount, payment.currency));
      if (failure && payment.status !== 'FAILED') {
        await this.db.query(
          `UPDATE payments SET status='FAILED',failed_at=statement_timestamp(),updated_at=clock_timestamp()
            WHERE id=$1 AND status='PENDING'`,
          [payment.id],
        );
        return requireUpiPayment(this.db, payment.id);
      }
      return payment;
    }
    if (confirmed.method !== 'upi') throw reference_error();
    if (confirmed.amount_refunded > 0) {
      return this.db.transaction(async (tx) => {
        await lock_ride(tx, payment.ride_id);
        const current = await requireUpiPayment(tx, payment.id);
        if (!['PENDING', 'FAILED'].includes(current.status)) return current;
        const {
          rows: [updated],
        } = await tx.query<UpiPayment>(
          `UPDATE payments SET provider_payment_id=$2,status=$3,refunded_at=statement_timestamp(),
            updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
          [
            current.id,
            confirmed.id,
            confirmed.amount_refunded === amount
              ? 'REFUNDED'
              : 'PARTIALLY_REFUNDED',
          ],
        );
        if (!updated) throw reference_error();
        return updated;
      });
    }
    if (confirmed.status !== 'captured') throw reference_error();
    return this.db.transaction(async (tx) => {
      await lock_ride(tx, payment.ride_id);
      const {
        rows: [current],
      } = await tx.query<
        UpiPayment & {
          rider_id: string;
          ride_status: string;
          driver_user_id: string | null;
          category_snapshot: JsonValue;
        }
      >(upiCapturePayment, [payment.id]);
      if (current?.status === 'CAPTURED') return current;
      if (
        !current ||
        current.provider !== ride_upi_provider ||
        current.provider_order_id !== order.id ||
        !['PENDING', 'FAILED'].includes(current.status) ||
        amount_paise(current) !== amount ||
        current.ride_status !== 'COMPLETED' ||
        !current.driver_user_id
      )
        throw reference_error();
      const { percent, commission } = ride_commission(
        BigInt(amount),
        current.category_snapshot,
      );
      const net = BigInt(amount) - commission;
      const {
        rows: [wallet],
      } = await tx.query<{
        id: string;
        available_paise: string;
        held_paise: string;
      }>(
        `INSERT INTO wallets (id,user_id,kind,available_paise) VALUES ($1,$2,'DRIVER',$3)
          ON CONFLICT(user_id,kind) DO UPDATE SET available_paise=wallets.available_paise+EXCLUDED.available_paise
          RETURNING id,available_paise,held_paise`,
        [nextEntityId(), current.driver_user_id, String(net)],
      );
      if (!wallet) throw reference_error();
      await tx.query(
        `INSERT INTO wallet_entries (id,wallet_id,kind,ride_id,payment_id,operation_key,available_delta_paise,
          held_delta_paise,available_after_paise,held_after_paise,commission_paise,commission_percent)
          VALUES ($1,$2,'RIDE_EARNING',$3,$4,$5,$6,0,$7,$8,$9,$10)`,
        [
          nextEntityId(),
          wallet.id,
          current.ride_id,
          current.id,
          `ride:${current.ride_id}:RIDE_EARNING`,
          String(net),
          wallet.available_paise,
          wallet.held_paise,
          String(commission),
          percent,
        ],
      );
      const {
        rows: [updated],
      } = await tx.query<UpiPayment>(
        `UPDATE payments SET status='CAPTURED',provider_payment_id=$2,paid_at=statement_timestamp(),
          failed_at=NULL,unpaid_reason=NULL,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
        [current.id, confirmed.id],
      );
      if (!updated) throw reference_error();
      await recordTripEvent(
        tx,
        current.ride_id,
        current.rider_id,
        'PAYMENT_CAPTURED',
        { method: 'UPI', provider: ride_upi_provider },
      );
      await insertUserLog(tx, {
        actor_id: current.rider_id,
        entity_type: 'Payment',
        entity_id: current.id,
        action: 'CAPTURE_RIDE_UPI',
        after_data: {
          ride_id: current.ride_id,
          amount_paise: String(amount),
          commission_paise: String(commission),
        },
      });
      return updated;
    });
  }

  private present(payment: UpiPayment, allow_checkout = true) {
    return {
      id: payment.id,
      status: payment.status,
      amount_paise: String(amount_paise(payment)),
      ...(allow_checkout &&
      payment.provider_order_id &&
      ['PENDING', 'FAILED'].includes(payment.status)
        ? {
            sdk_checkout: {
              key_id: config.RAZORPAY_WALLET_KEY_ID,
              order_id: payment.provider_order_id,
            },
          }
        : {}),
    };
  }
}

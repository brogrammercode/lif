import { Injectable } from '@nestjs/common';
import { AppError } from '../../core/error.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { nextEntityId } from '../../database/entity-id.js';
import { insertUserLog } from '../../database/user-log.js';
import { require_supported_ride_payment } from '../app_configuration/payment_policy.js';
import type {
  CheckoutInput,
  PaymentMethodInput,
  WebhookInput,
} from './payment.type.js';
import {
  PAYMENT_REFERENCE_MESSAGE,
  PAYMENT_AMOUNT_MESSAGE,
  PAYMENT_TRANSITIONS,
} from './payment.constant.js';
import { receiptSql } from './sql/receipt.sql.js';

type Method = PaymentMethodInput & { id: string; user_id: string };
type Payment = {
  id: string;
  ride_id: string;
  status: keyof typeof PAYMENT_TRANSITIONS;
  collection_method: PaymentMethodInput['type'] | null;
  provider: string | null;
  provider_payment_id: string | null;
  amount: string;
  paid_at: Date | null;
  failed_at: Date | null;
  refunded_at: Date | null;
};
type CheckoutRide = {
  id: string;
  status: string;
  final_fare: string | null;
  currency: string;
  snapshot: unknown;
};

const paymentProjection = 'payments.*, trim_scale(amount)::text AS amount';
function jsonDates(row: Record<string, unknown> | null) {
  if (!row) return row;
  for (const key of [
    'created_at',
    'updated_at',
    'paid_at',
    'failed_at',
    'refunded_at',
  ]) {
    if (typeof row[key] === 'string') row[key] = new Date(row[key]);
  }
  return row;
}

@Injectable()
export class PaymentRepository {
  constructor(private readonly db: PostgresService) {}

  private async lock(tx: SqlClient, scope: number, id: string) {
    await tx.query('SELECT pg_advisory_xact_lock($1::integer,hashtext($2))', [
      scope,
      id,
    ]);
  }

  readonly list_payment_methods = async (user: string) => {
    const result = await this.db.query<Method>(
      'SELECT * FROM payment_methods WHERE user_id=$1 ORDER BY is_default DESC,created_at DESC',
      [user],
    );
    return result.rows;
  };

  readonly create_payment_method = (user: string, input: PaymentMethodInput) =>
    this.db.transaction(async (tx) => {
      await this.lock(tx, 720046, user);
      const savedUpi = input.type === 'UPI' && !input.provider_method_id;
      if (savedUpi) {
        const existing = await tx.query<Method>(
          `SELECT * FROM payment_methods WHERE user_id=$1 AND type='UPI'
            AND provider_method_id IS NULL AND lower(upi_handle)=lower($2) LIMIT 1`,
          [user, input.upi_handle],
        );
        if (existing.rows[0]) return existing.rows[0];
      }
      const shouldDefault =
        !savedUpi &&
        (input.is_default ||
          !(
            await tx.query(
              'SELECT 1 FROM payment_methods WHERE user_id=$1 AND is_default LIMIT 1',
              [user],
            )
          ).rowCount);
      if (shouldDefault)
        await tx.query(
          'UPDATE payment_methods SET is_default=false,updated_at=clock_timestamp() WHERE user_id=$1',
          [user],
        );
      const saved = await tx.query<Method>(
        `INSERT INTO payment_methods (id,user_id,type,provider,provider_customer_id,
          provider_method_id,card_brand,card_last4,upi_handle,is_default,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp()) RETURNING *`,
        [
          nextEntityId(),
          user,
          input.type,
          input.provider,
          input.provider_customer_id,
          input.provider_method_id,
          input.card_brand,
          input.card_last4,
          input.upi_handle,
          shouldDefault,
        ],
      );
      const method = saved.rows[0]!;
      await insertUserLog(tx, {
        actor_id: user,
        entity_type: 'PaymentMethod',
        entity_id: method.id,
        action: 'CREATE_PAYMENT_METHOD',
        after_data: method,
      });
      return method;
    });

  readonly delete_payment_method = (user: string, id: string) =>
    this.db.transaction(async (tx) => {
      await this.lock(tx, 720046, user);
      const removed = await tx.query<Method>(
        'DELETE FROM payment_methods WHERE user_id=$1 AND id=$2 RETURNING *',
        [user, id],
      );
      const method = removed.rows[0];
      if (!method) return false;
      if (method.is_default)
        await tx.query(
          `UPDATE payment_methods SET is_default=true,updated_at=clock_timestamp() WHERE id=(
            SELECT id FROM payment_methods WHERE user_id=$1 AND (type<>'UPI' OR provider_method_id IS NOT NULL)
            ORDER BY created_at,id LIMIT 1)`,
          [user],
        );
      await insertUserLog(tx, {
        actor_id: user,
        entity_type: 'PaymentMethod',
        entity_id: id,
        action: 'DELETE_PAYMENT_METHOD',
        before_data: method,
      });
      return true;
    });

  readonly create_checkout = (user: string, input: CheckoutInput) =>
    this.db.transaction(async (tx) => {
      await this.lock(tx, 720044, input.ride_id);
      const rideResult = await tx.query<CheckoutRide>(
        `SELECT r.id,r.status,r.final_fare,r.currency,
          (SELECT category_snapshot FROM fare_quotes WHERE ride_id=r.id AND selected_at IS NOT NULL LIMIT 1) AS snapshot
        FROM rides r WHERE r.id=$1 AND r.rider_id=$2`,
        [input.ride_id, user],
      );
      const ride = rideResult.rows[0];
      if (!ride) return { kind: 'ride_not_found' as const };
      if (ride.status !== 'COMPLETED' || ride.final_fare === null)
        return { kind: 'invalid_state' as const };
      const existingResult = await tx.query<Payment>(
        'SELECT ' + paymentProjection + ' FROM payments WHERE ride_id=$1',
        [ride.id],
      );
      const existing = existingResult.rows[0];
      if (
        existing &&
        [
          'AUTHORIZED',
          'CAPTURED',
          'REFUNDED',
          'PARTIALLY_REFUNDED',
          'CANCELLED',
        ].includes(existing.status)
      )
        return { kind: 'success' as const, payment: existing };
      if (existing?.provider || existing?.provider_payment_id)
        return { kind: 'provider_unavailable' as const };
      const methods = await tx.query<Method>(
        'SELECT id,type FROM payment_methods WHERE id=$1 AND user_id=$2',
        [input.payment_method_id, user],
      );
      const method = methods.rows[0];
      if (!method) return { kind: 'method_not_found' as const };
      if (method.type !== 'CASH')
        return { kind: 'provider_unavailable' as const };
      require_supported_ride_payment(ride.snapshot, method.type);
      const result = await tx.query<Payment>(
        `INSERT INTO payments (id,ride_id,payment_method_id,collection_method,status,amount,currency,updated_at)
          VALUES ($1,$2,$3,'CASH','PENDING',$4,$5,clock_timestamp())
          ON CONFLICT (ride_id) DO UPDATE SET payment_method_id=EXCLUDED.payment_method_id,
            collection_method='CASH',recipient_upi=NULL,status='PENDING',
            amount=EXCLUDED.amount,paid_at=NULL,updated_at=clock_timestamp()
          RETURNING ${paymentProjection}`,
        [
          existing?.id ?? nextEntityId(),
          ride.id,
          method.id,
          ride.final_fare,
          ride.currency,
        ],
      );
      const payment = result.rows[0]!;
      await insertUserLog(tx, {
        actor_id: user,
        entity_type: 'Payment',
        entity_id: payment.id,
        action: 'CREATE_PAYMENT_CHECKOUT',
        after_data: payment,
      });
      return { kind: 'success' as const, payment };
    });

  readonly process_webhook = (provider: string, input: WebhookInput) =>
    this.db.transaction(async (tx) => {
      await this.lock(tx, 720045, `${provider}:${input.provider_payment_id}`);
      const found = await tx.query<{ id: string; ride_id: string }>(
        'SELECT id,ride_id FROM payments WHERE provider_payment_id=$1 OR ride_id=$2 LIMIT 1',
        [input.provider_payment_id, input.ride_id],
      );
      const payment = found.rows[0];
      if (!payment) return null;
      await this.lock(tx, 720044, payment.ride_id);
      const currentResult = await tx.query<
        Payment & { amount_matches: boolean | null }
      >(
        `SELECT ${paymentProjection}, amount=$2::numeric AS amount_matches FROM payments WHERE id=$1`,
        [payment.id, input.amount],
      );
      if (!currentResult.rows[0])
        throw new AppError(
          404,
          'NOT_FOUND',
          'The payment reference is unavailable.',
        );
      const { amount_matches, ...current } = currentResult.rows[0];
      if (current.collection_method === 'WALLET')
        throw new AppError(
          409,
          'WALLET_PAYMENT_WEBHOOK_UNSUPPORTED',
          'A ride paid from Wallet must be reconciled through the wallet ledger.',
        );
      if (
        current.collection_method === 'CASH' ||
        current.collection_method === 'UPI'
      )
        throw new AppError(
          409,
          'DIRECT_PAYMENT_WEBHOOK_UNSUPPORTED',
          'Direct cash and UPI receipts must be confirmed by the assigned driver or reviewed by an administrator.',
        );
      if (
        (input.ride_id && input.ride_id !== current.ride_id) ||
        (current.provider && current.provider !== provider) ||
        (current.provider_payment_id &&
          current.provider_payment_id !== input.provider_payment_id)
      )
        throw new AppError(
          409,
          'PAYMENT_REFERENCE_MISMATCH',
          PAYMENT_REFERENCE_MESSAGE,
        );
      if (
        input.amount !== undefined &&
        ['AUTHORIZED', 'CAPTURED'].includes(input.status) &&
        !amount_matches
      )
        throw new AppError(
          422,
          'PAYMENT_AMOUNT_MISMATCH',
          PAYMENT_AMOUNT_MESSAGE,
        );
      const same = current.status === input.status;
      if (!same && !PAYMENT_TRANSITIONS[current.status]?.includes(input.status))
        return current;
      if (
        same &&
        current.provider === provider &&
        current.provider_payment_id === input.provider_payment_id
      )
        return current;
      const changedAt = new Date();
      const statusTime = (previous: Date | null) =>
        same ? (previous ?? changedAt) : changedAt;
      const updatedResult = await tx.query<Payment>(
        `UPDATE payments SET provider=$2,provider_payment_id=$3,status=$4,
          paid_at=$5,failed_at=$6,refunded_at=$7,updated_at=clock_timestamp()
          WHERE id=$1 RETURNING ${paymentProjection}`,
        [
          payment.id,
          provider,
          input.provider_payment_id,
          input.status,
          input.status === 'CAPTURED'
            ? statusTime(current.paid_at)
            : current.paid_at,
          input.status === 'FAILED'
            ? statusTime(current.failed_at)
            : current.failed_at,
          ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(input.status)
            ? statusTime(current.refunded_at)
            : current.refunded_at,
        ],
      );
      if (!same)
        await tx.query(
          'INSERT INTO ride_events (id,ride_id,event_type,updated_at) VALUES ($1,$2,$3,clock_timestamp())',
          [nextEntityId(), payment.ride_id, `PAYMENT_${input.status}`],
        );
      const updated = updatedResult.rows[0]!;
      await insertUserLog(tx, {
        entity_type: 'Payment',
        entity_id: payment.id,
        action: 'PROCESS_PAYMENT_WEBHOOK',
        after_data: updated,
      });
      return updated;
    });

  readonly get_receipt = async (user: string, id: string) => {
    const result = await this.db.query<{
      payment: Record<string, unknown> | null;
      route: Record<string, unknown> | null;
    }>(receiptSql, [id, user]);
    const row = result.rows[0];
    return row
      ? { ...row, payment: jsonDates(row.payment), route: jsonDates(row.route) }
      : null;
  };
}

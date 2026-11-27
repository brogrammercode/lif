import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Payment } from '@prisma/client';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import type { TransactionClient } from '../../infra/database/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { require_active_account } from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { require_supported_ride_payment } from '../app_configuration/payment_policy.js';
import { RazorpayWallet } from './razorpay-wallet.js';
import {
  read_wallet_controls,
  payout_schedule_lock,
} from './wallet-controls.js';
import { ride_commission } from './cash-ride-entry.js';

export const ride_upi_provider = 'razorpay-ride';
const receipt_for = (id: string) =>
  'ride_' + createHash('sha256').update(id).digest('hex').slice(0, 35);
const lock_ride = async (tx: TransactionClient, ride_id: string) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${ride_id}))`;
};
const unavailable = () =>
  new AppError(
    503,
    'RIDE_UPI_UNAVAILABLE',
    'Razorpay UPI is unavailable for this ride.',
  );
const amount_paise = (payment: Pick<Payment, 'amount'>) =>
  Number(payment.amount.mul(100).toFixed(0));
const reference_error = () =>
  new AppError(
    409,
    'RIDE_UPI_REFERENCE_MISMATCH',
    'This ride payment needs support review.',
  );

@Injectable()
export class RideUpi {
  constructor(
    private readonly db: PrismaService,
    private readonly provider: RazorpayWallet,
  ) {}

  async checkout(user_id: string, ride_id: string) {
    if (this.provider.credential_mode !== 'live') throw unavailable();
    const { payment, create_order } = await this.db.client.$transaction(
      async (tx) => {
        await require_active_account(tx, user_id);
        await lock_ride(tx, ride_id);
        const ride = await tx.ride.findFirst({
          where: { id: ride_id, rider_id: user_id },
          include: {
            payment: true,
            settlement_review: true,
            quotes: {
              where: { selected_at: { not: null } },
              take: 1,
              orderBy: { selected_at: 'desc' },
              select: { category_snapshot: true },
            },
          },
        });
        if (!ride) throw new AppError(404, 'RIDE_NOT_FOUND', 'Ride not found.');
        if (ride.payment?.provider === ride_upi_provider) {
          if (!ride.payment.provider_order_claimed) throw reference_error();
          return { payment: ride.payment, create_order: false };
        }
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${payout_schedule_lock}::int)`;
        if (!(await read_wallet_controls(tx)).razorpay_ride_upi_enabled)
          throw unavailable();
        require_supported_ride_payment(
          ride.quotes[0]?.category_snapshot,
          'UPI',
        );
        if (
          ride.status !== 'COMPLETED' ||
          ride.currency !== 'INR' ||
          !ride.final_fare?.gte(1) ||
          !ride.driver_id ||
          ride.settlement_review ||
          (ride.payment &&
            (!['FAILED', 'PENDING'].includes(ride.payment.status) ||
              ride.payment.provider ||
              ride.payment.provider_payment_id ||
              ride.payment.provider_order_id))
        ) {
          throw new AppError(
            409,
            'RIDE_NOT_PAYABLE',
            'This ride is already paid or under review.',
          );
        }
        const selection = {
          provider: ride_upi_provider,
          provider_order_claimed: true,
          collection_method: 'UPI',
          recipient_upi: null,
          status: 'PENDING',
          amount: ride.final_fare,
          currency: ride.currency,
          unpaid_reason: null,
          failed_at: null,
          payment_method_id: null,
        } as const;
        const payment = await tx.payment.upsert({
          where: { ride_id },
          create: { ride_id, ...selection },
          update: selection,
        });
        return { payment, create_order: true };
      },
    );
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
    const stored = await this.db.client.payment.update({
      where: {
        id: payment.id,
        provider: ride_upi_provider,
        provider_order_claimed: true,
      },
      data: { provider_order_id: order.id },
    });
    return this.present(
      order.status === 'paid' ? await this.sync(stored) : stored,
    );
  }

  async check(user_id: string, ride_id: string) {
    const payment = await this.db.client.payment.findFirst({
      where: {
        ride_id,
        provider: ride_upi_provider,
        ride: { OR: [{ rider_id: user_id }, { driver: { user_id } }] },
      },
    });
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
    const payment = await this.db.client.payment.findUnique({
      where: { provider_order_id: order_id },
    });
    if (payment?.provider !== ride_upi_provider) return null;
    return this.sync(payment);
  }

  async flag_refund_or_dispute(
    payment_id: string,
    event: string,
    event_id: string,
    dispute_id?: string,
  ) {
    const payment = await this.db.client.payment.findUnique({
      where: { provider_payment_id: payment_id },
      include: { ride: { include: { driver: { select: { user_id: true } } } } },
    });
    if (payment?.provider !== ride_upi_provider || !payment.ride.driver)
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
    const driver_id = payment.ride.driver.user_id;
    await this.db.client.$transaction(async (tx) => {
      await lock_ride(tx, payment.ride_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${payout_schedule_lock}::int)`;
      const where = {
        provider_event_id: { provider: ride_upi_provider, event_id },
      };
      if ((await tx.walletProviderEvent.findUnique({ where }))?.processed_at)
        return;
      const status = refunded
        ? result.amount_refunded >= result.amount
          ? 'REFUNDED'
          : 'PARTIALLY_REFUNDED'
        : undefined;
      if (status) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status, refunded_at: new Date() },
        });
      }
      await tx.payoutDriverBlock.upsert({
        where: { driver_id },
        create: {
          driver_id,
          actor_id: 'razorpay-ride',
          reason: 'Razorpay ride refund or dispute requires settlement review.',
        },
        update: { expires_at: null },
      });
      await tx.walletProviderEvent.upsert({
        where,
        create: {
          provider: ride_upi_provider,
          event_id,
          event_type: event,
          subject_id: payment.id,
          processed_at: new Date(),
        },
        update: { processed_at: new Date() },
      });
    });
    return true;
  }

  private async sync(payment: Payment) {
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
        await this.db.client.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: { status: 'FAILED', failed_at: new Date() },
        });
        return this.db.client.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
      }
      return payment;
    }
    if (confirmed.method !== 'upi') throw reference_error();
    if (confirmed.amount_refunded > 0) {
      return this.db.client.$transaction(async (tx) => {
        await lock_ride(tx, payment.ride_id);
        const current = await tx.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
        if (!['PENDING', 'FAILED'].includes(current.status)) return current;
        return tx.payment.update({
          where: { id: current.id },
          data: {
            provider_payment_id: confirmed.id,
            status:
              confirmed.amount_refunded === amount
                ? 'REFUNDED'
                : 'PARTIALLY_REFUNDED',
            refunded_at: new Date(),
          },
        });
      });
    }
    if (confirmed.status !== 'captured') throw reference_error();
    return this.db.client.$transaction(async (tx) => {
      await lock_ride(tx, payment.ride_id);
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: {
          ride: {
            include: {
              driver: { select: { user_id: true } },
              quotes: {
                where: { selected_at: { not: null } },
                take: 1,
                orderBy: { selected_at: 'desc' },
                select: { category_snapshot: true },
              },
            },
          },
        },
      });
      if (current.status === 'CAPTURED') return current;
      if (
        current.provider !== ride_upi_provider ||
        current.provider_order_id !== order.id ||
        !['PENDING', 'FAILED'].includes(current.status) ||
        amount_paise(current) !== amount ||
        current.ride.status !== 'COMPLETED' ||
        !current.ride.driver
      )
        throw reference_error();
      const { percent, commission } = ride_commission(
        BigInt(amount),
        current.ride.quotes[0]?.category_snapshot,
      );
      const net = BigInt(amount) - commission;
      const user_id = current.ride.driver.user_id;
      const wallet = await tx.wallet.upsert({
        where: { user_id_kind: { user_id, kind: 'DRIVER' } },
        create: { user_id, kind: 'DRIVER', available_paise: net },
        update: { available_paise: { increment: net } },
      });
      await tx.walletEntry.create({
        data: {
          wallet_id: wallet.id,
          kind: 'RIDE_EARNING',
          ride_id: current.ride_id,
          payment_id: current.id,
          operation_key: `ride:${current.ride_id}:RIDE_EARNING`,
          available_delta_paise: net,
          held_delta_paise: 0n,
          available_after_paise: wallet.available_paise,
          held_after_paise: wallet.held_paise,
          commission_paise: commission,
          commission_percent: percent,
        },
      });
      const updated = await tx.payment.update({
        where: { id: current.id },
        data: {
          status: 'CAPTURED',
          provider_payment_id: confirmed.id,
          paid_at: new Date(),
          failed_at: null,
          unpaid_reason: null,
        },
      });
      await tx.rideEvent.create({
        data: {
          ride_id: current.ride_id,
          actor_id: current.ride.rider_id,
          event_type: 'PAYMENT_CAPTURED',
          metadata: { method: 'UPI', provider: ride_upi_provider },
        },
      });
      await create_user_log(tx, {
        actor_id: current.ride.rider_id,
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

  private present(payment: Payment, allow_checkout = true) {
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

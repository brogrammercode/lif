import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { Prisma } from '@prisma/client';
import { create_user_log } from '../../infra/database/user_log.js';
import type {
  CheckoutInput,
  PaymentMethodInput,
  WebhookInput,
} from './payment.type.js';
import { AppError } from '../../core/error.js';
import { require_supported_ride_payment } from '../app_configuration/payment_policy.js';
import {
  rider_driver_select,
  rider_vehicle_select,
} from '../ride/ride.presentation.js';
import {
  PAYMENT_REFERENCE_MESSAGE,
  PAYMENT_AMOUNT_MESSAGE,
  PAYMENT_TRANSITIONS,
} from './payment.constant.js';
@Injectable()
export class PaymentRepository {
  constructor(private readonly prismaService: PrismaService) {}
  readonly list_payment_methods = (user_id: string) =>
    this.prismaService.client.paymentMethod.findMany({
      where: { user_id },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
    });

  readonly create_payment_method = async (
    user_id: string,
    input: PaymentMethodInput,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720046, hashtext(${user_id}))`;
      const is_default =
        input.is_default ||
        !(await tx.paymentMethod.count({
          where: { user_id, is_default: true },
        }));
      if (is_default)
        await tx.paymentMethod.updateMany({
          where: { user_id },
          data: { is_default: false },
        });
      const method = await tx.paymentMethod.create({
        data: { ...input, user_id, is_default },
      });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'PaymentMethod',
        entity_id: method.id,
        action: 'CREATE_PAYMENT_METHOD',
        after_data: method as unknown as Prisma.InputJsonObject,
      });
      return method;
    });

  readonly delete_payment_method = async (
    user_id: string,
    payment_method_id: string,
  ) =>
    this.prismaService.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720046, hashtext(${user_id}))`;
      const method = await tx.paymentMethod.findFirst({
        where: { id: payment_method_id, user_id },
      });
      if (!method) return false;
      await tx.paymentMethod.delete({ where: { id: payment_method_id } });
      if (method.is_default) {
        const next = await tx.paymentMethod.findFirst({
          where: { user_id },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        if (next)
          await tx.paymentMethod.update({
            where: { id: next.id },
            data: { is_default: true },
          });
      }
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'PaymentMethod',
        entity_id: payment_method_id,
        action: 'DELETE_PAYMENT_METHOD',
        before_data: method as unknown as Prisma.InputJsonObject,
      });
      return true;
    });

  readonly create_checkout = async (user_id: string, input: CheckoutInput) =>
    this.prismaService.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${input.ride_id}))`;
      const ride = await tx.ride.findFirst({
        where: { id: input.ride_id, rider_id: user_id },
        include: {
          quotes: {
            where: { selected_at: { not: null } },
            select: { category_snapshot: true },
            take: 1,
          },
        },
      });
      if (!ride) return { kind: 'ride_not_found' as const };
      if (ride.status !== 'COMPLETED' || ride.final_fare === null)
        return { kind: 'invalid_state' as const };
      const existing = await tx.payment.findUnique({
        where: { ride_id: ride.id },
      });
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
      const method = await tx.paymentMethod.findFirst({
        where: { id: input.payment_method_id, user_id },
      });
      if (!method) return { kind: 'method_not_found' as const };
      if (method.type !== 'CASH')
        return { kind: 'provider_unavailable' as const };
      require_supported_ride_payment(
        ride.quotes[0]?.category_snapshot,
        method.type,
      );
      const status = 'PENDING' as const;
      const payment = await tx.payment.upsert({
        where: { ride_id: ride.id },
        update: {
          payment_method_id: method.id,
          collection_method: 'CASH',
          recipient_upi: null,
          status,
          amount: ride.final_fare ?? ride.estimated_fare ?? 0,
          paid_at: null,
        },
        create: {
          ride_id: ride.id,
          payment_method_id: method.id,
          collection_method: 'CASH',
          status,
          amount: ride.final_fare ?? ride.estimated_fare ?? 0,
          currency: ride.currency,
        },
      });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'Payment',
        entity_id: payment.id,
        action: 'CREATE_PAYMENT_CHECKOUT',
        after_data: payment as unknown as Prisma.InputJsonObject,
      });
      return { kind: 'success' as const, payment };
    });

  readonly process_webhook = async (provider: string, input: WebhookInput) =>
    this.prismaService.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720045, hashtext(${`${provider}:${input.provider_payment_id}`}))`;
      const payment = await tx.payment.findFirst({
        where: {
          OR: [
            { provider_payment_id: input.provider_payment_id },
            ...(input.ride_id ? [{ ride_id: input.ride_id }] : []),
          ],
        },
      });
      if (!payment) return null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${payment.ride_id}))`;
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
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
        !current.amount.equals(input.amount)
      )
        throw new AppError(
          422,
          'PAYMENT_AMOUNT_MISMATCH',
          PAYMENT_AMOUNT_MESSAGE,
        );
      const same_status = current.status === input.status;
      if (
        !same_status &&
        !PAYMENT_TRANSITIONS[current.status]?.includes(input.status)
      )
        return current;
      if (
        same_status &&
        current.provider === provider &&
        current.provider_payment_id === input.provider_payment_id
      )
        return current;
      const changed_at = new Date();
      const status_time = (previous: Date | null) =>
        same_status ? (previous ?? changed_at) : changed_at;
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          provider,
          provider_payment_id: input.provider_payment_id,
          status: input.status,
          paid_at:
            input.status === 'CAPTURED'
              ? status_time(current.paid_at)
              : current.paid_at,
          failed_at:
            input.status === 'FAILED'
              ? status_time(current.failed_at)
              : current.failed_at,
          refunded_at: ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(input.status)
            ? status_time(current.refunded_at)
            : current.refunded_at,
        },
      });
      if (!same_status)
        await tx.rideEvent.create({
          data: {
            ride_id: payment.ride_id,
            event_type: `PAYMENT_${input.status}`,
          },
        });
      await create_user_log(tx, {
        entity_type: 'Payment',
        entity_id: payment.id,
        action: 'PROCESS_PAYMENT_WEBHOOK',
        after_data: updated as unknown as Prisma.InputJsonObject,
      });
      return updated;
    });

  readonly get_receipt = async (user_id: string, ride_id: string) =>
    this.prismaService.client.ride.findFirst({
      where: { id: ride_id, rider_id: user_id },
      include: {
        payment: true,
        driver: { select: rider_driver_select },
        vehicle: { select: rider_vehicle_select },
        route: true,
      },
    });
}

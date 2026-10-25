import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { TransactionClient } from '../../infra/database/client.js';
import {
  require_active_account,
  require_active_admin,
  require_driver_participation,
} from '../../infra/database/account_lifecycle.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { AppError } from '../../core/error.js';
import {
  finance_range,
  finance_query,
  payout_request,
  payout_review,
} from './driver_account.type.js';
import { mask_payout, reveal_payout, seal_payout } from './payout_security.js';
import type { z } from 'zod';
const options = { maxWait: 10000, timeout: 20000 };
function read_payout(value: string) {
  try {
    return reveal_payout(value);
  } catch {
    throw new AppError(
      409,
      'PAYOUT_DETAILS_UNAVAILABLE',
      'These stored account details could not be read. Reject a pending request and ask the driver to submit new details, or contact the operator to restore the encryption key.',
    );
  }
}
const public_change = {
  id: true,
  user_id: true,
  status: true,
  version: true,
  summary: true,
  rejection_reason: true,
  created_at: true,
  reviewed_at: true,
} as const;
@Injectable()
export class DriverAccountService {
  constructor(private readonly db: PrismaService) {}
  async driver(tx: TransactionClient, user_id: string) {
    const profile = await tx.driverProfile.findUnique({ where: { user_id } });
    if (!profile)
      throw new AppError(
        404,
        'DRIVER_PROFILE_REQUIRED',
        'This account has no driver profile.',
      );
    return profile;
  }
  async account(user_id: string) {
    return this.db.client.$transaction(
      async (tx) => {
        const profile = await this.driver(tx, user_id);
        const app = await tx.partnerApplication.findUnique({
          where: { user_id },
          select: {
            id: true,
            status: true,
            final_pdf_id: true,
            activated_at: true,
            fields: {
              select: {
                id: true,
                status: true,
                rejection_reason: true,
                definition: true,
                value: true,
              },
            },
          },
        });
        const changes = await tx.driverPayoutChange.findMany({
          where: { user_id },
          select: public_change,
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 30,
        });
        const approved = await tx.driverPayoutChange.findFirst({
          where: { user_id, status: 'APPROVED' },
          select: public_change,
          orderBy: [{ reviewed_at: 'desc' }, { id: 'desc' }],
        });
        const initial_payout = (app?.fields ?? []).flatMap((field) => {
          if (
            field.status !== 'APPROVED' ||
            typeof field.value !== 'string' ||
            !field.definition ||
            typeof field.definition !== 'object' ||
            Array.isArray(field.definition)
          )
            return [];
          const label = String(field.definition.label ?? ''),
            name = (
              String(field.definition.key ?? '') +
              ' ' +
              label
            ).toLowerCase();
          const value = field.value.trim();
          if (/\bupi\b|upi_/.test(name) && value.includes('@'))
            return [{ label, display: '***@' + value.split('@')[1] }];
          if (/ifsc/.test(name) && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value))
            return [{ label, display: value }];
          if (
            /bank.*account|account.*number/.test(name) &&
            /^\d{9,18}$/.test(value)
          )
            return [{ label, display: '****' + value.slice(-4) }];
          return [];
        });
        return {
          driver: {
            id: profile.id,
            availability: profile.availability,
            verification_status: profile.verification_status,
          },
          application: app
            ? {
                ...app,
                fields: app.fields.map(({ value, ...field }) => {
                  const definition = field.definition;
                  const file =
                    definition &&
                    typeof definition === 'object' &&
                    !Array.isArray(definition) &&
                    ['FILE', 'IMAGE', 'PDF'].includes(
                      String(definition.field_type),
                    );
                  return {
                    ...field,
                    asset_ids: file
                      ? (Array.isArray(value) ? value : [value]).filter(
                          (v): v is string => typeof v === 'string',
                        )
                      : [],
                  };
                }),
              }
            : null,
          payout_changes: changes,
          approved_payout: approved,
          initial_payout,
          exited: app?.status === 'EXITED',
          as_of: new Date(),
        };
      },
      {
        ...options,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
  }
  async request(user_id: string, input: z.infer<typeof payout_request>) {
    return this.db.client.$transaction(async (tx) => {
      await require_active_account(tx, user_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${user_id}))`;
      await this.driver(tx, user_id);
      await require_driver_participation(tx, user_id);
      const replay = await tx.driverPayoutChange.findUnique({
        where: {
          user_id_request_key: { user_id, request_key: input.request_key },
        },
      });
      if (replay) {
        if (
          JSON.stringify(read_payout(replay.details_ciphertext)) !==
          JSON.stringify(input.details)
        )
          throw new AppError(
            409,
            'PAYOUT_REPLAY_CONFLICT',
            'This request key was used for different details.',
          );
        const { details_ciphertext: _, ...row } = replay;
        return row;
      }
      if (
        await tx.driverPayoutChange.findFirst({
          where: { user_id, status: 'PENDING' },
        })
      )
        throw new AppError(
          409,
          'PAYOUT_CHANGE_PENDING',
          'Wait for the pending account review before submitting another change.',
        );
      const summary = mask_payout(input.details);
      const saved = await tx.driverPayoutChange.create({
        data: {
          user_id,
          request_key: input.request_key,
          details_ciphertext: seal_payout(input.details),
          summary,
        },
        select: public_change,
      });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'DriverPayoutChange',
        entity_id: saved.id,
        action: 'REQUEST_PAYOUT_CHANGE',
        after_data: summary,
      });
      return saved;
    }, options);
  }
  async review(
    actor_id: string,
    id: string,
    input: z.infer<typeof payout_review>,
  ) {
    return this.db.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      const before = await tx.driverPayoutChange.findUnique({ where: { id } });
      if (!before)
        throw new AppError(
          404,
          'PAYOUT_CHANGE_NOT_FOUND',
          'This account change was not found.',
        );
      await require_active_account(tx, before.user_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720043, hashtext(${before.user_id}))`;
      await require_driver_participation(tx, before.user_id);
      if (input.status === 'APPROVED') read_payout(before.details_ciphertext);
      const claimed = await tx.driverPayoutChange.updateMany({
        where: { id, status: 'PENDING', version: input.expected_version },
        data: {
          status: input.status,
          version: { increment: 1 },
          reviewed_by_id: actor_id,
          reviewed_at: new Date(),
          rejection_reason: input.note,
        },
      });
      if (claimed.count !== 1)
        throw new AppError(
          409,
          'PAYOUT_CHANGE_CONFLICT',
          'This request changed. Reload before reviewing.',
        );
      await create_user_log(tx, {
        actor_id,
        entity_type: 'DriverPayoutChange',
        entity_id: id,
        action: 'REVIEW_PAYOUT_CHANGE',
        after_data: { status: input.status, note: input.note },
      });
      await tx.notification.create({
        data: {
          user_id: before.user_id,
          type: 'SYSTEM',
          title: 'Payout account ' + input.status.toLowerCase(),
          body: input.note,
          data: { driver_account: true },
        },
      });
      return tx.driverPayoutChange.findUniqueOrThrow({
        where: { id },
        select: public_change,
      });
    }, options);
  }
  async reveal(actor_id: string, id: string) {
    return this.db.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      const row = await tx.driverPayoutChange.findUnique({ where: { id } });
      if (!row)
        throw new AppError(
          404,
          'PAYOUT_CHANGE_NOT_FOUND',
          'This account change was not found.',
        );
      await create_user_log(tx, {
        actor_id,
        entity_type: 'DriverPayoutChange',
        entity_id: id,
        action: 'VIEW_PRIVATE_PAYOUT_DETAILS',
      });
      return { id, details: read_payout(row.details_ciphertext) };
    }, options);
  }
  async finance(user_id: string, input: z.infer<typeof finance_query>) {
    let range;
    try {
      range = finance_range(input);
    } catch {
      throw new AppError(
        422,
        'DATE_RANGE_INVALID',
        'Choose a date range of 1 to 93 days.',
      );
    }
    const date = { gte: range.from, lt: range.until };
    return this.db.client.$transaction(
      async (tx) => {
        const driver = await this.driver(tx, user_id);
        const tripWhere = {
          driver_id: driver.id,
          status: 'COMPLETED' as const,
          completed_at: date,
        };
        const chargeWhere = {
          driver_id: driver.id,
          updated_at: date,
          kind: { not: 'UNPAID' },
        };
        const [earned, unrecorded, collections, charges, rows, total] =
          await Promise.all([
            tx.ride.aggregate({
              where: tripWhere,
              _sum: { final_fare: true },
              _count: { _all: true, final_fare: true },
            }),
            tx.ride.aggregate({
              where: { ...tripWhere, payment: { is: null } },
              _sum: { final_fare: true },
            }),
            tx.payment.groupBy({
              by: ['status', 'collection_method'],
              where: { ride: tripWhere },
              _sum: { amount: true },
              _count: { _all: true },
            }),
            tx.rideSettlementReview.groupBy({
              by: ['status'],
              where: chargeWhere,
              _sum: { fee_amount: true },
            }),
            input.section === 'trips'
              ? tx.ride.findMany({
                  where: tripWhere,
                  select: {
                    id: true,
                    completed_at: true,
                    pickup_address: true,
                    dropoff_address: true,
                    final_fare: true,
                    currency: true,
                    payment: {
                      select: {
                        status: true,
                        amount: true,
                        collection_method: true,
                        paid_at: true,
                      },
                    },
                  },
                  orderBy: [{ completed_at: 'desc' }, { id: 'desc' }],
                  skip: (input.page - 1) * 20,
                  take: 20,
                })
              : tx.rideSettlementReview.findMany({
                  where: chargeWhere,
                  select: {
                    id: true,
                    ride_id: true,
                    kind: true,
                    status: true,
                    reason: true,
                    fee_amount: true,
                    updated_at: true,
                    resolution_note: true,
                  },
                  orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
                  skip: (input.page - 1) * 20,
                  take: 20,
                }),
            input.section === 'trips'
              ? tx.ride.count({ where: tripWhere })
              : tx.rideSettlementReview.count({ where: chargeWhere }),
          ]);
        const sum = (status: string, method?: string) =>
          collections
            .filter(
              (v) =>
                v.status === status &&
                (!method || v.collection_method === method),
            )
            .reduce((s, v) => s.add(v._sum.amount ?? 0), new Prisma.Decimal(0));
        const chargeSum = (status: string) =>
          charges
            .filter((v) => v.status === status)
            .reduce(
              (s, v) => s.add(v._sum.fee_amount ?? 0),
              new Prisma.Decimal(0),
            );
        return {
          from: range.from.toISOString().slice(0, 10),
          to: new Date(range.until.getTime() - 86400000)
            .toISOString()
            .slice(0, 10),
          as_of: new Date(),
          summary: {
            gross_fares: earned._sum.final_fare ?? new Prisma.Decimal(0),
            completed_trips: earned._count._all,
            unpriced_trips: earned._count._all - earned._count.final_fare,
            cash_received: sum('CAPTURED', 'CASH'),
            upi_received: sum('CAPTURED', 'UPI'),
            collection_pending: sum('PENDING').add(sum('FAILED')),
            receipt_unrecorded:
              unrecorded._sum.final_fare ?? new Prisma.Decimal(0),
            other_received: sum('CAPTURED')
              .sub(sum('CAPTURED', 'CASH'))
              .sub(sum('CAPTURED', 'UPI')),
            waived: sum('CANCELLED'),
            provider_resolved: sum('REFUNDED')
              .add(sum('PARTIALLY_REFUNDED'))
              .add(sum('AUTHORIZED'))
              .add(sum('REQUIRES_ACTION')),
            approved_charges_due: chargeSum('APPROVED'),
            charges_received: chargeSum('SETTLED'),
            charges_under_review: chargeSum('REQUESTED').add(
              chargeSum('DISPUTED'),
            ),
            commission: '0.00',
            platform_payout: '0.00',
          },
          rows,
          total,
          page: input.page,
          page_size: 20,
          section: input.section,
        };
      },
      {
        ...options,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
  }
}

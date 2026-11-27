import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type WalletEntry,
  type WalletEntryKind,
  type WalletKind,
} from '@prisma/client';
import { AppError } from '../../core/error.js';
import {
  require_active_account,
  require_active_admin,
} from '../../infra/database/account_lifecycle.js';
import type { z } from 'zod';
import {
  next_payout_run,
  present_payout_schedule,
  type payout_settings_schema,
} from './payout-schedule.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { create_user_log } from '../../infra/database/user_log.js';
import {
  gateway_credential_mode,
  has_wallet_funding,
  payout_schedule_id,
  payout_schedule_lock,
  present_wallet_settings,
  read_wallet_controls,
} from './wallet-controls.js';

const topup_activity_select = {
  id: true,
  wallet_id: true,
  status: true,
  amount_paise: true,
  failure_reason: true,
  checkout_kind: true,
  provider_mode: true,
  provider_link_id: true,
  provider_order_id: true,
  provider_payment_id: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.WalletTopUpSelect;
type ActivityTopUp = Prisma.WalletTopUpGetPayload<{
  select: typeof topup_activity_select;
}>;

function present_activity_topup({
  wallet_id: _wallet_id,
  amount_paise,
  ...row
}: ActivityTopUp) {
  return { ...row, amount_paise: String(amount_paise) };
}

const unpaid_earnings = (cutoff: Date) => Prisma.sql`
  e.kind = 'RIDE_EARNING' AND e.available_delta_paise > 0
  AND e.created_at <= ${cutoff}
  AND NOT EXISTS (
    SELECT 1 FROM wallet_entries r
    WHERE r.reverses_entry_id = e.id AND r.kind = 'REFUND'
  )
  AND NOT EXISTS (
    SELECT 1 FROM driver_payout_lines l JOIN driver_payouts p ON p.id = l.payout_id
    WHERE l.source_entry_id = e.id AND p.status NOT IN ('EXCLUDED', 'FAILED', 'REVERSED')
  )
`;

@Injectable()
export class WalletRepository {
  constructor(private readonly database: PrismaService) {}

  async schedule() {
    const settings = present_payout_schedule(
      await this.database.client.payoutSchedule.findUnique({
        where: { id: payout_schedule_id },
      }),
    );
    return present_wallet_settings(this.database.client, settings);
  }

  async upcoming(page: number, page_size: number) {
    return this.database.client.$transaction(
      async (tx) => {
        const schedule = present_payout_schedule(
          await tx.payoutSchedule.findUnique({
            where: { id: payout_schedule_id },
          }),
        );
        const cutoff = schedule.next_run_at;
        if (!cutoff) return { next_run_at: null, rows: [], has_more: false };
        const as_of = new Date();
        const rows = await tx.$queryRaw<
          {
            driver_id: string;
            driver_name: string;
            gross_paise: string;
            commission_paise: string;
            net_paise: string;
            eligibility: string;
          }[]
        >`
        WITH earnings AS (
          SELECT e.wallet_id, SUM(e.available_delta_paise) AS net,
            SUM(COALESCE(e.commission_paise, 0)) AS commission
          FROM wallet_entries e WHERE ${unpaid_earnings(cutoff)}
          GROUP BY e.wallet_id
        )
        SELECT u.id AS driver_id, trim(concat_ws(' ', u.first_name, u.last_name)) AS driver_name,
          (e.net + e.commission)::text AS gross_paise,
          e.commission::text AS commission_paise, e.net::text AS net_paise,
          CASE WHEN u.status <> 'ACTIVE' OR u.deleted_at IS NOT NULL THEN 'Inactive account'
            WHEN EXISTS (SELECT 1 FROM payout_driver_blocks b
              WHERE b.driver_id = u.id AND (b.expires_at IS NULL OR b.expires_at > ${as_of}))
              THEN 'Payout blocked'
            WHEN NOT EXISTS (SELECT 1 FROM driver_payout_methods m
              WHERE m.driver_id = u.id AND m.kind = 'UPI' AND m.status = 'VERIFIED'
                AND m.is_default AND m.provider_fund_account_id IS NOT NULL)
              THEN 'Verified payout method required'
            WHEN e.net < ${BigInt(schedule.minimum_paise)} OR e.net < 100 THEN 'Below minimum'
            WHEN e.net > ${BigInt(Number.MAX_SAFE_INTEGER)} THEN 'Amount exceeds limit'
            WHEN e.net > w.available_paise THEN 'Insufficient available earnings'
            ELSE 'Eligible' END AS eligibility
        FROM earnings e JOIN wallets w ON w.id = e.wallet_id JOIN users u ON u.id = w.user_id
        ORDER BY e.net DESC, u.id
        LIMIT ${page_size + 1} OFFSET ${(page - 1) * page_size}
      `;
        return {
          next_run_at: cutoff,
          rows: rows.slice(0, page_size),
          has_more: rows.length > page_size,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async save_schedule(
    actor_id: string,
    input: z.infer<typeof payout_settings_schema>,
  ) {
    return this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${payout_schedule_lock}::int)`;
      const where = { id: payout_schedule_id };
      const current = await tx.payoutSchedule.findUnique({ where });
      if ((current?.version ?? 0) !== input.expected_version)
        throw new AppError(
          409,
          'PAYOUT_SCHEDULE_CHANGED',
          'Payout schedule changed. Reload before saving.',
        );
      const { expected_version: _, next_run_override, ...values } = input;
      const mode =
        values.wallet_topup_mode ?? current?.wallet_topup_mode ?? 'disabled';
      if (
        mode === 'live' &&
        !(
          values.wallet_live_topup_approved ??
          current?.wallet_live_topup_approved
        )
      )
        throw new AppError(
          422,
          'WALLET_LIVE_APPROVAL_REQUIRED',
          'Confirm the approved live wallet arrangement before enabling live top-ups.',
        );
      const transfers =
        values.razorpay_x_transfers_enabled ??
        current?.razorpay_x_transfers_enabled ??
        false;
      if (mode !== 'disabled' || transfers) {
        const incompatible_mode =
          mode === 'test' && !transfers ? 'live' : 'test';
        if (
          (mode === 'test' && transfers) ||
          (await has_wallet_funding(tx, incompatible_mode))
        )
          throw new AppError(
            422,
            'WALLET_FUNDING_MODE_CONFLICT',
            'Keep test funding and live payment or payout settings in separate databases.',
          );
      }
      const now = new Date();
      const override = next_run_override ? new Date(next_run_override) : null;
      if (override && (!values.enabled || override <= now))
        throw new AppError(
          422,
          'PAYOUT_RUN_DATE_INVALID',
          'Enable the schedule and choose a future payout date and time.',
        );
      const timing_changed =
        !current?.enabled ||
        values.frequency !== current.frequency ||
        values.minute_of_day_ist !== current.minute_of_day_ist ||
        (values.frequency === 'WEEKLY' &&
          values.weekday_ist !== current.weekday_ist) ||
        (values.frequency === 'MONTHLY' &&
          values.month_day_ist !== current.month_day_ist);
      const reset = timing_changed || next_run_override === null;
      const recurring_run = reset
        ? next_payout_run(values, now)
        : (current?.replaced_run_at ??
          current?.next_run_at ??
          next_payout_run(values, current?.updated_at));
      const next_run_at = values.enabled
        ? (override ??
          (reset ? recurring_run : (current?.next_run_at ?? recurring_run)))
        : null;
      const replaced_run_at =
        !values.enabled || (reset && !override)
          ? null
          : override
            ? recurring_run
            : (current?.replaced_run_at ?? null);
      const last =
        next_run_at && override
          ? await tx.payoutCycle.findFirst({
              where: { schedule_id: payout_schedule_id },
              orderBy: { cutoff_at: 'desc' },
              select: { cutoff_at: true },
            })
          : null;
      if (last && override && override <= last.cutoff_at)
        throw new AppError(
          422,
          'PAYOUT_RUN_DATE_INVALID',
          'Choose a date after the last recorded cycle.',
        );
      const data = {
        ...values,
        minimum_paise: BigInt(values.minimum_paise),
        next_run_at,
        replaced_run_at,
      };
      const saved = await tx.payoutSchedule.upsert({
        where,
        create: { ...where, ...data },
        update: { ...data, version: { increment: 1 } },
      });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'PayoutSchedule',
        entity_id: saved.id,
        action: 'UPDATE_PAYOUT_SCHEDULE',
        before_data: present_payout_schedule(current),
        after_data: present_payout_schedule(saved),
      });
      return present_wallet_settings(tx, present_payout_schedule(saved));
    });
  }

  async prepare_due_cycles(now: Date, deadline: number) {
    for (let batch = 0; batch < 10 && Date.now() < deadline; batch++) {
      const cycle = await this.prepare_due_cycle(now);
      if (!cycle.prepared) break;
    }
  }

  async prepare_due_cycle(now = new Date()) {
    return this.database.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720065)`;
      const schedule = await tx.payoutSchedule.findUnique({
        where: { id: payout_schedule_id },
      });
      if (!schedule?.enabled) return { prepared: false };
      const due =
        schedule.next_run_at ?? next_payout_run(schedule, schedule.updated_at);
      if (due > now) return { prepared: false };
      const last = await tx.payoutCycle.findFirst({
        where: { schedule_id: schedule.id },
        orderBy: { cutoff_at: 'desc' },
        select: { cutoff_at: true },
      });
      const cycle = await tx.payoutCycle.upsert({
        where: {
          schedule_id_cutoff_at: { schedule_id: schedule.id, cutoff_at: due },
        },
        create: {
          schedule_id: schedule.id,
          period_start: last?.cutoff_at ?? schedule.updated_at,
          cutoff_at: due,
          scheduled_at: due,
          schedule_snapshot: {
            version: schedule.version,
            frequency: schedule.frequency,
            minimum_paise: String(schedule.minimum_paise),
            require_approval: schedule.require_approval,
          },
        },
        update: {},
        select: { id: true },
      });
      // Draft lines report net earnings; the transfer worker must separately
      // validate eligibility and reserve funds before submitting a payout.
      await tx.$executeRaw`
        WITH earnings AS MATERIALIZED (
          SELECT e.id, e.wallet_id, e.ride_id, e.available_delta_paise
          FROM wallet_entries e
          JOIN wallets w ON w.id = e.wallet_id
        WHERE ${unpaid_earnings(due)}
            AND NOT EXISTS (
              SELECT 1 FROM payout_driver_blocks b
              WHERE b.driver_id = w.user_id AND (b.expires_at IS NULL OR b.expires_at > ${now})
            )
        ), drafts AS (
          INSERT INTO driver_payouts
            (id, cycle_id, wallet_id, amount_paise, status, created_at, updated_at)
          SELECT gen_random_uuid()::text, ${cycle.id}, wallet_id,
            sum(available_delta_paise)::bigint, 'DRAFT', now(), now()
          FROM earnings
          GROUP BY wallet_id
          RETURNING id, wallet_id
        )
        INSERT INTO driver_payout_lines
          (id, payout_id, source_entry_id, ride_id, amount_paise, created_at)
        SELECT gen_random_uuid()::text, drafts.id, earnings.id, earnings.ride_id,
          earnings.available_delta_paise, now()
        FROM earnings JOIN drafts USING (wallet_id)
      `;
      await tx.payoutSchedule.update({
        where: { id: schedule.id },
        data: {
          next_run_at: next_payout_run(
            schedule,
            schedule.replaced_run_at && schedule.replaced_run_at > due
              ? schedule.replaced_run_at
              : due,
          ),
          replaced_run_at: null,
          version: { increment: 1 },
        },
      });
      return { prepared: true, cycle_id: cycle.id };
    });
  }

  async cycles(page: number, page_size: number) {
    const cycles = await this.database.client.payoutCycle.findMany({
      orderBy: [{ scheduled_at: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * page_size,
      take: page_size + 1,
      select: {
        id: true,
        period_start: true,
        cutoff_at: true,
        scheduled_at: true,
        status: true,
        version: true,
        _count: { select: { payouts: true } },
      },
    });
    const visible = cycles.slice(0, page_size);
    const totals = await this.earnings_totals(
      visible.map((cycle) => cycle.id),
      true,
    );
    return {
      page,
      has_more: cycles.length > page_size,
      rows: visible.map((cycle) => ({
        ...cycle,
        ride_earnings: totals.get(cycle.id) ?? null,
      })),
    };
  }

  async cycle_drivers(id: string, page: number, page_size: number) {
    const cycle = await this.database.client.payoutCycle.findUnique({
      where: { id },
      select: { id: true, status: true, version: true },
    });
    if (!cycle)
      throw new AppError(
        404,
        'PAYOUT_CYCLE_NOT_FOUND',
        'Payout cycle not found.',
      );
    const rows = await this.database.client.driverPayout.findMany({
      where: { cycle_id: id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * page_size,
      take: page_size + 1,
      select: {
        id: true,
        amount_paise: true,
        updated_at: true,
        status: true,
        exclusion_reason: true,
        wallet: {
          select: {
            user: { select: { id: true, first_name: true, last_name: true } },
          },
        },
        attempts: {
          orderBy: { attempt_number: 'desc' },
          take: 1,
          select: {
            status: true,
            provider_payout_id: true,
            utr: true,
            failure_code: true,
          },
        },
        _count: { select: { lines: true } },
      },
    });
    const visible = rows.slice(0, page_size);
    const breakdown = await this.earnings_totals(
      visible.map((row) => row.id),
      false,
    );
    return {
      cycle,
      page,
      has_more: rows.length > page_size,
      rows: visible.map((row) => ({
        ...row,
        amount_paise: String(row.amount_paise),
        ride_earnings: breakdown.get(row.id) ?? null,
      })),
    };
  }

  private async earnings_totals(ids: string[], by_cycle: boolean) {
    if (!ids.length) return new Map();
    const group = by_cycle
      ? Prisma.sql`payout.cycle_id`
      : Prisma.sql`payout.id`;
    const totals = await this.database.client.$queryRaw<
      {
        id: string;
        gross_paise: string;
        commission_paise: string;
        driver_net_paise: string;
      }[]
    >`
      SELECT ${group} AS id,
        SUM(entry.available_delta_paise + COALESCE(entry.commission_paise, 0))::text AS gross_paise,
        SUM(COALESCE(entry.commission_paise, 0))::text AS commission_paise,
        SUM(entry.available_delta_paise)::text AS driver_net_paise
      FROM driver_payout_lines AS line
      JOIN driver_payouts AS payout ON payout.id = line.payout_id
      JOIN wallet_entries AS entry ON entry.id = line.source_entry_id
      WHERE ${group} IN (${Prisma.join(ids)}) AND entry.kind = 'RIDE_EARNING'
      GROUP BY ${group}
    `;
    return new Map(totals.map(({ id, ...amounts }) => [id, amounts]));
  }

  async payout_lines(id: string, page: number, page_size: number) {
    const payout = await this.database.client.driverPayout.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!payout)
      throw new AppError(
        404,
        'DRIVER_PAYOUT_NOT_FOUND',
        'Driver payout not found.',
      );
    const lines = await this.database.client.driverPayoutLine.findMany({
      where: { payout_id: id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * page_size,
      take: page_size + 1,
      include: {
        source_entry: {
          select: {
            commission_paise: true,
            commission_percent: true,
            available_delta_paise: true,
          },
        },
      },
    });
    const visible = lines.slice(0, page_size);
    const ride_ids = [
      ...new Set(
        visible.flatMap((line) => (line.ride_id ? [line.ride_id] : [])),
      ),
    ];
    const rides = ride_ids.length
      ? await this.database.client.ride.findMany({
          where: { id: { in: ride_ids } },
          select: { id: true, final_fare: true, completed_at: true },
        })
      : [];
    const ride_by_id = new Map(rides.map((ride) => [ride.id, ride]));
    return {
      page,
      has_more: lines.length > page_size,
      rows: visible.map(({ source_entry, ...line }) => ({
        ...line,
        amount_paise: String(line.amount_paise),
        ...commission_breakdown(source_entry),
        ride: line.ride_id ? (ride_by_id.get(line.ride_id) ?? null) : null,
      })),
    };
  }

  async driver_payout(user_id: string, id: string) {
    const row = await this.database.client.driverPayout.findFirst({
      where: { id, wallet: { user_id, kind: 'DRIVER' } },
      select: {
        id: true,
        amount_paise: true,
        status: true,
        method: { select: { masked_label: true } },
        cycle: { select: { scheduled_at: true, cutoff_at: true } },
        attempts: {
          orderBy: { attempt_number: 'desc' },
          take: 1,
          select: { utr: true },
        },
      },
    });
    if (!row) throw new AppError(404, 'PAYOUT_NOT_FOUND', 'Payout not found.');
    const totals = await this.earnings_totals([row.id], false);
    const adjustments = await this.database.client.driverPayoutLine.aggregate({
      where: { payout_id: row.id, source_entry_id: null },
      _sum: { amount_paise: true },
    });
    return {
      id: row.id,
      amount_paise: String(row.amount_paise),
      status: row.status,
      masked_destination: row.method?.masked_label ?? null,
      utr: row.attempts[0]?.utr ?? null,
      ...row.cycle,
      adjustments_paise: String(adjustments._sum.amount_paise ?? 0),
      ride_earnings: totals.get(row.id) ?? null,
    };
  }

  async pay_ride(user_id: string, ride_id: string) {
    return this.database.client.$transaction(async (tx) => {
      await require_active_account(tx, user_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
      // Coordinate with direct receipt, payment checkout, and ride review.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${ride_id}))`;
      const ride = await tx.ride.findFirst({
        where: { id: ride_id, rider_id: user_id },
        select: {
          status: true,
          final_fare: true,
          currency: true,
          driver: { select: { user_id: true } },
          payment: true,
          quotes: {
            where: { selected_at: { not: null } },
            orderBy: { selected_at: 'desc' },
            take: 1,
            select: { category_snapshot: true },
          },
          settlement_review: { select: { status: true } },
        },
      });
      if (!ride) throw new AppError(404, 'RIDE_NOT_FOUND', 'Ride not found.');
      if (
        ride.payment?.status === 'CAPTURED' &&
        ride.payment.collection_method === 'WALLET'
      )
        return ride.payment;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${payout_schedule_lock}::int)`;
      const controls = await read_wallet_controls(tx);
      if (!controls.wallet_ride_collection_enabled)
        throw new AppError(
          503,
          'WALLET_UNAVAILABLE',
          'Wallet ride payments are unavailable.',
        );
      if (
        ride.status !== 'COMPLETED' ||
        ride.currency !== 'INR' ||
        !ride.final_fare?.gt(0) ||
        !ride.driver
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
        ride.settlement_review
      )
        throw new AppError(
          409,
          'PAYMENT_ALREADY_MANAGED',
          'This payment is already settled or under review.',
        );

      const amount = BigInt(ride.final_fare.mul(100).toFixed(0));
      const commission_percent = snapshot_commission(
        ride.quotes[0]?.category_snapshot,
      );
      const commission_paise = BigInt(
        new Prisma.Decimal(amount.toString())
          .mul(commission_percent)
          .div(100)
          .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
          .toFixed(0),
      );
      const net = amount - commission_paise;
      const rider = await tx.wallet.findUnique({
        where: { user_id_kind: { user_id, kind: 'RIDER' } },
        select: { id: true },
      });
      if (rider) {
        await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${rider.id} FOR UPDATE`;
        const review = await tx.walletTopUp.findFirst({
          where: {
            wallet_id: rider.id,
            OR: [
              { status: 'REVIEW_REQUIRED' },
              ...(controls.wallet_topup_mode !== 'live' &&
              gateway_credential_mode() === 'test'
                ? []
                : [
                    {
                      provider_mode: 'test',
                      entries: { some: { kind: 'TOP_UP' as const } },
                    },
                  ]),
            ],
          },
          select: { id: true },
        });
        if (review)
          throw new AppError(
            409,
            'WALLET_REVIEW_REQUIRED',
            'Contact support to resolve a wallet adjustment before paying.',
          );
      }
      if (
        !rider ||
        !(
          await tx.wallet.updateMany({
            where: { id: rider.id, available_paise: { gte: amount } },
            data: { available_paise: { decrement: amount } },
          })
        ).count
      )
        throw new AppError(
          409,
          'WALLET_INSUFFICIENT_BALANCE',
          'Your wallet balance is below the final fare.',
        );

      const driver = await tx.wallet.upsert({
        where: {
          user_id_kind: { user_id: ride.driver.user_id, kind: 'DRIVER' },
        },
        create: {
          user_id: ride.driver.user_id,
          kind: 'DRIVER',
          available_paise: net,
        },
        update: { available_paise: { increment: net } },
      });
      const rider_balance = await tx.wallet.findUniqueOrThrow({
        where: { id: rider.id },
      });
      const payment_data = {
        status: 'CAPTURED',
        collection_method: 'WALLET',
        paid_at: new Date(),
        amount: ride.final_fare,
        currency: ride.currency,
      } as const;
      const payment = await tx.payment.upsert({
        where: { ride_id },
        create: { ride_id, ...payment_data },
        update: {
          ...payment_data,
          payment_method_id: null,
          confirmed_by_id: null,
          recipient_upi: null,
          unpaid_reason: null,
          failed_at: null,
        },
      });
      await tx.walletEntry.createMany({
        data: [
          { wallet: rider_balance, kind: 'RIDE_DEBIT', delta: -amount },
          { wallet: driver, kind: 'RIDE_EARNING', delta: net },
        ].map(({ wallet, kind, delta }) => ({
          wallet_id: wallet.id,
          kind: kind as 'RIDE_DEBIT' | 'RIDE_EARNING',
          available_delta_paise: delta,
          held_delta_paise: 0n,
          available_after_paise: wallet.available_paise,
          held_after_paise: wallet.held_paise,
          operation_key: `ride:${ride_id}:${kind}`,
          ride_id,
          payment_id: payment.id,
          ...(kind === 'RIDE_EARNING'
            ? { commission_paise, commission_percent }
            : {}),
        })),
      });
      await tx.rideEvent.create({
        data: {
          ride_id,
          actor_id: user_id,
          event_type: 'PAYMENT_CAPTURED',
          metadata: { method: 'WALLET' },
        },
      });
      await create_user_log(tx, {
        actor_id: user_id,
        entity_type: 'Payment',
        entity_id: payment.id,
        action: 'PAY_RIDE_WITH_WALLET',
        after_data: {
          ride_id,
          amount_paise: String(amount),
          commission_paise: String(commission_paise),
          commission_percent,
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
    return this.database.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(720041)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720044, hashtext(${ride_id}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720065)`;
      const payment = await tx.payment.findFirst({
        where: {
          ride_id,
          collection_method: 'WALLET',
          ride: { rider_id, status: 'COMPLETED' },
        },
      });
      if (payment?.status === 'REFUNDED') return { id: payment.id };
      if (payment?.status !== 'CAPTURED')
        throw new AppError(
          409,
          'WALLET_RIDE_NOT_REFUNDABLE',
          'Only a captured wallet ride can be refunded.',
        );
      const debit = await tx.walletEntry.findUniqueOrThrow({
        where: { operation_key: `ride:${ride_id}:RIDE_DEBIT` },
      });
      const earning = await tx.walletEntry.findUniqueOrThrow({
        where: { operation_key: `ride:${ride_id}:RIDE_EARNING` },
      });
      const paid = await tx.driverPayoutLine.findFirst({
        where: { source_entry_id: earning.id, payout: { status: 'PAID' } },
        select: { payout_id: true },
      });
      const locked = await tx.driverPayoutLine.findFirst({
        where: {
          source_entry_id: earning.id,
          payout: {
            status: { in: ['DRAFT', 'READY', 'PROCESSING', 'REVIEW_REQUIRED'] },
          },
        },
        select: { id: true },
      });
      if (locked)
        throw new AppError(
          409,
          'WALLET_REFUND_PAYOUT_LOCKED',
          'Exclude this driver from the draft or wait for the payout to settle.',
        );
      if (paid && !platform_funded)
        throw new AppError(
          409,
          'WALLET_REFUND_PAYOUT_SETTLED',
          'Confirm a platform-funded refund for this already paid ride.',
        );
      const credit = -debit.available_delta_paise;
      const rider = await tx.wallet.update({
        where: { id: debit.wallet_id },
        data: { available_paise: { increment: credit } },
      });
      const source = paid ? 0n : earning.available_delta_paise;
      if (!paid) {
        const debited = await tx.wallet.updateMany({
          where: { id: earning.wallet_id, available_paise: { gte: source } },
          data: { available_paise: { decrement: source } },
        });
        if (!debited.count)
          throw new AppError(
            409,
            'WALLET_REFUND_EARNINGS_UNAVAILABLE',
            'Driver earnings are unavailable for reversal.',
          );
      }
      const driver = await tx.wallet.findUniqueOrThrow({
        where: { id: earning.wallet_id },
      });
      await tx.walletEntry.createMany({
        data: [
          { wallet: rider, original: debit, delta: credit },
          ...(!paid
            ? [{ wallet: driver, original: earning, delta: -source }]
            : []),
        ].map(({ wallet, original, delta }) => ({
          wallet_id: wallet.id,
          kind: 'REFUND',
          operation_key: `ride-refund:${original.id}`,
          reverses_entry_id: original.id,
          payment_id: payment.id,
          ride_id,
          available_delta_paise: delta,
          held_delta_paise: 0n,
          available_after_paise: wallet.available_paise,
          held_after_paise: wallet.held_paise,
        })),
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED', refunded_at: new Date() },
      });
      await tx.rideEvent.create({
        data: {
          ride_id,
          actor_id,
          event_type: 'PAYMENT_REFUNDED',
          metadata: { method: 'WALLET' },
        },
      });
      await create_user_log(tx, {
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

  async admin_activity(
    user_id: string,
    kind: WalletKind,
    page: number,
    page_size: number,
    filters: {
      entry_kind?: WalletEntryKind;
      from?: Date;
      end?: Date;
      reference?: string;
    },
  ) {
    return this.database.client.$transaction(
      async (tx) => {
        const wallet = await tx.wallet.findUnique({
          where: { user_id_kind: { user_id, kind } },
          select: { id: true, available_paise: true, held_paise: true },
        });
        const balance = {
          available_paise: String(wallet?.available_paise ?? 0n),
          held_paise: String(wallet?.held_paise ?? 0n),
        };
        if (!wallet) return { ...balance, has_more: false, activity: [] };
        const { entry_kind, from, end, reference } = filters;
        const dates = Prisma.sql`
        ${from ? Prisma.sql`AND record.created_at >= ${from}` : Prisma.empty}
        ${end ? Prisma.sql`AND record.created_at < ${end}` : Prisma.empty}
      `;
        const includeAttempts =
          kind === 'RIDER' && (!entry_kind || entry_kind === 'TOP_UP');
        const results = await tx.$queryRaw<
          { id: string; source: 'entry' | 'attempt' }[]
        >`
        SELECT id, source FROM (
          SELECT record.id, record.created_at, 'entry' AS source
          FROM wallet_entries record
          LEFT JOIN wallet_topups topup ON topup.id = record.topup_id AND topup.wallet_id = record.wallet_id
          WHERE record.wallet_id = ${wallet.id}
            ${dates}
            ${entry_kind ? Prisma.sql`AND record.kind = ${entry_kind}::"WalletEntryKind"` : Prisma.empty}
            ${
              reference
                ? Prisma.sql`AND ${reference} IN (
              record.id, record.ride_id, record.payment_id, record.topup_id,
              record.payout_id, record.reverses_entry_id,
              topup.provider_link_id, topup.provider_order_id, topup.provider_payment_id
            )`
                : Prisma.empty
            }
          ${
            includeAttempts
              ? Prisma.sql`
            UNION ALL
            SELECT record.id, record.created_at, 'attempt' AS source
            FROM wallet_topups record
            WHERE record.wallet_id = ${wallet.id}
              ${dates}
              ${
                reference
                  ? Prisma.sql`AND ${reference} IN (
                record.id, record.provider_link_id, record.provider_order_id, record.provider_payment_id
              )`
                  : Prisma.empty
              }
              AND NOT EXISTS (
                SELECT 1 FROM wallet_entries credit
                WHERE credit.wallet_id = record.wallet_id AND credit.topup_id = record.id AND credit.kind = 'TOP_UP'
              )
          `
              : Prisma.empty
          }
        ) activity
        ORDER BY created_at DESC, id DESC, source DESC
        LIMIT ${page_size + 1} OFFSET ${(page - 1) * page_size}
      `;
        const visible = results.slice(0, page_size);
        const entries = visible
          .filter(({ source }) => source === 'entry')
          .map(({ id }) => id);
        const attempts = visible
          .filter(({ source }) => source === 'attempt')
          .map(({ id }) => id);
        const [ledger_rows, topups] = await Promise.all([
          entries.length
            ? tx.walletEntry.findMany({
                where: { id: { in: entries }, wallet_id: wallet.id },
                include: {
                  topup: { select: topup_activity_select },
                  reversals: {
                    where: { kind: 'REFUND' },
                    select: { id: true },
                    take: 1,
                  },
                },
              })
            : [],
          attempts.length
            ? tx.walletTopUp.findMany({
                where: { id: { in: attempts }, wallet_id: wallet.id },
                select: topup_activity_select,
              })
            : [],
        ]);
        const by_entry = new Map(ledger_rows.map((row) => [row.id, row]));
        const by_topup = new Map(topups.map((row) => [row.id, row]));
        return {
          ...balance,
          has_more: results.length > page_size,
          activity: visible.map(({ id, source }) => {
            if (source === 'attempt') {
              const topup = by_topup.get(id)!;
              return {
                source,
                id,
                created_at: topup.created_at,
                topup: present_activity_topup(topup),
              };
            }
            const entry = by_entry.get(id)!;
            const topup =
              entry.topup?.wallet_id === wallet.id ? entry.topup : null;
            return {
              source,
              id,
              created_at: entry.created_at,
              entry: present_wallet_entry(entry),
              ...(entry.kind === 'TOP_UP' && topup
                ? { topup: present_activity_topup(topup) }
                : {}),
            };
          }),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async view(
    user_id: string,
    kind: WalletKind,
    page: number,
    page_size: number,
    filters?: Prisma.WalletEntryWhereInput,
  ) {
    return this.database.client.$transaction(
      async (tx) => {
        const wallet = await tx.wallet.findUnique({
          where: { user_id_kind: { user_id, kind } },
          select: {
            id: true,
            currency: true,
            available_paise: true,
            held_paise: true,
          },
        });
        const rows = wallet
          ? await tx.walletEntry.findMany({
              where: { ...filters, wallet_id: wallet.id },
              include: {
                reversals: {
                  where: { kind: 'REFUND' },
                  select: { id: true },
                  take: 1,
                },
              },
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              skip: (page - 1) * page_size,
              take: page_size + 1,
            })
          : [];
        const earnings =
          wallet && kind === 'DRIVER'
            ? await tx.walletEntry.aggregate({
                where: {
                  wallet_id: wallet.id,
                  kind: 'RIDE_EARNING',
                  reversals: { none: { kind: 'REFUND' } },
                },
                _sum: { available_delta_paise: true },
              })
            : null;
        return {
          ...(wallet ? { id: wallet.id } : {}),
          kind,
          currency: wallet?.currency ?? 'INR',
          available_paise: String(wallet?.available_paise ?? 0),
          held_paise: String(wallet?.held_paise ?? 0),
          ...(kind === 'DRIVER'
            ? {
                earnings_paise: String(
                  earnings?._sum.available_delta_paise ?? 0,
                ),
              }
            : {}),
          page,
          has_more: rows.length > page_size,
          rows: rows.slice(0, page_size).map(present_wallet_entry),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}

function present_wallet_entry(
  entry: WalletEntry & { reversals: { id: string }[] },
) {
  return {
    id: entry.id,
    kind: entry.kind,
    available_delta_paise: String(entry.available_delta_paise),
    held_delta_paise: String(entry.held_delta_paise),
    available_after_paise: String(entry.available_after_paise),
    held_after_paise: String(entry.held_after_paise),
    ...(entry.ride_id ? { ride_id: entry.ride_id } : {}),
    ...(entry.payment_id ? { payment_id: entry.payment_id } : {}),
    ...(entry.topup_id ? { topup_id: entry.topup_id } : {}),
    ...(entry.payout_id ? { payout_id: entry.payout_id } : {}),
    ...(entry.reverses_entry_id
      ? { reverses_entry_id: entry.reverses_entry_id }
      : {}),
    reversed: entry.reversals.length > 0,
    ...(entry.commission_paise != null ? commission_breakdown(entry) : {}),
    created_at: entry.created_at,
  };
}

function snapshot_commission(snapshot: Prisma.JsonValue | undefined) {
  const policy =
    snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? snapshot.payment_policy
      : null;
  const percent =
    policy && typeof policy === 'object' && !Array.isArray(policy)
      ? policy.commission_percent
      : null;
  if (percent == null) return 0;
  if (
    typeof percent !== 'number' ||
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > 100
  )
    throw new AppError(
      409,
      'RIDE_COMMISSION_INVALID',
      'The ride commission must be reviewed before collection.',
    );
  return percent;
}

function commission_breakdown(
  entry: {
    commission_paise: bigint | null;
    commission_percent: Prisma.Decimal | null;
    available_delta_paise: bigint;
  } | null,
) {
  if (entry?.commission_paise == null)
    return {
      gross_paise: null,
      commission_paise: null,
      commission_percent: null,
      driver_net_paise: null,
    };
  return {
    gross_paise: String(entry.available_delta_paise + entry.commission_paise),
    commission_paise: String(entry.commission_paise),
    commission_percent: entry.commission_percent?.toString() ?? null,
    driver_net_paise: String(entry.available_delta_paise),
  };
}

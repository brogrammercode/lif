import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { require_active_admin } from '../../infra/database/account_lifecycle.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { TransactionClient } from '../../infra/database/client.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { PayoutMethods } from './payout-methods.js';
import {
  payout_schedule_lock,
  payout_schedule_id,
  payout_submission_state,
  razorpay_x_credentials_ready,
} from './wallet-controls.js';

const payout_entity = z.object({
  id: z.string().regex(/^pout_[a-zA-Z0-9]+$/),
  fund_account_id: z.string(),
  reference_id: z.string(),
  mode: z.enum(['UPI', 'IMPS']),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal('INR'),
  status: z.enum([
    'pending',
    'queued',
    'processing',
    'processed',
    'reversed',
    'failed',
    'rejected',
    'cancelled',
  ]),
  utr: z.string().nullish(),
});
type ProviderPayout = z.infer<typeof payout_entity>;
const auth_limit_ms = 60 * 60_000;
const retry_ms = 5 * 60_000;
const active_states = ['READY', 'PROCESSING'] as const;
const is_active = (status: string) =>
  active_states.some((value) => value === status);

@Injectable()
export class PayoutTransfer {
  constructor(
    private readonly db: PrismaService,
    private readonly methods: PayoutMethods = new PayoutMethods(db),
  ) {}

  get credentials_ready() {
    return razorpay_x_credentials_ready();
  }

  async approve(actor_id: string, id: string, version: number) {
    return this.db.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720065)`;
      const result = await tx.payoutCycle.updateMany({
        where: { id, version, status: 'DRAFT' },
        data: {
          status: 'READY',
          approved_at: new Date(),
          approved_by_id: actor_id,
          version: { increment: 1 },
        },
      });
      if (!result.count)
        throw new AppError(
          409,
          'PAYOUT_CYCLE_CHANGED',
          'The draft changed. Reload the cycle before approving.',
        );
      await create_user_log(tx, {
        actor_id,
        entity_type: 'PayoutCycle',
        entity_id: id,
        action: 'APPROVE_PAYOUT_CYCLE',
      });
      return { id, approved: true };
    });
  }

  async tick(max_batches = 1, deadline = Infinity) {
    if (!this.credentials_ready) return;
    for (let batch = 0; batch < max_batches && Date.now() < deadline; batch++) {
      if (!(await this.process_batch(deadline))) break;
    }
  }

  private async process_batch(deadline: number) {
    const { accepting_submissions, worked, link_methods } =
      await this.reserve();
    if (link_methods && deadline - Date.now() > 16_000) {
      await Promise.allSettled(
        link_methods.map((method) => this.methods.provision(method)),
      );
    }
    const now = new Date();
    const attempts = await this.db.client.driverPayoutAttempt.findMany({
      where: {
        status: { in: [...active_states] },
        OR: [{ next_retry_at: null }, { next_retry_at: { lte: now } }],
        AND: accepting_submissions
          ? undefined
          : [
              {
                OR: [
                  { provider_payout_id: { not: null } },
                  {
                    first_submitted_at: {
                      lte: new Date(now.getTime() - auth_limit_ms),
                    },
                  },
                ],
              },
            ],
      },
      orderBy: [
        { next_retry_at: { sort: 'asc', nulls: 'last' } },
        { id: 'asc' },
      ],
      take: 3,
    });
    await Promise.allSettled(
      attempts.map((attempt) => this.submit(attempt.id)),
    );
    return worked || attempts.length > 0;
  }

  private async reserve() {
    return this.db.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${payout_schedule_lock}::int)`;
      const schedule = await tx.payoutSchedule.findUnique({
        where: { id: payout_schedule_id },
      });
      if ((await payout_submission_state(tx, schedule, true)) !== 'ready')
        return { accepting_submissions: false, worked: false };
      const automatic = await tx.payoutCycle.findFirst({
        where: {
          status: 'DRAFT',
          schedule_snapshot: { path: ['require_approval'], equals: false },
        },
        orderBy: { scheduled_at: 'asc' },
      });
      if (automatic)
        await tx.payoutCycle.update({
          where: { id: automatic.id },
          data: { status: 'READY', version: { increment: 1 } },
        });
      const empty = await tx.payoutCycle.findMany({
        where: {
          status: 'READY',
          payouts: { every: { status: 'EXCLUDED' } },
        },
        take: 3,
        select: { id: true },
      });
      for (const cycle of empty) await this.update_cycle(tx, cycle.id);
      const rows = await tx.driverPayout.findMany({
        where: {
          status: 'DRAFT',
          cycle: { status: { in: ['READY', 'PROCESSING'] } },
        },
        include: {
          cycle: { select: { schedule_snapshot: true } },
          wallet: {
            select: {
              user_id: true,
              user: {
                select: { status: true, deleted_at: true, payout_block: true },
              },
            },
          },
        },
        orderBy: [{ updated_at: 'asc' }, { id: 'asc' }],
        take: 3,
      });
      const link_methods = [];
      for (const row of rows) {
        const minimum = z
          .object({ minimum_paise: z.string().regex(/^\d+$/) })
          .safeParse(row.cycle.schedule_snapshot);
        const min = minimum.success ? BigInt(minimum.data.minimum_paise) : 100n;
        const driver = row.wallet.user;
        const block = driver.payout_block;
        const method = await tx.driverPayoutMethod.findFirst({
          where: {
            driver_id: row.wallet.user_id,
            is_default: true,
            OR: [
              { status: 'VERIFIED', provider_fund_account_id: { not: null } },
              { status: 'PENDING', pending_details: { not: null } },
            ],
          },
        });
        const totals = await tx.driverPayoutLine.aggregate({
          where: {
            payout_id: row.id,
            source_entry_id: { not: null },
            source_entry: { kind: { not: 'CASH_PAYMENT' } },
          },
          _sum: { amount_paise: true },
        });
        const earnings = totals._sum.amount_paise ?? 0n;
        const amount = row.amount_paise;
        const reason =
          driver.status !== 'ACTIVE' || driver.deleted_at
            ? 'Driver account is inactive'
            : block && (!block.expires_at || block.expires_at > new Date())
              ? 'Driver payout is blocked'
              : !method
                ? 'Payout account required'
                : amount < min || amount < 100n
                  ? 'Below minimum payout'
                  : amount > BigInt(Number.MAX_SAFE_INTEGER)
                    ? 'Payout exceeds supported amount'
                    : null;
        if (!reason && method?.pending_details) {
          if (
            !method.link_attempted_at ||
            Date.now() - method.link_attempted_at.getTime() > retry_ms
          )
            link_methods.push(method);
          await tx.driverPayout.update({
            where: { id: row.id },
            data: { updated_at: new Date() },
          });
          continue;
        }
        if (reason || !method?.provider_fund_account_id) {
          await tx.driverPayout.update({
            where: { id: row.id },
            data: { status: 'EXCLUDED', exclusion_reason: reason },
          });
          await this.update_cycle(tx, row.cycle_id);
          continue;
        }
        // The balance movement consumes only previously credited earnings.
        // Audited draft adjustments change the transfer amount, with separate ledger entries.
        const moved = await tx.wallet.updateMany({
          where: { id: row.wallet_id, available_paise: { gte: earnings } },
          data: {
            available_paise: { decrement: earnings },
            held_paise: { increment: amount },
          },
        });
        if (!moved.count) {
          await tx.driverPayout.update({
            where: { id: row.id },
            data: {
              status: 'REVIEW_REQUIRED',
              exclusion_reason: 'Insufficient available earnings',
            },
          });
          await this.update_cycle(tx, row.cycle_id);
          continue;
        }
        const wallet = await tx.wallet.findUniqueOrThrow({
          where: { id: row.wallet_id },
        });
        const adjustment = amount - earnings;
        if (adjustment !== 0n)
          await tx.walletEntry.create({
            data: {
              wallet_id: wallet.id,
              payout_id: row.id,
              kind: 'ADJUSTMENT',
              operation_key: `payout-adjust:${row.id}`,
              available_delta_paise: adjustment,
              held_delta_paise: 0,
              available_after_paise: wallet.available_paise + amount,
              held_after_paise: wallet.held_paise - amount,
            },
          });
        await tx.walletEntry.create({
          data: {
            wallet_id: wallet.id,
            payout_id: row.id,
            kind: 'PAYOUT_HOLD',
            operation_key: `payout-hold:${row.id}`,
            available_delta_paise: -amount,
            held_delta_paise: amount,
            available_after_paise: wallet.available_paise,
            held_after_paise: wallet.held_paise,
          },
        });
        await tx.driverPayout.update({
          where: { id: row.id },
          data: {
            status: 'READY',
            method_id: method.id,
            destination_snapshot: {
              fund_account_id: method.provider_fund_account_id,
              mode: method.kind === 'UPI' ? 'UPI' : 'IMPS',
              masked_label: method.masked_label,
              source_account: config.RAZORPAY_X_SOURCE_ACCOUNT,
              earnings_paise: String(earnings),
            },
          },
        });
        await tx.driverPayoutAttempt.create({
          data: {
            payout_id: row.id,
            attempt_number: 1,
            idempotency_key: randomUUID(),
            next_retry_at: new Date(),
          },
        });
        await this.update_cycle(tx, row.cycle_id);
      }
      return {
        accepting_submissions: true,
        worked: automatic !== null || empty.length > 0 || rows.length > 0,
        link_methods,
      };
    });
  }

  async reconcile(actor_id: string, payout_id: string, provider_id: string) {
    if (!this.credentials_ready)
      throw new AppError(
        503,
        'PAYOUT_UNAVAILABLE',
        'RazorpayX is unavailable.',
      );
    const attempt = await this.db.client.driverPayoutAttempt.findFirst({
      where: {
        payout_id,
        status: 'REVIEW_REQUIRED',
        failure_code: 'SUBMISSION_UNCONFIRMED',
      },
      orderBy: { attempt_number: 'desc' },
    });
    if (!attempt)
      throw new AppError(
        409,
        'PAYOUT_NOT_RECONCILABLE',
        'This payout has no unconfirmed submission.',
      );
    const result = await this.request(provider_id, attempt.idempotency_key);
    await this.record(attempt.id, result, actor_id, provider_id);
    return { id: payout_id };
  }

  private async submit(id: string) {
    const attempt = await this.db.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${payout_schedule_lock}::int)`;
      const row = await tx.driverPayoutAttempt.findUnique({
        where: { id },
        include: { payout: true },
      });
      if (
        !row ||
        !is_active(row.status) ||
        (row.next_retry_at && row.next_retry_at > new Date())
      )
        return null;
      if (
        !row.provider_payout_id &&
        row.first_submitted_at &&
        Date.now() - row.first_submitted_at.getTime() >= auth_limit_ms
      ) {
        await tx.driverPayoutAttempt.update({
          where: { id },
          data: {
            status: 'REVIEW_REQUIRED',
            failure_code: 'SUBMISSION_UNCONFIRMED',
          },
        });
        await tx.driverPayout.update({
          where: { id: row.payout_id },
          data: { status: 'REVIEW_REQUIRED' },
        });
        await this.update_cycle(tx, row.payout.cycle_id);
        return null;
      }
      if (!row.provider_payout_id) {
        const schedule = await tx.payoutSchedule.findUnique({
          where: { id: payout_schedule_id },
        });
        if ((await payout_submission_state(tx, schedule, true)) !== 'ready')
          return null;
        const wallet = await tx.wallet.findUniqueOrThrow({
          where: { id: row.payout.wallet_id },
          select: {
            user: {
              select: { status: true, deleted_at: true, payout_block: true },
            },
          },
        });
        const { status, deleted_at, payout_block } = wallet.user;
        if (
          status !== 'ACTIVE' ||
          deleted_at ||
          (payout_block &&
            (!payout_block.expires_at || payout_block.expires_at > new Date()))
        ) {
          await tx.driverPayoutAttempt.update({
            where: { id },
            data: { next_retry_at: new Date(Date.now() + retry_ms) },
          });
          return null;
        }
      }
      await tx.driverPayoutAttempt.update({
        where: { id },
        data: {
          next_retry_at: new Date(Date.now() + retry_ms),
          status: 'PROCESSING',
          first_submitted_at: row.first_submitted_at ?? new Date(),
        },
      });
      return row;
    });
    if (!attempt) return;
    const destination = destination_schema.parse(
      attempt.payout.destination_snapshot,
    );
    const amount = Number(attempt.payout.amount_paise);
    const result = await this.request(
      attempt.provider_payout_id,
      attempt.idempotency_key,
      {
        account_number: destination.source_account,
        fund_account_id: destination.fund_account_id,
        amount,
        currency: 'INR',
        reference_id: attempt.payout_id,
        mode: destination.mode,
        purpose: 'payout',
        queue_if_low_balance: true,
      },
    );
    await this.record(id, result);
  }

  private async record(
    id: string,
    result: ProviderPayout,
    actor_id?: string,
    provider_id?: string,
  ) {
    await this.db.client.$transaction(async (tx) => {
      if (actor_id) await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720065)`;
      const attempt = await tx.driverPayoutAttempt.findUniqueOrThrow({
        where: { id },
        include: { payout: true },
      });
      const payout = attempt.payout;
      if (actor_id) {
        if (
          attempt.status !== 'REVIEW_REQUIRED' ||
          attempt.failure_code !== 'SUBMISSION_UNCONFIRMED'
        )
          throw new AppError(
            409,
            'PAYOUT_CHANGED',
            'The payout changed. Reload before reconciling.',
          );
      } else if (
        !is_active(attempt.status) &&
        attempt.failure_code !== 'SUBMISSION_UNCONFIRMED'
      )
        return;
      const destination = destination_schema.parse(payout.destination_snapshot);
      const expected_id = provider_id ?? attempt.provider_payout_id;
      if (
        result.amount !== Number(payout.amount_paise) ||
        result.fund_account_id !== destination.fund_account_id ||
        result.mode !== destination.mode ||
        result.reference_id !== payout.id ||
        (expected_id && result.id !== expected_id)
      )
        throw new AppError(
          409,
          'PAYOUT_PROVIDER_MISMATCH',
          'The RazorpayX reference does not match this payout.',
        );
      const status =
        result.status === 'processed'
          ? 'PAID'
          : result.status === 'reversed'
            ? 'REVERSED'
            : ['failed', 'rejected', 'cancelled'].includes(result.status)
              ? 'FAILED'
              : 'PROCESSING';
      if (status !== 'PROCESSING') {
        const amount = payout.amount_paise;
        const earnings = BigInt(
          destination_schema.parse(payout.destination_snapshot).earnings_paise,
        );
        const success = status === 'PAID';
        const moved = await tx.wallet.updateMany({
          where: { id: payout.wallet_id, held_paise: { gte: amount } },
          data: {
            held_paise: { decrement: amount },
            available_paise: { increment: success ? 0n : earnings },
          },
        });
        if (!moved.count)
          throw new AppError(
            409,
            'PAYOUT_HOLD_MISSING',
            'Payout balance requires reconciliation.',
          );
        const wallet = await tx.wallet.findUniqueOrThrow({
          where: { id: payout.wallet_id },
        });
        const adjustment = amount - earnings;
        await tx.walletEntry.create({
          data: {
            wallet_id: wallet.id,
            payout_id: payout.id,
            kind: success ? 'PAYOUT_SETTLED' : 'PAYOUT_RELEASE',
            operation_key: `payout-result:${payout.id}`,
            held_delta_paise: -amount,
            available_delta_paise: success ? 0n : amount,
            available_after_paise:
              wallet.available_paise + (success ? 0n : adjustment),
            held_after_paise: wallet.held_paise,
          },
        });
        if (!success && adjustment !== 0n)
          await tx.walletEntry.create({
            data: {
              wallet_id: wallet.id,
              payout_id: payout.id,
              kind: 'ADJUSTMENT',
              operation_key: `payout-adjust-reversal:${payout.id}`,
              held_delta_paise: 0,
              available_delta_paise: -adjustment,
              available_after_paise: wallet.available_paise,
              held_after_paise: wallet.held_paise,
            },
          });
      }
      await tx.driverPayoutAttempt.update({
        where: { id },
        data: {
          status,
          provider_payout_id: result.id,
          utr: result.utr,
          failure_code:
            status === 'FAILED' || status === 'REVERSED' ? result.status : null,
          next_retry_at:
            status === 'PROCESSING' ? new Date(Date.now() + retry_ms) : null,
        },
      });
      await tx.driverPayout.update({
        where: { id: payout.id },
        data: { status },
      });
      await this.update_cycle(tx, payout.cycle_id);
      if (actor_id)
        await create_user_log(tx, {
          actor_id,
          entity_type: 'DriverPayout',
          entity_id: payout.id,
          action: 'RECONCILE_DRIVER_PAYOUT',
          after_data: { status, provider_payout_id: result.id },
        });
    });
  }

  private async update_cycle(tx: TransactionClient, id: string) {
    const groups = await tx.driverPayout.groupBy({
      by: ['status'],
      where: { cycle_id: id },
      _count: { _all: true },
    });
    const statuses = groups
      .map((group) => group.status)
      .filter((status) => status !== 'EXCLUDED');
    const status = statuses.some((s) => s === 'DRAFT' || is_active(s))
      ? 'PROCESSING'
      : statuses.includes('REVIEW_REQUIRED')
        ? 'REVIEW_REQUIRED'
        : statuses.length === 0
          ? 'EXCLUDED'
          : statuses.every((s) => s === 'PAID')
            ? 'PAID'
            : statuses.includes('PAID')
              ? 'PARTIALLY_PAID'
              : 'FAILED';
    await tx.payoutCycle.update({
      where: { id },
      data: { status, version: { increment: 1 } },
    });
  }

  private async request(id: string | null, key: string, body?: object) {
    try {
      const response = await fetch(
        `https://api.razorpay.com/v1/payouts${id ? '/' + encodeURIComponent(id) : ''}`,
        {
          method: id ? 'GET' : 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
          headers: {
            'Content-Type': 'application/json',
            'X-Payout-Idempotency': key,
            Authorization: `Basic ${Buffer.from(`${config.RAZORPAY_X_KEY_ID}:${config.RAZORPAY_X_KEY_SECRET}`).toString('base64')}`,
          },
          body: id ? undefined : JSON.stringify(body),
        },
      );
      if (response.ok) return payout_entity.parse(await response.json());
    } catch {
      /* A lost response cannot prove the transfer failed. */
    }
    throw new AppError(
      503,
      'PAYOUT_STATUS_UNAVAILABLE',
      'RazorpayX payout status is temporarily unavailable.',
    );
  }
}

const destination_schema = z.object({
  fund_account_id: z.string().regex(/^fa_[A-Za-z0-9]+$/),
  mode: z.enum(['UPI', 'IMPS']).default('UPI'),
  source_account: z.string().min(1),
  earnings_paise: z.string().regex(/^\d+$/),
});

import {
  approvePayoutCycle,
  listDuePayoutAttempts,
  approveAutomaticCycle,
  listEmptyApprovedCycles,
  selectDraftTransfers,
  selectDefaultPayoutMethod,
  deferDraftTransfer,
  sumCreditedEarnings,
  holdPayoutBalance,
  setReadyPayout,
  insertPayoutAttempt,
  selectUnconfirmedAttempt,
  markSubmissionUnconfirmed,
  checkPayoutDriver,
  deferPayoutAttempt,
  claimPayoutSubmission,
  finishWalletHold,
  recordProviderPayout,
  readPayoutAttempt,
  changePayoutStatus,
  insertPayoutLedgerEntry,
  listTransferStatuses,
  updateCycleStatus,
} from './sql/payout-transfers.sql.js';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import { requireActiveAdmin } from '../../database/account-locks.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import type { DriverPayoutMethod } from './wallet.rows.js';
import { readPayoutSchedule } from './sql/payout-cycles.sql.js';
import { PayoutMethods } from './payout-methods.js';
import {
  payout_schedule_lock,
  payout_schedule_id,
  payoutSubmissionState,
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

type Balance = { available_paise: string; held_paise: string };
const lock = (tx: SqlClient) =>
  tx.query('SELECT pg_advisory_xact_lock($1::int)', [payout_schedule_lock]);

@Injectable()
export class PayoutTransfer {
  constructor(
    private readonly db: PostgresService,
    private readonly methods: PayoutMethods,
  ) {}

  get credentials_ready() {
    return razorpay_x_credentials_ready();
  }

  async approve(actor_id: string, id: string, version: number) {
    return this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor_id);
      await lock(tx);
      const updated = await tx.query(approvePayoutCycle, [
        id,
        version,
        actor_id,
      ]);
      if (!updated.rowCount)
        throw new AppError(
          409,
          'PAYOUT_CYCLE_CHANGED',
          'The draft changed. Reload the cycle before approving.',
        );
      await insertUserLog(tx, {
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
      const { accepting, worked, methods } = await this.reserve();
      if (deadline - Date.now() > 16000)
        await Promise.allSettled(
          methods.map((method) => this.methods.provision(method)),
        );
      const now = new Date();
      const { rows } = await this.db.query<{ id: string }>(
        listDuePayoutAttempts,
        [now, accepting, new Date(now.getTime() - auth_limit_ms)],
      );
      await Promise.allSettled(rows.map((row) => this.submit(row.id)));
      if (!worked && !rows.length) break;
    }
  }

  private async reserve() {
    return this.db.transaction(async (tx) => {
      await lock(tx);
      const methods: DriverPayoutMethod[] = [];
      const schedule = await readPayoutSchedule(tx, payout_schedule_id);
      if ((await payoutSubmissionState(tx, schedule, true)) !== 'ready')
        return { accepting: false, worked: false, methods };
      const automatic = await tx.query(approveAutomaticCycle);
      const { rows: empty } = await tx.query<{ id: string }>(
        listEmptyApprovedCycles,
      );
      for (const cycle of empty) await this.update_cycle(tx, cycle.id);
      const { rows } = await tx.query<{
        id: string;
        cycle_id: string;
        wallet_id: string;
        amount_paise: string;
        schedule_snapshot: unknown;
        user_id: string;
        inactive: boolean;
        blocked: boolean;
      }>(selectDraftTransfers);
      for (const row of rows) {
        const minimum = z
          .object({ minimum_paise: z.string().regex(/^\d+$/) })
          .safeParse(row.schedule_snapshot);
        const min = minimum.success ? BigInt(minimum.data.minimum_paise) : 100n;
        const {
          rows: [method],
        } = await tx.query<DriverPayoutMethod>(selectDefaultPayoutMethod, [
          row.user_id,
        ]);
        const amount = BigInt(row.amount_paise);
        const reason = row.inactive
          ? 'Driver account is inactive'
          : row.blocked
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
            methods.push(method);
          await tx.query(deferDraftTransfer, [row.id]);
          continue;
        }
        if (reason || !method?.provider_fund_account_id) {
          await this.set_status(tx, row.id, 'EXCLUDED', reason);
        } else {
          const {
            rows: [total],
          } = await tx.query<{ earnings: string }>(sumCreditedEarnings, [
            row.id,
          ]);
          const earnings = BigInt(total!.earnings);
          const {
            rows: [wallet],
          } = await tx.query<Balance>(holdPayoutBalance, [
            row.wallet_id,
            earnings,
            amount,
          ]);
          if (!wallet)
            await this.set_status(
              tx,
              row.id,
              'REVIEW_REQUIRED',
              'Insufficient available earnings',
            );
          else {
            const available = BigInt(wallet.available_paise);
            const held = BigInt(wallet.held_paise);
            const adjustment = amount - earnings;
            if (adjustment !== 0n)
              await this.entry(
                tx,
                row.wallet_id,
                row.id,
                'ADJUSTMENT',
                'payout-adjust',
                adjustment,
                0n,
                available + amount,
                held - amount,
              );
            await this.entry(
              tx,
              row.wallet_id,
              row.id,
              'PAYOUT_HOLD',
              'payout-hold',
              -amount,
              amount,
              available,
              held,
            );
            await tx.query(setReadyPayout, [
              row.id,
              method.id,
              JSON.stringify({
                fund_account_id: method.provider_fund_account_id,
                mode: method.kind === 'UPI' ? 'UPI' : 'IMPS',
                masked_label: method.masked_label,
                source_account: config.RAZORPAY_X_SOURCE_ACCOUNT,
                earnings_paise: String(earnings),
              }),
            ]);
            await tx.query(insertPayoutAttempt, [
              randomUUID(),
              row.id,
              randomUUID(),
            ]);
          }
        }
        await this.update_cycle(tx, row.cycle_id);
      }
      return {
        accepting: true,
        worked: Boolean(automatic.rowCount || empty.length || rows.length),
        methods,
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
    const {
      rows: [attempt],
    } = await this.db.query<{ id: string; idempotency_key: string }>(
      selectUnconfirmedAttempt,
      [payout_id],
    );
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
    const attempt = await this.db.transaction(async (tx) => {
      await lock(tx);
      const row = await this.load_attempt(tx, id);
      const now = new Date();
      if (
        !row ||
        !is_active(row.status) ||
        (row.next_retry_at && row.next_retry_at > now)
      )
        return null;
      if (
        !row.provider_payout_id &&
        row.first_submitted_at &&
        now.getTime() - row.first_submitted_at.getTime() >= auth_limit_ms
      ) {
        await tx.query(markSubmissionUnconfirmed, [id]);
        await this.set_status(tx, row.payout_id, 'REVIEW_REQUIRED');
        await this.update_cycle(tx, row.cycle_id);
        return null;
      }
      const retry_at = new Date(now.getTime() + retry_ms);
      if (!row.provider_payout_id) {
        if (
          (await payoutSubmissionState(
            tx,
            await readPayoutSchedule(tx, payout_schedule_id),
            true,
          )) !== 'ready'
        )
          return null;
        const {
          rows: [driver],
        } = await tx.query<{ eligible: boolean }>(checkPayoutDriver, [
          row.wallet_id,
        ]);
        if (!driver?.eligible) {
          await tx.query(deferPayoutAttempt, [id, retry_at]);
          return null;
        }
      }
      await tx.query(claimPayoutSubmission, [id, retry_at]);
      return row;
    });
    if (!attempt) return;
    const destination = destination_schema.parse(attempt.destination_snapshot);
    const result = await this.request(
      attempt.provider_payout_id,
      attempt.idempotency_key,
      {
        account_number: destination.source_account,
        fund_account_id: destination.fund_account_id,
        amount: Number(attempt.amount_paise),
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
    await this.db.transaction(async (tx) => {
      if (actor_id) await requireActiveAdmin(tx, actor_id);
      await lock(tx);
      const attempt = await this.load_attempt(tx, id);
      if (
        !attempt ||
        (actor_id &&
          (attempt.status !== 'REVIEW_REQUIRED' ||
            attempt.failure_code !== 'SUBMISSION_UNCONFIRMED'))
      )
        throw new AppError(
          409,
          'PAYOUT_CHANGED',
          'The payout changed. Reload before reconciling.',
        );
      if (
        !actor_id &&
        !is_active(attempt.status) &&
        attempt.failure_code !== 'SUBMISSION_UNCONFIRMED'
      )
        return;
      const destination = destination_schema.parse(
        attempt.destination_snapshot,
      );
      const expected_id = provider_id ?? attempt.provider_payout_id;
      if (
        result.amount !== Number(attempt.amount_paise) ||
        result.fund_account_id !== destination.fund_account_id ||
        result.mode !== destination.mode ||
        result.reference_id !== attempt.payout_id ||
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
        const amount = BigInt(attempt.amount_paise);
        const earnings = BigInt(destination.earnings_paise);
        const success = status === 'PAID';
        const {
          rows: [wallet],
        } = await tx.query<Balance>(finishWalletHold, [
          attempt.wallet_id,
          amount,
          success ? 0n : earnings,
        ]);
        if (!wallet)
          throw new AppError(
            409,
            'PAYOUT_HOLD_MISSING',
            'Payout balance requires reconciliation.',
          );
        const available = BigInt(wallet.available_paise);
        const held = BigInt(wallet.held_paise);
        const adjustment = amount - earnings;
        await this.entry(
          tx,
          attempt.wallet_id,
          attempt.payout_id,
          success ? 'PAYOUT_SETTLED' : 'PAYOUT_RELEASE',
          'payout-result',
          success ? 0n : amount,
          -amount,
          available + (success ? 0n : adjustment),
          held,
        );
        if (!success && adjustment !== 0n)
          await this.entry(
            tx,
            attempt.wallet_id,
            attempt.payout_id,
            'ADJUSTMENT',
            'payout-adjust-reversal',
            -adjustment,
            0n,
            available,
            held,
          );
      }
      await tx.query(recordProviderPayout, [
        id,
        status,
        result.id,
        result.utr !== undefined,
        result.utr,
        status === 'FAILED' || status === 'REVERSED' ? result.status : null,
        status === 'PROCESSING' ? new Date(Date.now() + retry_ms) : null,
      ]);
      await this.set_status(tx, attempt.payout_id, status);
      await this.update_cycle(tx, attempt.cycle_id);
      if (actor_id)
        await insertUserLog(tx, {
          actor_id,
          entity_type: 'DriverPayout',
          entity_id: attempt.payout_id,
          action: 'RECONCILE_DRIVER_PAYOUT',
          after_data: { status, provider_payout_id: result.id },
        });
    });
  }

  private async load_attempt(tx: SqlClient, id: string) {
    const {
      rows: [row],
    } = await tx.query<{
      id: string;
      payout_id: string;
      status: string;
      provider_payout_id: string | null;
      next_retry_at: Date | null;
      first_submitted_at: Date | null;
      failure_code: string | null;
      idempotency_key: string;
      cycle_id: string;
      wallet_id: string;
      amount_paise: string;
      destination_snapshot: unknown;
    }>(readPayoutAttempt, [id]);
    return row ?? null;
  }

  private async set_status(
    tx: SqlClient,
    id: string,
    status: string,
    reason?: string | null,
  ) {
    await tx.query(changePayoutStatus, [
      id,
      status,
      reason !== undefined,
      reason,
    ]);
  }

  private async entry(
    tx: SqlClient,
    wallet_id: string,
    payout_id: string,
    kind: string,
    key: string,
    available_delta: bigint,
    held_delta: bigint,
    available_after: bigint,
    held_after: bigint,
  ) {
    await tx.query(insertPayoutLedgerEntry, [
      randomUUID(),
      wallet_id,
      payout_id,
      kind,
      key + ':' + payout_id,
      available_delta,
      held_delta,
      available_after,
      held_after,
    ]);
  }

  private async update_cycle(tx: SqlClient, id: string) {
    const { rows } = await tx.query<{ status: string }>(listTransferStatuses, [
      id,
    ]);
    const statuses = rows.map((row) => row.status);
    const status = statuses.some(
      (state) => state === 'DRAFT' || is_active(state),
    )
      ? 'PROCESSING'
      : statuses.includes('REVIEW_REQUIRED')
        ? 'REVIEW_REQUIRED'
        : !statuses.length
          ? 'EXCLUDED'
          : statuses.every((state) => state === 'PAID')
            ? 'PAID'
            : statuses.includes('PAID')
              ? 'PARTIALLY_PAID'
              : 'FAILED';
    await tx.query(updateCycleStatus, [id, status]);
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

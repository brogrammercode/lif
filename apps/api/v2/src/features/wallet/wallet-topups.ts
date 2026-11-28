import { nextEntityId } from '../../database/entity-id.js';
import {
  applyTopupDelta,
  ownTopups,
  requiredTopup,
  topupRows,
  walletDisputes,
} from './sql/wallet-topups.sql.js';
import { Injectable, Optional } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WalletTopUp } from './wallet.rows.js';
import { z } from 'zod';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import {
  requireActiveAccount,
  requireActiveAdmin,
} from '../../database/account-locks.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import { RazorpayWallet } from './razorpay-wallet.js';
import { RideUpi } from './ride-upi.js';
import {
  active_topup_mode,
  gateway_credential_mode,
  payout_schedule_lock,
  readWalletControls,
} from './wallet-controls.js';

export const start_topup = z
  .object({
    amount_paise: z.number().int().min(100).max(1000000),
    request_key: z.uuid(),
    checkout_kind: z.enum(['LINK', 'SDK']).optional(),
  })
  .strict();

export const topup_reference = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const reconcilable = (status: WalletTopUp['status']) =>
  status === 'CREATING' ||
  status === 'PENDING' ||
  status === 'CANCELLED' ||
  status === 'FAILED';

const event_schema = z.object({
  event: z.string(),
  payload: z.object({
    order: z
      .object({
        entity: z.object({
          id: z.string().regex(/^order_[A-Za-z0-9]+$/),
          receipt: z.string().nullish(),
        }),
      })
      .optional(),
    payment: z
      .object({
        entity: z.object({
          order_id: z
            .string()
            .regex(/^order_[A-Za-z0-9]+$/)
            .nullish(),
        }),
      })
      .optional(),
    payment_link: z
      .object({
        entity: z.object({
          id: z.string(),
          reference_id: z.string().nullish(),
        }),
      })
      .optional(),
    refund: z
      .object({ entity: z.object({ payment_id: z.string() }) })
      .optional(),
    dispute: z
      .object({
        entity: z.object({
          payment_id: z.string(),
          id: z
            .string()
            .regex(/^disp_[A-Za-z0-9]+$/)
            .optional(),
        }),
      })
      .optional(),
  }),
});

const lock_topup = 720066;
const link_lifetime_ms = 30 * 60_000;
const topups_disabled = () =>
  new AppError(503, 'WALLET_TOPUP_DISABLED', 'Wallet top-ups are unavailable.');

@Injectable()
export class WalletTopUps {
  constructor(
    private readonly db: PostgresService,
    private readonly provider: RazorpayWallet,
    @Optional() private readonly ride_upi?: RideUpi,
  ) {}

  async list(user_id: string) {
    const [rows, controls] = await Promise.all([
      topupRows(
        this.db,
        `SELECT t.* ${ownTopups} ORDER BY t.created_at DESC,t.id DESC LIMIT 20`,
        [user_id],
      ),
      readWalletControls(this.db),
    ]);
    return {
      enabled:
        active_topup_mode(controls, this.provider.credential_mode) !== null,
      rows: rows.map(present),
    };
  }

  async admin_reviews(user_id: string) {
    const rows = await topupRows(
      this.db,
      `SELECT t.* ${ownTopups} AND t.status='REVIEW_REQUIRED'
      ORDER BY t.created_at DESC,t.id DESC LIMIT 20`,
      [user_id],
    );
    return rows.map((row) => ({
      ...present(row),
      provider_payment_id: row.provider_payment_id,
    }));
  }

  async start(user_id: string, input: z.infer<typeof start_topup>) {
    const row = await this.db.transaction(async (tx) => {
      await requireActiveAccount(tx, user_id);
      await tx.query('SELECT pg_advisory_xact_lock_shared($1::int)', [
        payout_schedule_lock,
      ]);
      const mode = active_topup_mode(
        await readWalletControls(tx),
        this.provider.credential_mode,
      );
      const walletSql =
        "SELECT id FROM wallets WHERE user_id=$1 AND kind='RIDER'";
      let wallet = (await tx.query<{ id: string }>(walletSql, [user_id]))
        .rows[0];
      if (!wallet) {
        if (!mode) throw topups_disabled();
        await tx.query(
          `INSERT INTO wallets (id,user_id,kind) VALUES ($1,$2,'RIDER')
          ON CONFLICT(user_id,kind) DO NOTHING`,
          [nextEntityId(), user_id],
        );
        wallet = (await tx.query<{ id: string }>(walletSql, [user_id])).rows[0];
        if (!wallet)
          throw new Error('Funding wallet was unavailable after creation');
      }

      await tx.query('SELECT pg_advisory_xact_lock($1::int,hashtext($2))', [
        lock_topup,
        wallet.id,
      ]);
      const [existing] = await topupRows(
        tx,
        'SELECT * FROM wallet_topups WHERE wallet_id=$1 AND request_key=$2',
        [wallet.id, input.request_key],
      );
      if (existing) {
        if (existing.amount_paise !== BigInt(input.amount_paise))
          throw new AppError(
            409,
            'TOPUP_AMOUNT_CHANGED',
            'The amount changed for this checkout.',
          );
        return existing;
      }
      if (!mode) throw topups_disabled();
      const opened = await tx.query(
        "SELECT id FROM wallet_topups WHERE wallet_id=$1 AND status IN ('CREATING','PENDING') LIMIT 1",
        [wallet.id],
      );
      if (opened.rowCount)
        throw new AppError(
          409,
          'TOPUP_ALREADY_OPEN',
          'Check your existing top-up before starting another one.',
        );
      const [created] = await topupRows(
        tx,
        `INSERT INTO wallet_topups
        (id,wallet_id,amount_paise,request_key,provider_mode,checkout_kind,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp()) RETURNING *`,
        [
          nextEntityId(),
          wallet.id,
          input.amount_paise,
          input.request_key,
          mode,
          input.checkout_kind ?? 'LINK',
        ],
      );
      if (!created) throw new Error('No top-up returned after creation');
      return created;
    });
    return present(await this.sync(row, true));
  }

  async check(user_id: string, id: string, cancelled = false) {
    const [row] = await topupRows(
      this.db,
      `SELECT t.* ${ownTopups} AND t.id=$2`,
      [user_id, id],
    );
    if (!row) throw new AppError(404, 'TOPUP_NOT_FOUND', 'Top-up not found.');
    const synced = await this.sync(row, !cancelled);
    if (!cancelled || !['CREATING', 'PENDING'].includes(synced.status))
      return present(synced);
    // Keep provider references for a late capture after checkout dismissal.
    await this.db.query(
      `UPDATE wallet_topups SET status='CANCELLED',updated_at=clock_timestamp()
        WHERE id=$1 AND status IN ('CREATING','PENDING')`,
      [id],
    );
    return present(await requiredTopup(this.db, id));
  }

  async reconcile_pending(limit = 4, deadline = Infinity) {
    const mode = this.provider.credential_mode;
    if (!mode) return;
    const rows = await topupRows(
      this.db,
      `SELECT * FROM wallet_topups WHERE status IN ('PENDING','CREATING') AND provider_mode=$1
        ORDER BY updated_at,id LIMIT $2`,
      [mode, limit],
    );
    if (Date.now() < deadline)
      rows.push(
        ...(await topupRows(
          this.db,
          `SELECT * FROM wallet_topups
        WHERE status IN ('CANCELLED','FAILED') AND provider_order_id IS NOT NULL AND provider_mode=$1
          AND created_at>=$2 ORDER BY updated_at,id LIMIT $3`,
          [mode, new Date(Date.now() - 7 * 86400000), Math.min(limit, 4)],
        )),
      );
    for (
      let offset = 0;
      offset < rows.length && Date.now() < deadline;
      offset += 4
    ) {
      await Promise.allSettled(
        rows.slice(offset, offset + 4).map(async (row) => {
          try {
            await this.sync(row, false);
          } finally {
            await this.db.query(
              'UPDATE wallet_topups SET updated_at=clock_timestamp() WHERE id=$1 AND updated_at=$2',
              [row.id, row.updated_at],
            );
          }
        }),
      );
    }
  }

  private async sync(
    row: WalletTopUp,
    allow_create: boolean,
    event_link_id?: string,
  ) {
    if (!reconcilable(row.status)) return row;
    allow_create =
      allow_create && (row.status === 'PENDING' || row.status === 'CREATING');
    const mode = this.provider.credential_mode;
    if (!mode || row.provider_mode !== mode)
      throw new AppError(
        503,
        'WALLET_TOPUP_DISABLED',
        'Checkout verification is unavailable.',
      );
    if (row.checkout_kind === 'SDK') {
      return this.sync_order(row, allow_create, event_link_id);
    }
    const expires = row.created_at.getTime() + link_lifetime_ms;
    const known_link = row.provider_link_id ?? event_link_id;
    let link = known_link
      ? await this.provider.fetch(known_link)
      : await this.provider.find(row.id);
    if (
      !link &&
      allow_create &&
      Date.now() < expires &&
      active_topup_mode(await readWalletControls(this.db), mode) === mode
    ) {
      try {
        link = await this.provider.create(
          row.id,
          Number(row.amount_paise),
          Math.floor(expires / 1000),
        );
      } catch (error) {
        // Razorpay enforces unique Payment Link reference_id. Look up the
        // existing link after concurrent creates and lost responses.
        link = await this.provider.find(row.id);
        if (!link) throw error;
      }
    }
    if (!link) {
      if (Date.now() < expires) return row;
      await this.db.query(
        `UPDATE wallet_topups SET status='FAILED',updated_at=clock_timestamp()
          WHERE id=$1 AND status='CREATING' AND provider_link_id IS NULL`,
        [row.id],
      );
      return requiredTopup(this.db, row.id);
    }
    if (
      link.reference_id !== row.id ||
      BigInt(link.amount) !== row.amount_paise
    )
      throw new AppError(
        409,
        'TOPUP_LINK_MISMATCH',
        'Checkout could not be matched to the wallet.',
      );
    const payment = await this.provider.settled_payment(link);
    const failure =
      !payment && link.order_id && link.status !== 'paid'
        ? await this.provider.order_failure(
            link.order_id,
            link.amount,
            link.currency,
          )
        : null;
    return this.record(
      row.id,
      {
        link_id: link.id,
        checkout_url: link.short_url,
        order_id: link.order_id,
        terminal:
          link.status === 'cancelled'
            ? 'CANCELLED'
            : link.status === 'expired' || failure
              ? 'FAILED'
              : undefined,
        failure_reason:
          failure?.reason ??
          (link.status === 'expired' ? 'Payment link expired.' : undefined),
      },
      payment?.id ?? null,
      Boolean(payment?.amount_refunded || payment?.status === 'refunded'),
    );
  }

  private async sync_order(
    row: WalletTopUp,
    allow_create: boolean,
    event_order_id?: string,
  ) {
    const order_id = row.provider_order_id ?? event_order_id;
    let order = order_id
      ? await this.provider.order(order_id)
      : await this.provider.find_order(row.id);
    const expired = Date.now() >= row.created_at.getTime() + link_lifetime_ms;
    if (
      !order &&
      allow_create &&
      !expired &&
      !row.provider_order_create_claimed &&
      (await this.claim_order_creation(row))
    ) {
      try {
        order = await this.provider.create_order(
          row.id,
          Number(row.amount_paise),
        );
      } catch (error) {
        // Recover by receipt after a lost response without repeating the write.
        order = await this.provider.find_order(row.id);
        if (!order) throw error;
      }
    }
    if (!order) {
      if (expired)
        await this.db.query(
          `UPDATE wallet_topups SET status='FAILED',updated_at=clock_timestamp()
            WHERE id=$1 AND status='CREATING' AND provider_order_id IS NULL`,
          [row.id],
        );
      return requiredTopup(this.db, row.id);
    }
    if (order.receipt !== row.id || BigInt(order.amount) !== row.amount_paise)
      throw new AppError(
        409,
        'TOPUP_ORDER_MISMATCH',
        'Checkout could not be matched to the wallet.',
      );
    const payment = await this.provider.settled_order_payment(order);
    const failure =
      order.status === 'attempted' && !payment
        ? await this.provider.order_failure(
            order.id,
            order.amount,
            order.currency,
          )
        : null;
    return this.record(
      row.id,
      {
        order_id: order.id,
        terminal: failure ? 'FAILED' : undefined,
        failure_reason: failure?.reason,
      },
      payment?.id ?? null,
      Boolean(payment?.amount_refunded || payment?.status === 'refunded'),
    );
  }

  private async claim_order_creation(row: WalletTopUp) {
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock_shared($1::int)', [
        payout_schedule_lock,
      ]);
      if (
        !row.provider_mode ||
        active_topup_mode(
          await readWalletControls(tx),
          this.provider.credential_mode,
        ) !== row.provider_mode
      )
        return false;
      const claimed = await tx.query(
        `UPDATE wallet_topups SET provider_order_create_claimed=true,updated_at=clock_timestamp()
           WHERE id=$1 AND status='CREATING' AND provider_order_id IS NULL AND NOT provider_order_create_claimed`,
        [row.id],
      );
      return claimed.rowCount === 1;
    });
  }

  private record(
    id: string,
    checkout: {
      link_id?: string;
      checkout_url?: string;
      order_id?: string | null;
      terminal?: 'FAILED' | 'CANCELLED';
      failure_reason?: string;
    },
    captured: string | null,
    refunded: boolean,
  ) {
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1::int,hashtext($2))', [
        lock_topup,
        id,
      ]);
      const row = await requiredTopup(tx, id);
      if (!reconcilable(row.status)) return row;
      if (
        !captured &&
        (row.status === 'FAILED' ||
          (row.status === 'CANCELLED' && checkout.terminal !== 'FAILED'))
      ) {
        if (
          checkout.failure_reason &&
          checkout.failure_reason !== row.failure_reason
        ) {
          const [updated] = await topupRows(
            tx,
            'UPDATE wallet_topups SET failure_reason=$2,updated_at=clock_timestamp() WHERE id=$1 RETURNING *',
            [id, checkout.failure_reason],
          );
          return updated ?? row;
        }
        return row;
      }
      if (
        (row.provider_link_id && row.provider_link_id !== checkout.link_id) ||
        (row.provider_order_id &&
          checkout.order_id &&
          row.provider_order_id !== checkout.order_id)
      )
        throw new AppError(
          409,
          'TOPUP_LINK_MISMATCH',
          'This wallet top-up is linked to another checkout.',
        );
      let review = false;
      if (captured) {
        await tx.query('SELECT pg_advisory_xact_lock(720067,hashtext($1))', [
          captured,
        ]);
        review =
          refunded ||
          Boolean(
            (
              await tx.query(
                "SELECT event_id FROM wallet_provider_events WHERE provider='razorpay-wallet' AND subject_id=$1 LIMIT 1",
                [captured],
              )
            ).rowCount,
          );
      }
      if (captured && !review)
        await applyTopupDelta(tx, {
          walletId: row.wallet_id,
          topupId: id,
          operationKey: `topup:${id}`,
          delta: row.amount_paise,
        });
      const [updated] = await topupRows(
        tx,
        `UPDATE wallet_topups SET
        provider_link_id=COALESCE($2,provider_link_id),checkout_url=COALESCE($3,checkout_url),
        provider_order_id=COALESCE($4,provider_order_id),provider_payment_id=COALESCE($5,provider_payment_id),
        failure_reason=CASE WHEN $5 IS NOT NULL THEN NULL ELSE COALESCE($6,failure_reason) END,
        status=$7,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
        [
          id,
          checkout.link_id ?? null,
          checkout.checkout_url ?? null,
          checkout.order_id ?? null,
          captured,
          checkout.failure_reason ?? null,
          captured
            ? review
              ? 'REVIEW_REQUIRED'
              : 'CAPTURED'
            : (checkout.terminal ?? 'PENDING'),
        ],
      );
      if (!updated) throw new Error('Top-up missing during capture');
      return updated;
    });
  }

  async webhook(raw: Buffer | undefined, signature = '', event_id = '') {
    const secret = config.RAZORPAY_WALLET_WEBHOOK_SECRET;
    if (
      !secret ||
      !raw ||
      !/^[0-9a-f]{64}$/i.test(signature) ||
      !timingSafeEqual(
        Buffer.from(signature, 'hex'),
        createHmac('sha256', secret).update(raw).digest(),
      )
    )
      throw new AppError(
        401,
        'INVALID_WEBHOOK_SIGNATURE',
        'Webhook signature is invalid.',
      );
    const input = event_schema.parse(JSON.parse(raw.toString('utf8')));
    if (!/^[\w-]{1,128}$/.test(event_id))
      throw new AppError(
        400,
        'EVENT_ID_REQUIRED',
        'A provider event ID is required.',
      );
    const {
      rows: [already],
    } = await this.db.query<{ processed_at: Date | null }>(
      "SELECT processed_at FROM wallet_provider_events WHERE provider='razorpay-wallet' AND event_id=$1",
      [event_id],
    );
    if (already?.processed_at) return;
    const link = input.payload.payment_link?.entity;
    if (
      link?.reference_id &&
      topup_reference.safeParse(link.reference_id).success &&
      /^payment_link\.(paid|expired|cancelled)$/.test(input.event)
    ) {
      const [row] = await topupRows(
        this.db,
        'SELECT * FROM wallet_topups WHERE id=$1',
        [link.reference_id],
      );
      if (row && row.checkout_kind !== 'SDK') {
        const synced = await this.sync(row, false, link.id);
        if (input.event === 'payment_link.paid' && reconcilable(synced.status))
          throw capture_pending();
      }
    }
    const order = input.payload.order?.entity;
    const capture_order =
      input.event === 'order.paid'
        ? order?.id
        : input.event === 'payment.captured'
          ? input.payload.payment?.entity.order_id
          : null;
    if (capture_order && this.ride_upi) {
      const ride = await this.ride_upi.reconcile_order(capture_order);
      if (ride && ['PENDING', 'FAILED'].includes(ride.status))
        throw capture_pending();
    }
    if (
      input.event === 'order.paid' &&
      order &&
      topup_reference.safeParse(order.receipt).success
    ) {
      const [row] = await topupRows(
        this.db,
        'SELECT * FROM wallet_topups WHERE id=$1',
        [order.receipt!],
      );
      if (row?.checkout_kind === 'SDK') {
        const synced = await this.sync(row, false, order.id);
        if (reconcilable(synced.status)) throw capture_pending();
      }
    }
    const payment_id =
      input.event === 'refund.processed'
        ? input.payload.refund?.entity.payment_id
        : input.event === 'payment.dispute.created'
          ? input.payload.dispute?.entity.payment_id
          : null;
    if (
      ['payment.failed', 'payment.captured'].includes(input.event) &&
      input.payload.payment?.entity.order_id
    ) {
      const [row] = await topupRows(
        this.db,
        'SELECT * FROM wallet_topups WHERE provider_order_id=$1',
        [input.payload.payment.entity.order_id],
      );
      if (row) {
        const synced = await this.sync(row, false);
        if (input.event === 'payment.captured' && reconcilable(synced.status))
          throw capture_pending();
      }
    }
    if (payment_id) {
      if (
        await this.ride_upi?.flag_refund_or_dispute(
          payment_id,
          input.event,
          event_id,
          input.payload.dispute?.entity.id,
        )
      )
        return;
      await this.flag_review(
        payment_id,
        input.event,
        event_id,
        undefined,
        input.payload.dispute?.entity.id,
      );
      return;
    }
    await this.db.query(
      `INSERT INTO wallet_provider_events (provider,event_id,event_type,processed_at)
        VALUES ('razorpay-wallet',$1,$2,clock_timestamp())
        ON CONFLICT(provider,event_id) DO UPDATE SET processed_at=EXCLUDED.processed_at`,
      [event_id, input.event],
    );
  }

  async admin_reconcile(
    actor_id: string,
    user_id: string,
    id: string,
    reason: string,
    legacy_dispute_id?: string,
  ) {
    const [row] = await topupRows(
      this.db,
      `SELECT t.* ${ownTopups} AND t.id=$2 AND t.status='REVIEW_REQUIRED'`,
      [user_id, id],
    );
    if (
      !row?.provider_payment_id ||
      !this.provider.credential_mode ||
      row.provider_mode !== this.provider.credential_mode
    )
      throw new AppError(
        409,
        'TOPUP_REVIEW_UNAVAILABLE',
        'A matching provider payment is required.',
      );
    const { rows: disputes } = await this.db.query<{
      event_id: string;
      object_id: string | null;
    }>(
      `SELECT event_id,object_id ${walletDisputes} ORDER BY received_at,event_id LIMIT 6`,
      [row.provider_payment_id],
    );
    const dispute_ids = [
      ...new Set(disputes.map((event) => event.object_id ?? legacy_dispute_id)),
    ];
    if (
      disputes.length > 5 ||
      dispute_ids.includes(undefined) ||
      disputes.filter((event) => !event.object_id).length > 1
    )
      throw new AppError(
        409,
        'TOPUP_DISPUTE_REFERENCE_REQUIRED',
        'The provider dispute references are required to settle this review.',
      );
    const resolved = await Promise.all(
      dispute_ids.map((id) => this.provider.dispute(id!)),
    );
    let chargeback = 0n;
    for (const [index, item] of resolved.entries()) {
      if (
        item.id !== dispute_ids[index] ||
        item.payment_id !== row.provider_payment_id ||
        item.currency !== 'INR' ||
        !['won', 'lost', 'closed'].includes(item.status) ||
        (item.status === 'lost' && item.amount_deducted == null)
      )
        throw new AppError(
          409,
          'TOPUP_DISPUTE_PENDING',
          'Razorpay has not confirmed a matching final dispute outcome.',
        );
      if (item.status === 'lost')
        chargeback += BigInt(item.amount_deducted ?? 0);
    }
    await this.flag_review(row.provider_payment_id, 'refund.processed', null, {
      actor_id,
      reason,
      event_ids: disputes.map((event) => event.event_id),
      chargeback,
      dispute_ids: resolved.map((item) => item.id),
    });
    return { id };
  }

  private async flag_review(
    payment_id: string,
    event_type: string,
    event_id: string | null,
    admin?: {
      actor_id: string;
      reason: string;
      event_ids: string[];
      dispute_ids: string[];
      chargeback: bigint;
    },
    object_id?: string,
  ) {
    const payment =
      event_type === 'refund.processed' && this.provider.credential_mode
        ? await this.provider.payment(payment_id)
        : null;
    await this.db.transaction(async (tx) => {
      if (admin) await requireActiveAdmin(tx, admin.actor_id);
      await tx.query('SELECT pg_advisory_xact_lock(720067,hashtext($1))', [
        payment_id,
      ]);
      if (event_id)
        await tx.query(
          `INSERT INTO wallet_provider_events (provider,event_id,event_type,subject_id,object_id,processed_at)
          VALUES ('razorpay-wallet',$1,$2,$3,$4,clock_timestamp()) ON CONFLICT(provider,event_id) DO NOTHING`,
          [event_id, event_type, payment_id, object_id ?? null],
        );
      const [row] = await topupRows(
        tx,
        'SELECT * FROM wallet_topups WHERE provider_payment_id=$1',
        [payment_id],
      );
      if (!row || !['CAPTURED', 'REVIEW_REQUIRED'].includes(row.status)) {
        if (admin)
          throw new AppError(
            409,
            'TOPUP_REVIEW_CHANGED',
            'This top-up no longer needs reconciliation.',
          );
        return;
      }
      const {
        rows: [disputed],
      } = await tx.query(
        `SELECT event_id ${walletDisputes} AND NOT(event_id=ANY($2::text[])) LIMIT 1`,
        [payment_id, admin?.event_ids ?? []],
      );
      if (admin && disputed)
        throw new AppError(
          409,
          'TOPUP_DISPUTE_REQUIRES_REVIEW',
          'The provider dispute must be resolved before releasing the wallet hold.',
        );
      const {
        rows: [wallet],
      } = await tx.query<{ id: string; available_paise: string }>(
        'SELECT id,available_paise FROM wallets WHERE id=$1 FOR UPDATE',
        [row.wallet_id],
      );
      if (!wallet)
        throw new Error('Funding wallet unavailable for reconciliation');
      const chargeback =
        row.reviewed_chargeback_paise + (admin?.chargeback ?? 0n);
      const refunded = BigInt(payment?.amount_refunded ?? 0);
      const cumulative = chargeback + refunded;
      if (
        payment &&
        !disputed &&
        row.provider_mode === this.provider.credential_mode &&
        payment.id === payment_id &&
        payment.order_id === row.provider_order_id &&
        payment.currency === 'INR' &&
        BigInt(payment.amount) === row.amount_paise &&
        ['captured', 'refunded'].includes(payment.status) &&
        refunded >= 0n &&
        (refunded > 0n || Boolean(admin?.event_ids.length)) &&
        // Refunds and chargebacks against the same capture need provider reconciliation
        // before their overlap can be established.
        !(chargeback > 0n && refunded > 0n) &&
        cumulative <= row.amount_paise
      ) {
        const {
          rows: [previous],
        } = await tx.query<{ net: string }>(
          "SELECT COALESCE(sum(available_delta_paise),0)::text AS net FROM wallet_entries WHERE topup_id=$1 AND kind='REFUND'",
          [row.id],
        );
        const delta = cumulative + BigInt(previous?.net ?? 0);
        const {
          rows: [source],
        } = await tx.query<{ id: string }>(
          'SELECT id FROM wallet_entries WHERE operation_key=$1',
          [`topup:${row.id}`],
        );
        if (admin && !source) {
          const net = row.amount_paise - cumulative;
          if (net > 0n)
            await applyTopupDelta(tx, {
              walletId: wallet.id,
              topupId: row.id,
              operationKey: `topup:${row.id}`,
              delta: net,
            });
          await tx.query(
            `UPDATE wallet_topups SET status=$2,credited_net_of_refund_paise=$3,
            reviewed_chargeback_paise=$4,updated_at=clock_timestamp() WHERE id=$1`,
            [
              row.id,
              cumulative === row.amount_paise ? 'REFUNDED' : 'CAPTURED',
              String(cumulative),
              String(chargeback),
            ],
          );
          await this.log_reconciliation(tx, row, admin, cumulative);
          return;
        }
        if (!admin && delta <= 0n && source) return;
        if (
          source &&
          BigInt(wallet.available_paise) >=
            delta - row.credited_net_of_refund_paise
        ) {
          const remaining = delta - row.credited_net_of_refund_paise;
          if (remaining > 0n)
            await applyTopupDelta(tx, {
              walletId: wallet.id,
              topupId: row.id,
              operationKey: `topup-refund:${row.id}:${cumulative}`,
              delta: -remaining,
              reverses: source.id,
            });
          if (cumulative === row.amount_paise || admin)
            await tx.query(
              `UPDATE wallet_topups SET status=$2,reviewed_chargeback_paise=$3,
                updated_at=clock_timestamp() WHERE id=$1`,
              [
                row.id,
                cumulative === row.amount_paise ? 'REFUNDED' : 'CAPTURED',
                String(chargeback),
              ],
            );
          if (admin) await this.log_reconciliation(tx, row, admin, cumulative);
          return;
        }
      }
      if (admin)
        throw new AppError(
          409,
          'TOPUP_REFUND_UNRESOLVED',
          'The provider refund could not be verified or the wallet balance is insufficient.',
        );
      await tx.query(
        "UPDATE wallet_topups SET status='REVIEW_REQUIRED',updated_at=clock_timestamp() WHERE id=$1 AND status='CAPTURED'",
        [row.id],
      );
    });
  }

  private async log_reconciliation(
    tx: SqlClient,
    row: WalletTopUp,
    admin: {
      actor_id: string;
      reason: string;
      event_ids: string[];
      dispute_ids: string[];
    },
    cumulative: bigint,
  ) {
    await tx.query(
      "UPDATE wallet_provider_events SET reconciled_at=clock_timestamp() WHERE provider='razorpay-wallet' AND event_id=ANY($1::text[])",
      [admin.event_ids],
    );
    return insertUserLog(tx, {
      actor_id: admin.actor_id,
      entity_type: 'WalletTopUp',
      entity_id: row.id,
      action: 'RECONCILE_WALLET_TOPUP',
      after_data: {
        reason: admin.reason,
        reconciled_loss_paise: String(cumulative),
        provider_dispute_ids: admin.dispute_ids,
      },
    });
  }
}

function present(row: WalletTopUp) {
  const sdk_ready =
    row.status === 'PENDING' &&
    row.checkout_kind === 'SDK' &&
    row.provider_order_id &&
    row.provider_mode === gateway_credential_mode();
  return {
    id: row.id,
    amount_paise: String(row.amount_paise),
    status: row.status,
    ...(row.failure_reason && row.status === 'FAILED'
      ? { failure_reason: row.failure_reason }
      : {}),
    ...(row.status === 'PENDING' && row.checkout_url
      ? { checkout_url: row.checkout_url }
      : {}),
    ...(sdk_ready
      ? {
          sdk_checkout: {
            key_id: config.RAZORPAY_WALLET_KEY_ID,
            order_id: row.provider_order_id,
          },
        }
      : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const capture_pending = () =>
  new AppError(
    503,
    'TOPUP_CAPTURE_PENDING',
    'Razorpay capture is still being verified.',
  );

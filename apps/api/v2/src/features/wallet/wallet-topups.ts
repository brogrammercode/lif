import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WalletTopUp } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import {
  require_active_account,
  require_active_admin,
} from '../../infra/database/account_lifecycle.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { RazorpayWallet, type RazorpayWalletLink } from './razorpay-wallet.js';
import {
  active_topup_mode,
  payout_schedule_lock,
  read_wallet_controls,
} from './wallet-controls.js';

export const start_topup = z
  .object({
    amount_paise: z.number().int().min(100).max(1000000),
    request_key: z.uuid(),
  })
  .strict();

const event_schema = z.object({
  event: z.string(),
  payload: z.object({
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
    private readonly db: PrismaService,
    private readonly provider: RazorpayWallet,
  ) {}

  async list(user_id: string) {
    const [rows, controls] = await Promise.all([
      this.db.client.walletTopUp.findMany({
        where: { wallet: { user_id, kind: 'RIDER' } },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
      read_wallet_controls(this.db.client),
    ]);
    return {
      enabled:
        active_topup_mode(controls, this.provider.credential_mode) !== null,
      rows: rows.map(present),
    };
  }

  async admin_reviews(user_id: string) {
    const rows = await this.db.client.walletTopUp.findMany({
      where: { wallet: { user_id, kind: 'RIDER' }, status: 'REVIEW_REQUIRED' },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return rows.map((row) => ({
      ...present(row),
      provider_payment_id: row.provider_payment_id,
    }));
  }

  async start(user_id: string, input: z.infer<typeof start_topup>) {
    const row = await this.db.client.$transaction(async (tx) => {
      await require_active_account(tx, user_id);
      // Serialize creating funding records with admin mode changes and payout reservation.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${payout_schedule_lock}::int)`;
      const mode = active_topup_mode(
        await read_wallet_controls(tx),
        this.provider.credential_mode,
      );
      const key = { user_id_kind: { user_id, kind: 'RIDER' as const } };
      let wallet = await tx.wallet.findUnique({
        where: key,
        select: { id: true },
      });
      if (!wallet) {
        if (!mode) throw topups_disabled();
        wallet = await tx.wallet.upsert({
          where: key,
          create: { user_id, kind: 'RIDER' },
          update: {},
          select: { id: true },
        });
      }
      // One open checkout per account. This also bounds ambiguous provider creates.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lock_topup}::int, hashtext(${wallet.id}))`;
      const existing = await tx.walletTopUp.findUnique({
        where: {
          wallet_id_request_key: {
            wallet_id: wallet.id,
            request_key: input.request_key,
          },
        },
      });
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
      const open = await tx.walletTopUp.findFirst({
        where: {
          wallet_id: wallet.id,
          status: { in: ['CREATING', 'PENDING'] },
        },
        select: { id: true },
      });
      if (open)
        throw new AppError(
          409,
          'TOPUP_ALREADY_OPEN',
          'Check your existing top-up before starting another one.',
        );
      return tx.walletTopUp.create({
        data: {
          wallet_id: wallet.id,
          amount_paise: input.amount_paise,
          request_key: input.request_key,
          provider_mode: mode,
        },
      });
    });
    return present(await this.sync(row, true));
  }

  async check(user_id: string, id: string) {
    const row = await this.db.client.walletTopUp.findFirst({
      where: { id, wallet: { user_id, kind: 'RIDER' } },
    });
    if (!row) throw new AppError(404, 'TOPUP_NOT_FOUND', 'Top-up not found.');
    return present(await this.sync(row, true));
  }

  async reconcile_pending() {
    const mode = this.provider.credential_mode;
    if (!mode) return;
    const rows = await this.db.client.walletTopUp.findMany({
      where: {
        status: { in: ['PENDING', 'CREATING'] },
        provider_mode: mode,
      },
      orderBy: { updated_at: 'asc' },
      take: 4,
    });
    await Promise.allSettled(
      rows.map(async (row) => {
        try {
          await this.sync(row, false);
        } finally {
          await this.db.client.walletTopUp.updateMany({
            where: { id: row.id, updated_at: row.updated_at },
            data: { updated_at: new Date() },
          });
        }
      }),
    );
  }

  private async sync(
    row: WalletTopUp,
    allow_create: boolean,
    event_link_id?: string,
  ) {
    if (!['CREATING', 'PENDING'].includes(row.status)) return row;
    const mode = this.provider.credential_mode;
    if (!mode || row.provider_mode !== mode)
      throw new AppError(
        503,
        'WALLET_TOPUP_DISABLED',
        'Checkout verification is unavailable.',
      );
    const expires = row.created_at.getTime() + link_lifetime_ms;
    const known_link = row.provider_link_id ?? event_link_id;
    let link = known_link
      ? await this.provider.fetch(known_link)
      : await this.provider.find(row.id);
    if (
      !link &&
      allow_create &&
      Date.now() < expires &&
      active_topup_mode(await read_wallet_controls(this.db.client), mode) ===
        mode
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
      await this.db.client.walletTopUp.updateMany({
        where: { id: row.id, status: 'CREATING', provider_link_id: null },
        data: { status: 'FAILED' },
      });
      return this.db.client.walletTopUp.findUniqueOrThrow({
        where: { id: row.id },
      });
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
    return this.record(
      row.id,
      link,
      payment?.id ?? null,
      Boolean(payment?.amount_refunded || payment?.status === 'refunded'),
    );
  }

  private record(
    id: string,
    link: RazorpayWalletLink,
    captured: string | null,
    refunded: boolean,
  ) {
    return this.db.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lock_topup}::int, hashtext(${id}))`;
      const row = await tx.walletTopUp.findUniqueOrThrow({ where: { id } });
      if (!['CREATING', 'PENDING'].includes(row.status)) return row;
      if (row.provider_link_id && row.provider_link_id !== link.id)
        throw new AppError(
          409,
          'TOPUP_LINK_MISMATCH',
          'This wallet top-up is linked to another checkout.',
        );
      let review = false;
      if (captured) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720067, hashtext(${captured}))`;
        review =
          refunded ||
          Boolean(
            await tx.walletProviderEvent.findFirst({
              where: { provider: 'razorpay-wallet', subject_id: captured },
              select: { event_id: true },
            }),
          );
      }
      if (captured && !review) {
        const wallet = await tx.wallet.update({
          where: { id: row.wallet_id },
          data: { available_paise: { increment: row.amount_paise } },
        });
        await tx.walletEntry.create({
          data: {
            kind: 'TOP_UP',
            wallet_id: wallet.id,
            topup_id: id,
            operation_key: `topup:${id}`,
            available_delta_paise: row.amount_paise,
            held_delta_paise: 0,
            available_after_paise: wallet.available_paise,
            held_after_paise: wallet.held_paise,
          },
        });
      }
      return tx.walletTopUp.update({
        where: { id },
        data: {
          provider_link_id: link.id,
          checkout_url: link.short_url,
          provider_order_id: link.order_id ?? undefined,
          provider_payment_id: captured ?? undefined,
          status: captured
            ? review
              ? 'REVIEW_REQUIRED'
              : 'CAPTURED'
            : ['expired', 'cancelled'].includes(link.status)
              ? 'FAILED'
              : 'PENDING',
        },
      });
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
    const where = {
      provider_event_id: { provider: 'razorpay-wallet', event_id },
    };
    const already = await this.db.client.walletProviderEvent.findUnique({
      where,
    });
    if (already?.processed_at) return;
    const link = input.payload.payment_link?.entity;
    if (
      link?.reference_id &&
      z.uuid().safeParse(link.reference_id).success &&
      /^payment_link\.(paid|expired|cancelled)$/.test(input.event)
    ) {
      const row = await this.db.client.walletTopUp.findUnique({
        where: { id: link.reference_id },
      });
      if (row) await this.sync(row, false, link.id);
    }
    const payment_id =
      input.event === 'refund.processed'
        ? input.payload.refund?.entity.payment_id
        : input.event === 'payment.dispute.created'
          ? input.payload.dispute?.entity.payment_id
          : null;
    if (payment_id) {
      await this.flag_review(
        payment_id,
        input.event,
        event_id,
        undefined,
        input.payload.dispute?.entity.id,
      );
      return;
    }
    const data = { processed_at: new Date() };
    await this.db.client.walletProviderEvent.upsert({
      where,
      update: data,
      create: {
        provider: 'razorpay-wallet',
        event_id,
        event_type: input.event,
        ...data,
      },
    });
  }

  async admin_reconcile(
    actor_id: string,
    user_id: string,
    id: string,
    reason: string,
    legacy_dispute_id?: string,
  ) {
    const row = await this.db.client.walletTopUp.findFirst({
      where: {
        id,
        wallet: { user_id, kind: 'RIDER' },
        status: 'REVIEW_REQUIRED',
      },
    });
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
    const disputes = await this.db.client.walletProviderEvent.findMany({
      where: this.open_disputes(row.provider_payment_id),
      select: { event_id: true, object_id: true },
      take: 6,
    });
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

  private open_disputes(payment_id: string) {
    return {
      provider: 'razorpay-wallet',
      subject_id: payment_id,
      event_type: 'payment.dispute.created',
      reconciled_at: null,
    };
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
    await this.db.client.$transaction(async (tx) => {
      if (admin) await require_active_admin(tx, admin.actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720067, hashtext(${payment_id}))`;
      if (event_id)
        await tx.walletProviderEvent.upsert({
          where: {
            provider_event_id: { provider: 'razorpay-wallet', event_id },
          },
          update: {},
          create: {
            provider: 'razorpay-wallet',
            event_id,
            event_type,
            subject_id: payment_id,
            object_id,
            processed_at: new Date(),
          },
        });
      const row = await tx.walletTopUp.findUnique({
        where: { provider_payment_id: payment_id },
      });
      if (!row || !['CAPTURED', 'REVIEW_REQUIRED'].includes(row.status)) {
        if (admin)
          throw new AppError(
            409,
            'TOPUP_REVIEW_CHANGED',
            'This top-up no longer needs reconciliation.',
          );
        return;
      }
      const disputed = await tx.walletProviderEvent.findFirst({
        where: {
          ...this.open_disputes(payment_id),
          ...(admin ? { event_id: { notIn: admin.event_ids } } : {}),
        },
        select: { event_id: true },
      });
      if (admin && disputed)
        throw new AppError(
          409,
          'TOPUP_DISPUTE_REQUIRES_REVIEW',
          'The provider dispute must be resolved before releasing the wallet hold.',
        );
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${row.wallet_id} FOR UPDATE`;
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
        const previous = await tx.walletEntry.aggregate({
          where: { topup_id: row.id, kind: 'REFUND' },
          _sum: { available_delta_paise: true },
        });
        const delta = cumulative + (previous._sum.available_delta_paise ?? 0n);
        const source = await tx.walletEntry.findUnique({
          where: { operation_key: `topup:${row.id}` },
        });
        const wallet = await tx.wallet.findUniqueOrThrow({
          where: { id: row.wallet_id },
        });
        if (admin && !source) {
          const net = row.amount_paise - cumulative;
          if (net > 0n) {
            const balance = await tx.wallet.update({
              where: { id: wallet.id },
              data: { available_paise: { increment: net } },
            });
            await tx.walletEntry.create({
              data: {
                kind: 'TOP_UP',
                wallet_id: wallet.id,
                topup_id: row.id,
                operation_key: `topup:${row.id}`,
                available_delta_paise: net,
                held_delta_paise: 0,
                available_after_paise: balance.available_paise,
                held_after_paise: balance.held_paise,
              },
            });
          }
          await tx.walletTopUp.update({
            where: { id: row.id },
            data: {
              status: cumulative === row.amount_paise ? 'REFUNDED' : 'CAPTURED',
              credited_net_of_refund_paise: cumulative,
              reviewed_chargeback_paise: chargeback,
            },
          });
          await this.log_reconciliation(tx, row, admin, cumulative);
          return;
        }
        if (!admin && delta <= 0n && source) return;
        if (
          source &&
          wallet.available_paise >= delta - row.credited_net_of_refund_paise
        ) {
          const remaining = delta - row.credited_net_of_refund_paise;
          if (remaining > 0n) {
            const balance = await tx.wallet.update({
              where: { id: wallet.id },
              data: { available_paise: { decrement: remaining } },
            });
            await tx.walletEntry.create({
              data: {
                wallet_id: balance.id,
                topup_id: row.id,
                kind: 'REFUND',
                reverses_entry_id: source.id,
                operation_key: `topup-refund:${row.id}:${cumulative}`,
                available_delta_paise: -remaining,
                held_delta_paise: 0,
                available_after_paise: balance.available_paise,
                held_after_paise: balance.held_paise,
              },
            });
          }
          if (cumulative === row.amount_paise || admin)
            await tx.walletTopUp.update({
              where: { id: row.id },
              data: {
                status:
                  cumulative === row.amount_paise ? 'REFUNDED' : 'CAPTURED',
                reviewed_chargeback_paise: chargeback,
              },
            });
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
      await tx.walletTopUp.updateMany({
        where: { id: row.id, status: 'CAPTURED' },
        data: { status: 'REVIEW_REQUIRED' },
      });
    });
  }

  private async log_reconciliation(
    tx: import('../../infra/database/client.js').TransactionClient,
    row: WalletTopUp,
    admin: {
      actor_id: string;
      reason: string;
      event_ids: string[];
      dispute_ids: string[];
    },
    cumulative: bigint,
  ) {
    await tx.walletProviderEvent.updateMany({
      where: { provider: 'razorpay-wallet', event_id: { in: admin.event_ids } },
      data: { reconciled_at: new Date() },
    });
    return create_user_log(tx, {
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
  return {
    id: row.id,
    amount_paise: String(row.amount_paise),
    status: row.status,
    checkout_url: row.status === 'PENDING' ? row.checkout_url : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

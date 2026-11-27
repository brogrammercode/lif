import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../../core/error.js';
import { require_active_admin } from '../../infra/database/account_lifecycle.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { create_user_log } from '../../infra/database/user_log.js';
import { user_id_schema } from '../admin_user/admin_user.type.js';

const revision = z.iso.datetime();
const reason = z.string().trim().min(3).max(300);
export const payout_edit = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('exclude'),
      expected_updated_at: revision,
      reason,
    })
    .strict(),
  z
    .object({
      action: z.literal('include'),
      expected_updated_at: revision,
      reason,
    })
    .strict(),
  z
    .object({
      action: z.literal('adjust'),
      expected_updated_at: revision,
      reason,
      amount_paise: z.string().regex(/^-?[1-9][0-9]{0,9}$/),
      ride_id: user_id_schema.optional(),
      reference: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
]);
export const payout_block = z
  .object({
    driver_id: user_id_schema,
    reason,
    expires_at: z.iso.datetime().nullable().optional(),
    blocked: z.boolean(),
  })
  .strict();

@Injectable()
export class PayoutAdmin {
  constructor(private readonly db: PrismaService) {}

  async report(id: string) {
    const cycle = await this.db.client.payoutCycle.findUnique({
      where: { id },
      select: { id: true, cutoff_at: true, scheduled_at: true },
    });
    if (!cycle)
      throw new AppError(
        404,
        'PAYOUT_CYCLE_NOT_FOUND',
        'Payout cycle not found.',
      );
    const limit = 10000;
    const rows = await this.db.client.$queryRaw<
      Record<string, string | null>[]
    >`
      SELECT p.id AS payout_id, p.status::text AS status,
        u.id AS driver_id, trim(concat_ws(' ', u.first_name, u.last_name)) AS driver_name,
        p.amount_paise::text AS payout_total_paise,
        p.exclusion_reason, l.ride_id, l.reference, l.reason,
        (CASE WHEN e.kind = 'CASH_PAYMENT' THEN e.external_amount_paise WHEN e.kind = 'RIDE_EARNING' THEN e.available_delta_paise + COALESCE(e.commission_paise, 0) END)::text AS gross_paise,
        e.commission_percent::text AS commission_percent,
        e.commission_paise::text AS commission_paise,
        l.amount_paise::text AS line_amount_paise,
        l.actor_id AS recorded_by, attempt.provider_payout_id, attempt.utr
      FROM driver_payouts p
      JOIN wallets w ON w.id = p.wallet_id
      JOIN users u ON u.id = w.user_id
      LEFT JOIN driver_payout_lines l ON l.payout_id = p.id
      LEFT JOIN wallet_entries e ON e.id = l.source_entry_id
      LEFT JOIN LATERAL (
        SELECT provider_payout_id, utr FROM driver_payout_attempts a
        WHERE a.payout_id = p.id ORDER BY a.attempt_number DESC LIMIT 1
      ) attempt ON true
      WHERE p.cycle_id = ${id}
      ORDER BY p.id, l.created_at, l.id
      LIMIT ${limit + 1}
    `;
    if (rows.length > limit)
      throw new AppError(
        422,
        'PAYOUT_REPORT_TOO_LARGE',
        'This cycle exceeds the 10,000-line export limit.',
      );
    const columns = [
      'payout_id',
      'status',
      'driver_id',
      'driver_name',
      'payout_total_paise',
      'exclusion_reason',
      'ride_id',
      'reference',
      'reason',
      'gross_paise',
      'commission_percent',
      'commission_paise',
      'line_amount_paise',
      'recorded_by',
      'provider_payout_id',
      'utr',
    ];
    const csv = (value: string | null | undefined) => {
      const field = value ?? '';
      const formula =
        /^[\s\uFEFF]*[=+@-]/.test(field) && !/^-\d+(\.\d+)?$/.test(field);
      return '"' + (formula ? "'" : '') + field.replaceAll('"', '""') + '"';
    };
    return {
      file_name: `payout-${id}-${cycle.cutoff_at.toISOString().slice(0, 10)}.csv`,
      csv: [
        columns.join(','),
        ...rows.map((row) => columns.map((key) => csv(row[key])).join(',')),
      ].join('\r\n'),
    };
  }

  async edit(actor_id: string, id: string, input: z.infer<typeof payout_edit>) {
    return this.db.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720065)`;
      const payout = await tx.driverPayout.findUnique({
        where: { id },
        include: {
          cycle: { select: { status: true, cutoff_at: true } },
          wallet: { select: { user_id: true } },
        },
      });
      if (!payout)
        throw new AppError(404, 'PAYOUT_NOT_FOUND', 'Driver payout not found.');
      if (payout.updated_at.getTime() !== Date.parse(input.expected_updated_at))
        throw new AppError(
          409,
          'PAYOUT_CHANGED',
          'The payout changed. Reload before editing.',
        );
      if (
        payout.cycle.status !== 'DRAFT' ||
        !['DRAFT', 'EXCLUDED'].includes(payout.status)
      )
        throw new AppError(
          409,
          'PAYOUT_LOCKED',
          'Only draft payouts can be edited.',
        );
      let amount = payout.amount_paise;
      let status = payout.status;
      let exclusion_reason = payout.exclusion_reason;
      if (input.action === 'exclude') {
        status = 'EXCLUDED';
        exclusion_reason = input.reason;
      } else if (input.action === 'include') {
        const newer = await tx.driverPayoutLine.findFirst({
          where: {
            source_entry: { payout_lines: { some: { payout_id: payout.id } } },
            payout: {
              id: { not: payout.id },
              status: { notIn: ['EXCLUDED', 'FAILED', 'REVERSED'] },
            },
          },
          select: { id: true },
        });
        if (newer)
          throw new AppError(
            409,
            'PAYOUT_EARNINGS_MOVED',
            'These earnings already belong to another cycle.',
          );
        const block = await tx.payoutDriverBlock.findUnique({
          where: { driver_id: payout.wallet.user_id },
        });
        if (block && (!block.expires_at || block.expires_at > new Date()))
          throw new AppError(
            409,
            'DRIVER_PAYOUT_BLOCKED',
            'Unblock the driver before including this payout.',
          );
        status = 'DRAFT';
        exclusion_reason = null;
      } else {
        if (status !== 'DRAFT')
          throw new AppError(
            409,
            'PAYOUT_EXCLUDED',
            'Include this driver before adjusting their payout.',
          );
        const delta = BigInt(input.amount_paise);
        amount += delta;
        if (amount < 0n)
          throw new AppError(
            422,
            'PAYOUT_AMOUNT_INVALID',
            'A deduction cannot exceed the draft payout.',
          );
        if (input.ride_id) {
          const ride = await tx.ride.findFirst({
            where: {
              id: input.ride_id,
              driver: { user_id: payout.wallet.user_id },
              status: 'COMPLETED',
              completed_at: { lte: payout.cycle.cutoff_at },
            },
            select: { id: true },
          });
          if (!ride)
            throw new AppError(
              422,
              'PAYOUT_RIDE_INVALID',
              'Select a completed ride for this driver before the cycle cutoff.',
            );
        }
        await tx.driverPayoutLine.create({
          data: {
            payout_id: id,
            amount_paise: delta,
            ride_id: input.ride_id,
            reference: input.reference,
            reason: input.reason,
            actor_id,
          },
        });
      }
      const row = await tx.driverPayout.update({
        where: { id },
        data: {
          amount_paise: amount,
          status,
          exclusion_reason,
          updated_at: new Date(
            Math.max(Date.now(), payout.updated_at.getTime() + 1),
          ),
        },
      });
      await tx.payoutCycle.update({
        where: { id: payout.cycle_id },
        data: { version: { increment: 1 } },
      });
      await create_user_log(tx, {
        actor_id,
        entity_type: 'DriverPayout',
        entity_id: id,
        action: 'EDIT_DRAFT_PAYOUT',
        before_data: {
          amount_paise: String(payout.amount_paise),
          status: payout.status,
        },
        after_data: { ...input, amount_after_paise: String(amount), status },
      });
      return {
        id,
        amount_paise: String(amount),
        status,
        updated_at: row.updated_at,
      };
    });
  }

  async blocks() {
    return this.db.client.payoutDriverBlock.findMany({
      where: { OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }] },
      orderBy: [{ created_at: 'desc' }, { driver_id: 'desc' }],
      take: 50,
      include: { driver: { select: { first_name: true, last_name: true } } },
    });
  }

  async block(actor_id: string, input: z.infer<typeof payout_block>) {
    return this.db.client.$transaction(async (tx) => {
      await require_active_admin(tx, actor_id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(720065)`;
      const { driver_id, blocked, reason, expires_at } = input;
      const expires = expires_at ? new Date(expires_at) : null;
      if (blocked && expires && expires <= new Date())
        throw new AppError(
          422,
          'PAYOUT_BLOCK_EXPIRY_INVALID',
          'Choose a future expiry date.',
        );
      const driver = await tx.user.findUnique({
        where: { id: driver_id },
        select: { role: true },
      });
      if (!driver || (blocked && driver.role !== 'DRIVER'))
        throw new AppError(404, 'DRIVER_NOT_FOUND', 'Driver not found.');
      if (blocked) {
        await tx.payoutDriverBlock.upsert({
          where: { driver_id },
          create: { driver_id, actor_id, reason, expires_at: expires },
          update: {
            actor_id,
            reason,
            expires_at: expires,
            created_at: new Date(),
          },
        });
      } else {
        await tx.payoutDriverBlock.deleteMany({ where: { driver_id } });
      }
      await create_user_log(tx, {
        actor_id,
        entity_type: 'User',
        entity_id: driver_id,
        action: blocked ? 'BLOCK_DRIVER_PAYOUT' : 'UNBLOCK_DRIVER_PAYOUT',
        after_data: input,
      });
      return { driver_id, blocked };
    });
  }
}

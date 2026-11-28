import { nextEntityId } from '../../database/entity-id.js';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../../core/error.js';
import { requireActiveAdmin } from '../../database/account-locks.js';
import { PostgresService } from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
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
  constructor(private readonly db: PostgresService) {}

  async report(id: string) {
    const {
      rows: [cycle],
    } = await this.db.query<{ cutoff_at: Date }>(
      'SELECT cutoff_at FROM payout_cycles WHERE id=$1',
      [id],
    );
    if (!cycle)
      throw new AppError(
        404,
        'PAYOUT_CYCLE_NOT_FOUND',
        'Payout cycle not found.',
      );
    const limit = 10000;
    const { rows } = await this.db.query<Record<string, string | null>>(
      `
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
      WHERE p.cycle_id = $1
      ORDER BY p.id, l.created_at, l.id
      LIMIT $2
    `,
      [id, limit + 1],
    );
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
      file_name: `payout-$1-${cycle.cutoff_at.toISOString().slice(0, 10)}.csv`,
      csv: [
        columns.join(','),
        ...rows.map((row) => columns.map((key) => csv(row[key])).join(',')),
      ].join('\r\n'),
    };
  }

  async edit(actor_id: string, id: string, input: z.infer<typeof payout_edit>) {
    return this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor_id);
      await tx.query('SELECT pg_advisory_xact_lock(720065)');
      const {
        rows: [payout],
      } = await tx.query<{
        id: string;
        cycle_id: string;
        status: string;
        cycle_status: string;
        cutoff_at: Date;
        user_id: string;
        amount_paise: string;
        exclusion_reason: string | null;
        updated_at: Date;
      }>(
        `SELECT p.id,p.cycle_id,p.status,p.amount_paise,p.exclusion_reason,p.updated_at,
        c.status AS cycle_status,c.cutoff_at,w.user_id
        FROM driver_payouts p JOIN payout_cycles c ON c.id=p.cycle_id
        JOIN wallets w ON w.id=p.wallet_id WHERE p.id=$1`,
        [id],
      );
      if (!payout)
        throw new AppError(404, 'PAYOUT_NOT_FOUND', 'Driver payout not found.');
      if (payout.updated_at.getTime() !== Date.parse(input.expected_updated_at))
        throw new AppError(
          409,
          'PAYOUT_CHANGED',
          'The payout changed. Reload before editing.',
        );
      if (
        payout.cycle_status !== 'DRAFT' ||
        !['DRAFT', 'EXCLUDED'].includes(payout.status)
      )
        throw new AppError(
          409,
          'PAYOUT_LOCKED',
          'Only draft payouts can be edited.',
        );
      let amount = BigInt(payout.amount_paise);
      let status = payout.status;
      let exclusion_reason = payout.exclusion_reason;
      if (input.action === 'exclude') {
        status = 'EXCLUDED';
        exclusion_reason = input.reason;
      } else if (input.action === 'include') {
        const {
          rows: [newer],
        } = await tx.query(
          `SELECT l.id FROM driver_payout_lines l JOIN driver_payouts p ON p.id=l.payout_id
            WHERE p.id<>$1 AND p.status NOT IN ('EXCLUDED','FAILED','REVERSED') AND EXISTS(
              SELECT 1 FROM driver_payout_lines own WHERE own.payout_id=$1 AND own.source_entry_id=l.source_entry_id
            ) LIMIT 1`,
          [payout.id],
        );
        if (newer)
          throw new AppError(
            409,
            'PAYOUT_EARNINGS_MOVED',
            'These earnings already belong to another cycle.',
          );
        const {
          rows: [block],
        } = await tx.query<{ expires_at: Date | null }>(
          'SELECT expires_at FROM payout_driver_blocks WHERE driver_id=$1',
          [payout.user_id],
        );
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
          const {
            rows: [ride],
          } = await tx.query(
            `SELECT r.id FROM rides r JOIN driver_profiles d ON d.id=r.driver_id
              WHERE r.id=$1 AND d.user_id=$2 AND r.status='COMPLETED' AND r.completed_at<=$3`,
            [input.ride_id, payout.user_id, payout.cutoff_at],
          );
          if (!ride)
            throw new AppError(
              422,
              'PAYOUT_RIDE_INVALID',
              'Select a completed ride for this driver before the cycle cutoff.',
            );
        }
        await tx.query(
          `INSERT INTO driver_payout_lines (id,payout_id,amount_paise,ride_id,reference,reason,actor_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            nextEntityId(),
            id,
            String(delta),
            input.ride_id ?? null,
            input.reference ?? null,
            input.reason,
            actor_id,
          ],
        );
      }
      const updated_at = new Date(
        Math.max(Date.now(), payout.updated_at.getTime() + 1),
      );
      await tx.query(
        'UPDATE driver_payouts SET amount_paise=$2,status=$3,exclusion_reason=$4,updated_at=$5 WHERE id=$1',
        [id, String(amount), status, exclusion_reason, updated_at],
      );
      await tx.query('UPDATE payout_cycles SET version=version+1 WHERE id=$1', [
        payout.cycle_id,
      ]);
      await insertUserLog(tx, {
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
        updated_at,
      };
    });
  }

  async blocks() {
    return (
      await this.db.query(
        `SELECT b.*,jsonb_build_object('first_name',u.first_name,'last_name',u.last_name) AS driver
        FROM payout_driver_blocks b JOIN users u ON u.id=b.driver_id
        WHERE b.expires_at IS NULL OR b.expires_at>statement_timestamp()
        ORDER BY b.created_at DESC,b.driver_id DESC LIMIT 50`,
      )
    ).rows;
  }

  async block(actor_id: string, input: z.infer<typeof payout_block>) {
    return this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor_id);
      await tx.query('SELECT pg_advisory_xact_lock(720065)');
      const { driver_id, blocked, reason, expires_at } = input;
      const expires = expires_at ? new Date(expires_at) : null;
      if (blocked && expires && expires <= new Date())
        throw new AppError(
          422,
          'PAYOUT_BLOCK_EXPIRY_INVALID',
          'Choose a future expiry date.',
        );
      const {
        rows: [driver],
      } = await tx.query<{ role: string }>(
        'SELECT role FROM users WHERE id=$1',
        [driver_id],
      );
      if (!driver || (blocked && driver.role !== 'DRIVER'))
        throw new AppError(404, 'DRIVER_NOT_FOUND', 'Driver not found.');
      if (blocked)
        await tx.query(
          `INSERT INTO payout_driver_blocks (driver_id,actor_id,reason,expires_at) VALUES ($1,$2,$3,$4)
            ON CONFLICT(driver_id) DO UPDATE SET actor_id=EXCLUDED.actor_id,reason=EXCLUDED.reason,
              expires_at=EXCLUDED.expires_at,created_at=clock_timestamp()`,
          [driver_id, actor_id, reason, expires],
        );
      else
        await tx.query('DELETE FROM payout_driver_blocks WHERE driver_id=$1', [
          driver_id,
        ]);
      await insertUserLog(tx, {
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

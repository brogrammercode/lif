import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import {
  requireActiveAccount,
  requireDriverParticipation,
  requireActiveAdmin,
} from '../../database/account-locks.js';
import { insertUserLog } from '../../database/user-log.js';
import { nextEntityId } from '../../database/entity-id.js';
import {
  financeTotalsSql,
  tripRowsSql,
  chargeRowsSql,
} from './sql/finance.sql.js';
import { AppError } from '../../core/error.js';
import {
  finance_range,
  finance_query,
  payout_request,
  payout_review,
} from './driver_account.type.js';
import { mask_payout, reveal_payout, seal_payout } from './payout_security.js';
import type { z } from 'zod';
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
const publicChange =
  'id,user_id,status,version,summary,rejection_reason,created_at,reviewed_at';
type Change = {
  id: string;
  user_id: string;
  status: string;
  version: number;
  summary: unknown;
  rejection_reason: string | null;
  created_at: Date;
  reviewed_at: Date | null;
};
type PrivateChange = Change & {
  details_ciphertext: string;
  request_key: string;
  reviewed_by_id: string | null;
};
type Application = {
  id: string;
  status: string;
  final_pdf_id: string | null;
  activated_at: Date | null;
};
type ApplicationField = {
  id: string;
  status: string;
  rejection_reason: string | null;
  definition: Record<string, unknown> | null;
  value: unknown;
};
type FinanceTotals = {
  completed_trips: number;
  unpriced_trips: number;
  charge_count: number;
  gross_fares: string;
  cash_received: string;
  upi_received: string;
  collection_pending: string;
  receipt_unrecorded: string;
  other_received: string;
  waived: string;
  provider_resolved: string;
  approved_charges_due: string;
  charges_received: string;
  charges_under_review: string;
};
@Injectable()
export class DriverAccountService {
  constructor(private readonly db: PostgresService) {}
  private async driver(tx: SqlClient, user_id: string) {
    const { rows } = await tx.query<{
      id: string;
      availability: string;
      verification_status: string;
    }>(
      'SELECT id,availability,verification_status FROM driver_profiles WHERE user_id=$1',
      [user_id],
    );
    if (!rows[0])
      throw new AppError(
        404,
        'DRIVER_PROFILE_REQUIRED',
        'This account has no driver profile.',
      );
    return rows[0];
  }
  private async lock(tx: SqlClient, user: string) {
    await tx.query('SELECT pg_advisory_xact_lock(720043,hashtext($1))', [user]);
  }
  async account(user_id: string) {
    return this.db.transaction(async (tx) => {
      const profile = await this.driver(tx, user_id);
      const appResult = await tx.query<Application>(
        'SELECT id,status,final_pdf_id,activated_at FROM partner_applications WHERE current_user_id=$1',
        [user_id],
      );
      const application = appResult.rows[0];
      const app = application
        ? {
            ...application,
            fields: (
              await tx.query<ApplicationField>(
                'SELECT id,status,rejection_reason,definition,value FROM partner_application_fields WHERE application_id=$1',
                [application.id],
              )
            ).rows,
          }
        : null;
      const changes = (
        await tx.query<Change>(
          `SELECT ${publicChange} FROM driver_payout_changes WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30`,
          [user_id],
        )
      ).rows;
      const approved =
        (
          await tx.query<Change>(
            `SELECT ${publicChange} FROM driver_payout_changes WHERE user_id=$1 AND status='APPROVED'
           ORDER BY reviewed_at DESC,id DESC LIMIT 1`,
            [user_id],
          )
        ).rows[0] ?? null;
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
    }, 'REPEATABLE READ');
  }
  async request(user: string, input: z.infer<typeof payout_request>) {
    return this.db.transaction(async (tx) => {
      await requireActiveAccount(tx, user);
      await this.lock(tx, user);
      await this.driver(tx, user);
      await requireDriverParticipation(tx, user);
      const previous = await tx.query<PrivateChange>(
        'SELECT * FROM driver_payout_changes WHERE user_id=$1 AND request_key=$2',
        [user, input.request_key],
      );
      const replay = previous.rows[0];
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
        const { details_ciphertext: _, ...publicRow } = replay;
        return publicRow;
      }
      const pending = await tx.query(
        "SELECT 1 FROM driver_payout_changes WHERE user_id=$1 AND status='PENDING' LIMIT 1",
        [user],
      );
      if (pending.rowCount)
        throw new AppError(
          409,
          'PAYOUT_CHANGE_PENDING',
          'Wait for the pending account review before submitting another change.',
        );
      const summary = mask_payout(input.details);
      const saved = await tx.query<Change>(
        `INSERT INTO driver_payout_changes (id,user_id,request_key,details_ciphertext,summary)
          VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING ${publicChange}`,
        [
          nextEntityId(),
          user,
          input.request_key,
          seal_payout(input.details),
          JSON.stringify(summary),
        ],
      );
      const row = saved.rows[0]!;
      await insertUserLog(tx, {
        actor_id: user,
        entity_type: 'DriverPayoutChange',
        entity_id: row.id,
        action: 'REQUEST_PAYOUT_CHANGE',
        after_data: summary,
      });
      return row;
    });
  }

  private async privateChange(tx: SqlClient, id: string) {
    const result = await tx.query<
      Pick<PrivateChange, 'user_id' | 'details_ciphertext'>
    >(
      'SELECT user_id,details_ciphertext FROM driver_payout_changes WHERE id=$1',
      [id],
    );
    if (!result.rows[0])
      throw new AppError(
        404,
        'PAYOUT_CHANGE_NOT_FOUND',
        'This account change was not found.',
      );
    return result.rows[0];
  }

  async review(
    actor: string,
    id: string,
    input: z.infer<typeof payout_review>,
  ) {
    return this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor);
      const before = await this.privateChange(tx, id);
      await requireActiveAccount(tx, before.user_id);
      await this.lock(tx, before.user_id);
      await requireDriverParticipation(tx, before.user_id);
      if (input.status === 'APPROVED') read_payout(before.details_ciphertext);
      const claimed = await tx.query<Change>(
        `UPDATE driver_payout_changes SET status=$2,version=version+1,reviewed_by_id=$3,
          reviewed_at=clock_timestamp(),rejection_reason=$4
          WHERE id=$1 AND status='PENDING' AND version=$5 RETURNING ${publicChange}`,
        [id, input.status, actor, input.note, input.expected_version],
      );
      if (!claimed.rows[0])
        throw new AppError(
          409,
          'PAYOUT_CHANGE_CONFLICT',
          'This request changed. Reload before reviewing.',
        );
      await insertUserLog(tx, {
        actor_id: actor,
        entity_type: 'DriverPayoutChange',
        entity_id: id,
        action: 'REVIEW_PAYOUT_CHANGE',
        after_data: { status: input.status, note: input.note },
      });
      await tx.query(
        `INSERT INTO notifications (id,user_id,type,title,body,data,updated_at)
          VALUES ($1,$2,'SYSTEM',$3,$4,'{"driver_account":true}'::jsonb,clock_timestamp())`,
        [
          nextEntityId(),
          before.user_id,
          'Payout account ' + input.status.toLowerCase(),
          input.note,
        ],
      );
      return claimed.rows[0];
    });
  }

  async reveal(actor: string, id: string) {
    return this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor);
      const row = await this.privateChange(tx, id);
      await insertUserLog(tx, {
        actor_id: actor,
        entity_type: 'DriverPayoutChange',
        entity_id: id,
        action: 'VIEW_PRIVATE_PAYOUT_DETAILS',
      });
      return { id, details: read_payout(row.details_ciphertext) };
    });
  }

  async finance(user: string, input: z.infer<typeof finance_query>) {
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
    return this.db.transaction(async (tx) => {
      const driver = await this.driver(tx, user);
      const filters = [driver.id, range.from, range.until];
      const totals = await tx.query<FinanceTotals>(financeTotalsSql, filters);
      const { charge_count, ...summary } = totals.rows[0]!;
      const { rows } = await tx.query(
        input.section === 'trips' ? tripRowsSql : chargeRowsSql,
        [...filters, (input.page - 1) * 20],
      );
      return {
        from: range.from.toISOString().slice(0, 10),
        to: new Date(range.until.getTime() - 86400000)
          .toISOString()
          .slice(0, 10),
        as_of: new Date(),
        summary: { ...summary, commission: '0.00', platform_payout: '0.00' },
        rows,
        total:
          input.section === 'trips' ? summary.completed_trips : charge_count,
        page: input.page,
        page_size: 20,
        section: input.section,
      };
    }, 'REPEATABLE READ');
  }
}

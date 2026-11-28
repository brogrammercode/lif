import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import {
  requireActiveAccount,
  requireActiveAdmin,
} from '../../database/account-locks.js';
import { nextEntityId } from '../../database/entity-id.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import { AppError } from '../../core/error.js';
import { findDriverActiveRide } from '../driver/sql/driver-profile.sql.js';
import type { AssetInput } from './dto/partner-program.dto.js';
import type {
  exit_create_input,
  exit_review_input,
  exit_list_input,
} from './dto/partner-exit.dto.js';
import {
  exitAdminFields,
  exitAdminFilter,
  exitAdminFrom,
  exitById,
  exitColumns,
  exitHistory,
  exitMine,
  exitOwner,
} from './sql/partner-exit.sql.js';

type ExitRow = {
  id: string;
  application_id: string;
  status: string;
  version: number;
  settlement_pdf_id: string | null;
};

const options = { checkoutMs: 10000, statementMs: 30000 };
const changed = () =>
  new AppError(
    409,
    'EXIT_REQUEST_CHANGED',
    'This exit request changed. Refresh it before continuing.',
  );
const notFound = () =>
  new AppError(404, 'EXIT_NOT_FOUND', 'Exit request not found.');

async function lockPartner(tx: SqlClient, userId: string) {
  await requireActiveAccount(tx, userId);
  await tx.query('SELECT pg_advisory_xact_lock(720061,hashtext($1))', [userId]);
}

async function findExitOwner(tx: SqlClient, id: string) {
  const {
    rows: [row],
  } = await tx.query<ExitRow & { user_id: string }>(exitOwner, [id]);
  return row;
}

@Injectable()
export class PartnerExitService {
  constructor(private readonly database: PostgresService) {}

  async mine(user_id: string) {
    return (await this.database.query(exitMine, [user_id])).rows[0] ?? null;
  }

  async history(user_id: string, after?: string) {
    const { rows } = await this.database.query<{ id: string }>(exitHistory, [
      user_id,
      after ?? null,
    ]);
    const items = rows.slice(0, 20);
    return { items, next_cursor: rows.length > 20 ? items.at(-1)!.id : null };
  }

  async create(
    actor_id: string,
    input: z.infer<typeof exit_create_input>,
    application_id?: string,
  ) {
    return this.database.transaction(
      async (tx) => {
        if (application_id) await requireActiveAdmin(tx, actor_id);
        else await requireActiveAccount(tx, actor_id);
        const {
          rows: [app],
        } = await tx.query<{ id: string; user_id: string }>(
          application_id
            ? 'SELECT id,user_id FROM partner_applications WHERE id=$1'
            : 'SELECT id,user_id FROM partner_applications WHERE current_user_id=$1',
          [application_id ?? actor_id],
        );
        if (!app)
          throw new AppError(
            404,
            'APPLICATION_NOT_FOUND',
            'Partner application not found.',
          );
        await lockPartner(tx, app.user_id);
        const {
          rows: [current],
        } = await tx.query<{ status: string }>(
          'SELECT status FROM partner_applications WHERE id=$1',
          [app.id],
        );
        if (current?.status !== 'ACTIVATED')
          throw new AppError(
            409,
            'PARTNER_NOT_ACTIVE',
            'Only an activated driver can request an exit.',
          );

        const {
          rows: [before],
        } = await tx.query<ExitRow>(
          `SELECT ${exitColumns} FROM partner_exit_requests e WHERE e.application_id=$1`,
          [app.id],
        );
        if (
          before
            ? before.status !== 'REJECTED' || before.version !== input.version
            : input.version !== 0
        )
          throw changed();
        const {
          rows: [row],
        } = before
          ? await tx.query<ExitRow>(
              `UPDATE partner_exit_requests e SET reason=$2,status='REQUESTED',rejection_reason=NULL,
              version=version+1,updated_at=clock_timestamp()
              WHERE e.id=$1 AND e.version=$3 RETURNING ${exitColumns}`,
              [before.id, input.reason, input.version],
            )
          : await tx.query<ExitRow>(
              `INSERT INTO partner_exit_requests AS e (id,application_id,reason,updated_at)
              VALUES ($1,$2,$3,clock_timestamp()) RETURNING ${exitColumns}`,
              [nextEntityId(), app.id, input.reason],
            );
        if (!row) throw changed();
        await insertUserLog(tx, {
          actor_id,
          entity_type: 'PartnerExitRequest',
          entity_id: row.id,
          action: before ? 'RESUBMIT_PARTNER_EXIT' : 'REQUEST_PARTNER_EXIT',
          before_data: before,
          after_data: row,
        });
        return row;
      },
      'READ COMMITTED',
      options,
    );
  }

  async list(input: z.infer<typeof exit_list_input>) {
    return this.database.transaction(async (tx) => {
      const params = [input.status, input.query];
      const {
        rows: [count],
      } = await tx.query<{ total: number }>(
        `SELECT count(*)::int AS total ${exitAdminFrom} ${exitAdminFilter}`,
        params,
      );
      const total = count?.total ?? 0;
      const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
      const { rows } = await tx.query(
        `SELECT ${exitAdminFields} ${exitAdminFrom} ${exitAdminFilter}
          ORDER BY e.created_at DESC,e.id DESC LIMIT 20 OFFSET $3`,
        [...params, (page - 1) * 20],
      );
      return { rows, total, page, page_size: 20 };
    }, 'REPEATABLE READ');
  }

  async detail(id: string) {
    const {
      rows: [row],
    } = await this.database.query(
      `SELECT ${exitAdminFields} ${exitAdminFrom} WHERE e.id=$1`,
      [id],
    );
    if (!row) throw notFound();
    return row;
  }

  async upload(actor_id: string, id: string, input: AssetInput) {
    const match = /^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      input.data_url,
    );
    const bytes = match ? Buffer.from(match[1]!, 'base64') : Buffer.alloc(0);
    if (
      !match ||
      !bytes.length ||
      bytes.length > 3_000_000 ||
      bytes.toString('base64') !== match[1] ||
      !/\.pdf$/i.test(input.file_name) ||
      bytes.subarray(0, 5).toString() !== '%PDF-'
    )
      throw new AppError(422, 'INVALID_PDF', 'Choose a valid PDF up to 3 MB.');
    const digest = createHash('sha256').update(bytes).digest('hex');

    return this.database.transaction(
      async (tx) => {
        await requireActiveAdmin(tx, actor_id);
        const exit = await findExitOwner(tx, id);
        if (!exit) throw notFound();
        await lockPartner(tx, exit.user_id);
        const {
          rows: [current],
        } = await tx.query<ExitRow>(exitById, [id]);
        if (!current || !['REQUESTED', 'REVIEWING'].includes(current.status))
          throw changed();

        const {
          rows: [duplicate],
        } = await tx.query<{ id: string }>(
          `SELECT id FROM partner_assets WHERE owner_id=$1 AND purpose='EXIT_PDF' AND field_id=$2
          AND sha256=$3 AND file_name=$4 LIMIT 1`,
          [exit.user_id, id, digest, input.file_name],
        );
        if (duplicate) return duplicate;
        const {
          rows: [quota],
        } = await tx.query<{ bytes: string; total: number }>(
          `SELECT COALESCE(sum(size),0)::text AS bytes,count(*)::int AS total
          FROM partner_assets WHERE owner_id=$1`,
          [exit.user_id],
        );
        if (
          Number(quota?.bytes ?? 0) + bytes.length > 100_000_000 ||
          (quota?.total ?? 0) >= 2000
        )
          throw new AppError(
            422,
            'UPLOAD_LIMIT',
            'This account has reached its upload allowance.',
          );

        const asset_id = nextEntityId();
        await tx.query(
          `INSERT INTO partner_assets (id,owner_id,purpose,field_id,file_name,mime_type,size,content,sha256,updated_at)
          VALUES ($1,$2,'EXIT_PDF',$3,$4,'application/pdf',$5,$6,$7,clock_timestamp())`,
          [
            asset_id,
            exit.user_id,
            id,
            input.file_name,
            bytes.length,
            bytes,
            digest,
          ],
        );
        await insertUserLog(tx, {
          actor_id,
          entity_type: 'PartnerExitRequest',
          entity_id: id,
          action: 'UPLOAD_EXIT_PDF',
          after_data: { asset_id },
        });
        return { id: asset_id };
      },
      'READ COMMITTED',
      options,
    );
  }

  async review(
    actor_id: string,
    id: string,
    input: z.infer<typeof exit_review_input>,
  ) {
    return this.database.transaction(
      async (tx) => {
        await requireActiveAdmin(tx, actor_id);
        const initial = await findExitOwner(tx, id);
        if (!initial) throw notFound();
        const user_id = initial.user_id;
        await lockPartner(tx, user_id);
        await tx.query('SELECT pg_advisory_xact_lock(720043,hashtext($1))', [
          user_id,
        ]);
        const {
          rows: [before],
        } = await tx.query<ExitRow>(exitById, [id]);
        if (
          !before ||
          before.version !== input.version ||
          !['REQUESTED', 'REVIEWING'].includes(before.status)
        )
          throw changed();

        if (input.status === 'COMPLETED') {
          const {
            rows: [app],
          } = await tx.query<{ status: string }>(
            'SELECT status FROM partner_applications WHERE id=$1',
            [initial.application_id],
          );
          if (app?.status !== 'ACTIVATED') throw changed();
          const pdf = await tx.query(
            `SELECT id FROM partner_assets WHERE id=$1 AND owner_id=$2 AND field_id=$3
            AND purpose='EXIT_PDF' AND mime_type='application/pdf'`,
            [input.settlement_pdf_id, user_id, id],
          );
          if (!pdf.rowCount)
            throw new AppError(
              422,
              'EXIT_PDF_REQUIRED',
              'Upload the settlement PDF for this exit request.',
            );
          const {
            rows: [profile],
          } = await tx.query<{ id: string }>(
            'SELECT id FROM driver_profiles WHERE user_id=$1',
            [user_id],
          );
          if (
            profile &&
            (await tx.query(findDriverActiveRide, [profile.id])).rowCount
          )
            throw new AppError(
              409,
              'DRIVER_ON_TRIP',
              'Complete or reassign the current ride before finalizing the exit.',
            );
          if (profile) {
            await tx.query(
              `UPDATE driver_profiles SET availability='SUSPENDED',verification_status='EXPIRED',
              updated_at=clock_timestamp() WHERE id=$1`,
              [profile.id],
            );
            await tx.query(
              `UPDATE ride_offers SET status='CANCELLED',responded_at=statement_timestamp(),updated_at=clock_timestamp()
              WHERE driver_id=$1 AND status='SENT'`,
              [profile.id],
            );
          }
          await tx.query(
            `UPDATE partner_applications SET status='EXITED',version=version+1,activation_hash=NULL,
            activation_salt=NULL,activation_ciphertext=NULL,updated_at=clock_timestamp() WHERE id=$1`,
            [initial.application_id],
          );
          await tx.query(
            `UPDATE users SET role=CASE WHEN role='DRIVER' THEN 'RIDER' ELSE role END,
            partner_activated_at=NULL,updated_at=clock_timestamp() WHERE id=$1`,
            [user_id],
          );
          await tx.query(
            `INSERT INTO partner_deliveries (id,application_id,channel,updated_at)
            VALUES ($1,$2,'EXIT_EMAIL',clock_timestamp())
            ON CONFLICT (application_id,channel) DO UPDATE SET status='PENDING',
              last_error=NULL,claimed_at=NULL,updated_at=clock_timestamp()`,
            [nextEntityId(), initial.application_id],
          );
        }

        const completed = input.status === 'COMPLETED';
        const {
          rows: [row],
        } = await tx.query<ExitRow>(
          `UPDATE partner_exit_requests e SET status=$2,admin_notes=$3,rejection_reason=$4,dues_amount=$5,
          dues_direction=$6,reviewed_by_id=$7,version=version+1,
          settlement_pdf_id=CASE WHEN $8 THEN $9 ELSE settlement_pdf_id END,
          completed_at=CASE WHEN $8 THEN statement_timestamp() ELSE completed_at END,
          updated_at=clock_timestamp() WHERE e.id=$1 AND e.version=$10 RETURNING ${exitColumns}`,
          [
            id,
            input.status,
            input.admin_notes || null,
            input.status === 'REJECTED' ? input.rejection_reason : null,
            input.dues_amount,
            input.dues_direction,
            actor_id,
            completed,
            input.settlement_pdf_id ?? null,
            input.version,
          ],
        );
        if (!row) throw changed();
        await insertUserLog(tx, {
          actor_id,
          entity_type: 'PartnerExitRequest',
          entity_id: id,
          action: completed ? 'COMPLETE_PARTNER_EXIT' : 'REVIEW_PARTNER_EXIT',
          before_data: before,
          after_data: row,
        });
        const title = completed
          ? 'Partner exit completed'
          : 'Partner exit request updated';
        const body = completed
          ? 'Your settlement PDF is ready. You can continue using 1More as a rider.'
          : input.status === 'REJECTED'
            ? input.rejection_reason
            : 'Your exit request is being reviewed.';
        await tx.query(
          `INSERT INTO notifications (id,user_id,type,title,body,data,updated_at)
          VALUES ($1,$2,'ACCOUNT',$3,$4,$5::jsonb,clock_timestamp())`,
          [
            nextEntityId(),
            user_id,
            title,
            body,
            JSON.stringify({
              route: '/driver/exit',
              exit_request_id: id,
              exit_completed: completed,
            }),
          ],
        );
        return row;
      },
      'READ COMMITTED',
      options,
    );
  }

  async shared(actor_id: string, id: string) {
    return this.database.transaction(
      async (tx) => {
        await requireActiveAdmin(tx, actor_id);
        const row = await findExitOwner(tx, id);
        if (!row || row.status !== 'COMPLETED' || !row.settlement_pdf_id)
          throw new AppError(
            409,
            'EXIT_PDF_NOT_READY',
            'Complete the exit before recording manual sharing.',
          );
        await lockPartner(tx, row.user_id);
        const {
          rows: [updated],
        } = await tx.query(
          `UPDATE partner_exit_requests e SET manually_shared_at=statement_timestamp(),updated_at=clock_timestamp()
          WHERE e.id=$1 RETURNING ${exitColumns}`,
          [id],
        );
        await insertUserLog(tx, {
          actor_id,
          entity_type: 'PartnerExitRequest',
          entity_id: id,
          action: 'MANUALLY_SHARE_EXIT_PDF',
        });
        return updated;
      },
      'READ COMMITTED',
      options,
    );
  }

  async retry_email(actor_id: string, id: string) {
    return this.database.transaction(
      async (tx) => {
        await requireActiveAdmin(tx, actor_id);
        const row = await findExitOwner(tx, id);
        if (!row || row.status !== 'COMPLETED' || !row.settlement_pdf_id)
          throw new AppError(
            409,
            'EXIT_PDF_NOT_READY',
            'Complete the exit before sending its settlement PDF.',
          );
        await lockPartner(tx, row.user_id);
        await insertUserLog(tx, {
          actor_id,
          entity_type: 'PartnerExitRequest',
          entity_id: id,
          action: 'RETRY_PARTNER_EXIT_EMAIL',
        });
        return row.application_id;
      },
      'READ COMMITTED',
      options,
    );
  }
}

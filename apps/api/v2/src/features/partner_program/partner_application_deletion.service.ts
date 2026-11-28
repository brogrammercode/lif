import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ACCOUNT_LIFECYCLE_LOCK,
  requireActiveAdmin,
} from '../../database/account-locks.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import { AppError } from '../../core/error.js';

export const application_delete_input = z
  .object({
    version: z.number().int().positive(),
    confirmation: z.string().trim().min(1).max(320),
  })
  .strict();

const purposes = ['APPLICATION_DOCUMENT', 'APPLICATION_SELFIE', 'FINAL_PDF'];
const notices = `(data->>'application_id'=$1 OR
  (data->>'application_id' IS NULL AND user_id=$2 AND type='ACCOUNT' AND channel='IN_APP'
    AND created_at >= $3 AND data->>'route'='/partner-program'))`;
const missing = () =>
  new AppError(
    404,
    'APPLICATION_NOT_FOUND',
    'Application not found. Refresh the list.',
  );

type Application = {
  id: string;
  user_id: string;
  version: number;
  status: string;
  created_at: Date;
  contact_email: string;
  activated_at: Date | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  partner_activated_at: Date | null;
  has_exit: boolean;
  fields: number;
  confirmations: number;
  deliveries: number;
  sending_pdf: number;
};

@Injectable()
export class PartnerApplicationDeletionService {
  constructor(private readonly database: PostgresService) {}

  private async snapshot(tx: SqlClient, id: string) {
    const found = await tx.query<Application>(
      `SELECT a.id,a.user_id,a.version,a.status,a.created_at,a.contact_email,a.activated_at,
        u.first_name,u.last_name,u.role,u.partner_activated_at,
        EXISTS(SELECT 1 FROM partner_exit_requests e WHERE e.application_id=a.id) AS has_exit,
        (SELECT count(*)::int FROM partner_application_fields f WHERE f.application_id=a.id) AS fields,
        (SELECT count(*)::int FROM partner_confirmations f WHERE f.application_id=a.id) AS confirmations,
        (SELECT count(*)::int FROM partner_deliveries d WHERE d.application_id=a.id) AS deliveries,
        (SELECT count(*)::int FROM partner_deliveries d WHERE d.application_id=a.id AND d.status='SENDING') AS sending_pdf
      FROM partner_applications a JOIN users u ON u.id=a.user_id WHERE a.id=$1`,
      [id],
    );
    const app = found.rows[0];
    if (!app) throw missing();
    const noticeFilter = [id, app.user_id, app.created_at];
    const upload = await tx.query<{ total: number; bytes: number }>(
      `SELECT count(*)::int AS total,COALESCE(sum(size),0)::double precision AS bytes
       FROM partner_assets WHERE application_id=$1 AND owner_id=$2 AND purpose=ANY($3::text[])`,
      [id, app.user_id, purposes],
    );
    const notifications = await tx.query<{
      total: number;
      sending_mail: number;
    }>(
      `SELECT count(*)::int AS total,
        count(*) FILTER(WHERE channel='EMAIL' AND sent_at IS NULL AND data->>'state'='SENDING')::int AS sending_mail
      FROM notifications WHERE ${notices}`,
      noticeFilter,
    );
    const activated =
      !!app.activated_at ||
      !!app.partner_activated_at ||
      app.role === 'DRIVER' ||
      ['ACTIVATED', 'EXITED'].includes(app.status) ||
      app.has_exit;
    const sending =
      app.sending_pdf > 0 || notifications.rows[0]!.sending_mail > 0;
    return {
      app,
      noticeFilter,
      preview: {
        id,
        version: app.version,
        status: app.status,
        contact_email: app.contact_email,
        name:
          [app.first_name, app.last_name].filter(Boolean).join(' ') ||
          app.contact_email,
        allowed: !activated && !sending,
        blocked_reason: activated
          ? 'Applications can be deleted only before driver activation. Activated or exited driver history must be retained.'
          : sending
            ? 'An email delivery is in progress. Wait for it to finish, then refresh this preview.'
            : null,
        counts: {
          fields: app.fields,
          confirmations: app.confirmations,
          deliveries: app.deliveries,
          uploads: upload.rows[0]!.total,
          upload_bytes: upload.rows[0]!.bytes,
          notifications: notifications.rows[0]!.total,
        },
      },
    };
  }

  async preview(actor: string, id: string) {
    return this.database.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor);
      return (await this.snapshot(tx, id)).preview;
    }, 'REPEATABLE READ');
  }

  async remove(
    actor: string,
    id: string,
    input: z.output<typeof application_delete_input>,
  ) {
    return this.database.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor);
      const source = await tx.query<{ user_id: string; created_at: Date }>(
        'SELECT user_id,created_at FROM partner_applications WHERE id=$1',
        [id],
      );
      const initial = source.rows[0];
      if (!initial) throw missing();
      // Match onboarding lock order and serialize against active delivery claims.
      await tx.query(
        'SELECT pg_advisory_xact_lock_shared($1::integer,hashtext($2))',
        [ACCOUNT_LIFECYCLE_LOCK, initial.user_id],
      );
      await tx.query('SELECT pg_advisory_xact_lock(720061,hashtext($1))', [
        initial.user_id,
      ]);
      await tx.query(
        'SELECT id FROM partner_deliveries WHERE application_id=$1 ORDER BY id FOR UPDATE',
        [id],
      );
      await tx.query(
        `SELECT id FROM notifications WHERE ${notices} ORDER BY id FOR UPDATE`,
        [id, initial.user_id, initial.created_at],
      );
      const { app, preview, noticeFilter } = await this.snapshot(tx, id);
      if (app.version !== input.version)
        throw new AppError(
          409,
          'APPLICATION_CHANGED',
          'This application changed. Reload the deletion preview before continuing.',
        );
      if (!preview.allowed)
        throw new AppError(
          409,
          'APPLICATION_DELETE_BLOCKED',
          preview.blocked_reason!,
        );
      if (
        input.confirmation.toLowerCase() !==
        app.contact_email.trim().toLowerCase()
      )
        throw new AppError(
          422,
          'CONFIRMATION_REQUIRED',
          'Enter the applicant email exactly as displayed to confirm deletion.',
        );
      await tx.query(
        `DELETE FROM notifications WHERE ${notices}`,
        noticeFilter,
      );
      await tx.query(
        'DELETE FROM partner_assets WHERE application_id=$1 AND owner_id=$2 AND purpose=ANY($3::text[])',
        [id, app.user_id, purposes],
      );
      // Fields, confirmation and delivery records use the application FK cascade.
      await tx.query('DELETE FROM partner_applications WHERE id=$1', [id]);
      await tx.query(
        `UPDATE partner_applications SET current_user_id=$1,updated_at=clock_timestamp()
        WHERE id=(SELECT id FROM partner_applications WHERE user_id=$1 AND status='EXITED'
          AND current_user_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 1)`,
        [app.user_id],
      );
      await insertUserLog(tx, {
        actor_id: actor,
        entity_type: 'PartnerApplication',
        entity_id: id,
        action: 'DELETE_PARTNER_APPLICATION',
        before_data: {
          user_id: app.user_id,
          status: app.status,
          version: app.version,
        },
        after_data: { deleted: preview.counts },
      });
      return { id, deleted: preview.counts };
    });
  }
}

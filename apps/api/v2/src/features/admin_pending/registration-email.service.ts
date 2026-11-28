import { Injectable } from '@nestjs/common';
import { AppError } from '../../core/error.js';
import { config } from '../../core/config.js';
import { requireActiveAdmin } from '../../database/account-locks.js';
import { PostgresService } from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import {
  NEW_USER_EMAIL_TITLE,
  schedule_new_user_emails,
} from '../../infra/mail/new_user_email.js';
import type { RegistrationEmailQuery } from './dto/registration-email.dto.js';

type Delivery = {
  id: string;
  created_at: Date;
  updated_at: Date;
  sent_at: Date | null;
  data: Record<string, unknown>;
};

const scope = `channel = 'EMAIL' AND title = $1 AND data->>'kind' = 'ADMIN_NEW_USER_EMAIL'
  AND ($2::boolean = false OR (sent_at IS NULL AND (data->>'state' = 'FAILED' OR updated_at < $3)))`;
const columns = 'id, created_at, updated_at, sent_at, data';
const staleMs = 300_000;

@Injectable()
export class RegistrationEmailService {
  constructor(private readonly db: PostgresService) {}

  list(input: RegistrationEmailQuery) {
    const values = [
      NEW_USER_EMAIL_TITLE,
      input.status === 'pending',
      new Date(Date.now() - staleMs),
    ];
    return this.db.transaction(async (tx) => {
      const total = (
        await tx.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM notifications WHERE ${scope}`,
          values,
        )
      ).rows[0]!.total;
      const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
      const { rows } = await tx.query<Delivery>(
        `SELECT ${columns} FROM notifications WHERE ${scope}
        ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET $4`,
        [...values, (page - 1) * 20],
      );
      return {
        total,
        page,
        page_size: 20,
        items: rows.map(({ data, ...row }) => {
          const details =
            data.details &&
            typeof data.details === 'object' &&
            !Array.isArray(data.details)
              ? (data.details as Record<string, unknown>)
              : {};
          return {
            ...row,
            recipient: String(data.recipient_email),
            status: String(data.state),
            attempts: Number(data.attempts ?? 0),
            last_error: data.last_error ?? null,
            user: {
              id: String(details.id),
              name: String(details.name ?? ''),
              email: details.email ?? null,
            },
          };
        }),
        smtp_configured: !!config.MAIL_USER && !!config.GOOGLE_APP_PASSWORD,
      };
    }, 'REPEATABLE READ');
  }

  async retry(actorId: string, id: string) {
    await this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, actorId);
      const row = (
        await tx.query<Delivery>(
          `SELECT ${columns} FROM notifications
        WHERE id = $1 AND channel = 'EMAIL' AND title = $2 AND sent_at IS NULL`,
          [id, NEW_USER_EMAIL_TITLE],
        )
      ).rows[0];
      const data = row?.data;
      if (
        !row ||
        data?.kind !== 'ADMIN_NEW_USER_EMAIL' ||
        (data.state === 'SENDING' &&
          row.updated_at.getTime() > Date.now() - staleMs)
      )
        throw new AppError(
          409,
          'EMAIL_NOT_RETRYABLE',
          'This email was sent or is still being delivered. Refresh its status.',
        );
      const updated = await tx.query(
        `UPDATE notifications
        SET data = $4::jsonb, updated_at = clock_timestamp()
        WHERE id = $1 AND updated_at = $2 AND sent_at IS NULL AND data = $3::jsonb`,
        [
          id,
          row.updated_at,
          JSON.stringify(data),
          JSON.stringify({ ...data, state: 'PENDING', last_error: null }),
        ],
      );
      if (!updated.rowCount)
        throw new AppError(
          409,
          'EMAIL_CHANGED',
          'This delivery changed. Refresh and try again.',
        );
      await insertUserLog(tx, {
        actor_id: actorId,
        entity_type: 'Notification',
        entity_id: id,
        action: 'RETRY_REGISTRATION_EMAIL',
        after_data: { queued: true },
      });
    });
    schedule_new_user_emails(this.db);
    return { queued: 1 };
  }
}

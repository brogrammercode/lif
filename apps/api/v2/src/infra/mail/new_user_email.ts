import { randomUUID } from 'node:crypto';
import { smtp_transport, smtp_failure } from './smtp.js';
import { PARTNER_EMAIL_TITLE } from './partner_email.js';
import { waitUntil } from '@vercel/functions';
import { config } from '../../core/config.js';
import type { SqlClient } from '../../database/postgres.service.js';
import {
  pendingAccountEmails,
  claimAccountEmail,
  finishAccountEmail,
  activePartnerEmailSource,
  accountEmailRecipient,
} from './account-email.sql.js';
import {
  new_user_email,
  type NewUserEmailDetails,
} from './new_user_email.template.js';

export const NEW_USER_EMAIL_TITLE = 'New 1More user registered';
const KIND = 'ADMIN_NEW_USER_EMAIL';
const RETRY_MS = 5 * 60 * 1000;
// Email delivery records stay out of the mobile notification feed, including
// after an administrator's access has been revoked.
export const visibleNotificationExcludedTitles = [
  NEW_USER_EMAIL_TITLE,
  PARTNER_EMAIL_TITLE,
];

type EmailAccount = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_e164: string | null;
  role: string;
  status: string;
  created_at: Date;
};

function newUserNotifications(
  admins: { id: string; email: string | null }[],
  user: EmailAccount,
  source: string,
) {
  const seen = new Set<string>();
  const details: NewUserEmailDetails = {
    id: user.id,
    name: [user.first_name, user.last_name].filter(Boolean).join(' '),
    email: user.email,
    phone: user.phone_e164,
    role: user.role,
    status: user.status,
    created_at: user.created_at.toISOString(),
    source,
  };
  return admins.flatMap((admin) => {
    const email = admin.email?.trim().toLowerCase();
    if (!email || seen.has(email)) return [];
    seen.add(email);
    return [
      {
        id: randomUUID(),
        user_id: admin.id,
        type: 'SYSTEM' as const,
        channel: 'EMAIL' as const,
        title: NEW_USER_EMAIL_TITLE,
        body: `New account ${user.id}`,
        data: {
          kind: KIND,
          state: 'PENDING',
          attempts: 0,
          recipient_email: email,
          details,
        },
      },
    ];
  });
}

export async function queueNewUserEmailsSql(
  tx: SqlClient,
  user: EmailAccount,
  source: string,
) {
  const { rows } = await tx.query<{ id: string; email: string }>(
    `SELECT id,email FROM users WHERE role='ADMIN' AND status='ACTIVE'
      AND deleted_at IS NULL AND email IS NOT NULL AND id<>$1 ORDER BY id`,
    [user.id],
  );
  const pending = newUserNotifications(rows, user, source);
  if (pending.length)
    await tx.query(
      `INSERT INTO notifications (id,user_id,type,channel,title,body,data,updated_at)
      SELECT id,user_id,'SYSTEM','EMAIL',title,body,data,clock_timestamp()
      FROM jsonb_to_recordset($1::jsonb) AS r(id text,user_id text,title text,body text,data jsonb)`,
      [JSON.stringify(pending)],
    );
}
// Delivery uses a conditional claim. SMTP runs after the database write commits.
export async function deliver_new_user_emails(
  db: SqlClient,
  on_batch?: (size: number) => void,
) {
  if (!config.MAIL_USER || !config.GOOGLE_APP_PASSWORD) {
    console.warn({
      event: 'SMTP_NOT_CONFIGURED',
      message:
        'Queued emails await MAIL_USER and GOOGLE_APP_PASSWORD in this deployment.',
    });
  }
  const pending = await pendingAccountEmails(
    db,
    visibleNotificationExcludedTitles,
    new Date(Date.now() - RETRY_MS),
  );
  on_batch?.(pending.length);
  let mailer: ReturnType<typeof smtp_transport> | undefined;
  let sent = 0;
  try {
    for (let offset = 0; offset < pending.length; offset += 3) {
      const results = await Promise.allSettled(
        pending.slice(offset, offset + 3).map(async (row) => {
          const data = row.data;
          const claim = randomUUID();
          const claimedData = {
            ...data,
            state: 'SENDING',
            claim,
            attempts: Number(data.attempts ?? 0) + 1,
          };
          if (!(await claimAccountEmail(db, row, claimedData))) return;
          const finish = (
            state: string,
            last_error: string | null,
            sentAt?: Date,
          ) =>
            finishAccountEmail(
              db,
              row.id,
              claim,
              { ...claimedData, state, last_error },
              sentAt,
            );
          try {
            const partner = data.kind === 'PARTNER_LIFECYCLE_EMAIL';
            const applicant = partner && data.recipient_role === 'APPLICANT';
            const application = String(data.application_id);
            if (
              partner &&
              !(await activePartnerEmailSource(
                db,
                application,
                data.expected_status,
              ))
            ) {
              await finish(
                'SKIPPED',
                'This workflow moved forward or its recipient is no longer active.',
                new Date(),
              );
              return;
            }
            const recipient = await accountEmailRecipient(
              db,
              row.user_id,
              String(data.recipient_email),
              applicant ? application : undefined,
            );
            if (!recipient || (!applicant && !recipient.email)) {
              await finish(
                'SKIPPED',
                'Recipient no longer has active admin access at this email.',
                new Date(),
              );
              return;
            }
            const message = partner
              ? { subject: String(data.subject), text: String(data.text) }
              : new_user_email(
                  data.details as NewUserEmailDetails,
                  config.ADMIN_NOTIFICATION_ORIGIN,
                );
            if (!config.MAIL_USER || !config.GOOGLE_APP_PASSWORD)
              throw new Error('SMTP_NOT_CONFIGURED');
            mailer ??= smtp_transport();
            const result = await mailer.sendMail({
              from: { name: '1More Admin', address: config.MAIL_USER },
              to: applicant ? String(data.recipient_email) : recipient.email!,
              ...message,
              messageId: `<new-user-${row.id}@${config.MAIL_USER.split('@')[1]}>`,
            });
            if (!result.accepted?.length)
              throw new Error('SMTP_RECIPIENT_NOT_ACCEPTED');
            await finish('SENT', null, new Date());
            sent++;
          } catch (error) {
            await finish('FAILED', smtp_failure(error));
            console.warn({
              event:
                data.kind === 'PARTNER_LIFECYCLE_EMAIL'
                  ? 'PARTNER_LIFECYCLE_EMAIL_FAILED'
                  : 'ADMIN_NEW_USER_EMAIL_FAILED',
              notification_id: row.id,
            });
          }
        }),
      );
      for (const result of results)
        if (result.status === 'rejected')
          console.warn({ event: 'ADMIN_NEW_USER_EMAIL_QUEUE_WRITE_FAILED' });
    }
    return sent;
  } finally {
    mailer?.close?.();
  }
}

export async function drain_account_emails(db: SqlClient) {
  let sent = 0;
  const deadline = Date.now() + 45000;
  for (let batch = 0; batch < 3; batch++) {
    let fetched = 0;
    sent += await deliver_new_user_emails(db, (size) => {
      fetched = size;
    });
    if (fetched < 10 || Date.now() >= deadline) break;
  }
  return sent;
}

let running: Promise<unknown> | undefined;
let rerun = false;
export function schedule_new_user_emails(db: SqlClient) {
  if (config.NODE_ENV === 'test') return;
  if (running) {
    rerun = true;
    return;
  }
  running = drain_account_emails(db)
    .catch(() => {
      console.warn({ event: 'ADMIN_NEW_USER_EMAIL_QUEUE_FAILED' });
    })
    .finally(() => {
      running = undefined;
      if (rerun) {
        rerun = false;
        schedule_new_user_emails(db);
      }
    });
  try {
    waitUntil(running);
  } catch {
    console.warn({
      event: 'ADMIN_NEW_USER_EMAIL_BACKGROUND_CONTEXT_UNAVAILABLE',
    });
  }
}

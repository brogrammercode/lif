import { randomUUID } from 'node:crypto';
import type { SqlClient } from '../../database/postgres.service.js';
import { config } from '../../core/config.js';

export const PARTNER_EMAIL_TITLE = 'Partner Program email';
type Application = {
  id: string;
  user_id: string;
  contact_email: string;
  version: number;
  status?: string;
};
export async function queue_partner_email(
  tx: SqlClient,
  app: Application,
  event: string,
  subject: string,
  message: string,
  admins = false,
) {
  const recipients = admins
    ? (
        await tx.query<{ id: string; email: string }>(
          `SELECT id,email FROM users WHERE role='ADMIN' AND status='ACTIVE'
          AND deleted_at IS NULL AND email IS NOT NULL ORDER BY id`,
        )
      ).rows
    : [{ id: app.user_id, email: app.contact_email }];
  const seen = new Set<string>();
  const rows = recipients.flatMap((person) => {
    const email = person.email?.trim().toLowerCase();
    if (!email || seen.has(email)) return [];
    seen.add(email);
    const path = admins
      ? `/partner-program/applications${event === 'CONFIRMATION_SUBMITTED' ? '/confirmations' : ''}?application_id=${encodeURIComponent(app.id)}`
      : '';
    return [
      {
        id: randomUUID(),
        user_id: person.id,
        type: 'SYSTEM' as const,
        channel: 'EMAIL' as const,
        title: PARTNER_EMAIL_TITLE,
        body: subject,
        data: {
          kind: 'PARTNER_LIFECYCLE_EMAIL',
          state: 'PENDING',
          attempts: 0,
          recipient_email: email,
          recipient_role: admins ? 'ADMIN' : 'APPLICANT',
          application_id: app.id,
          event,
          version: app.version,
          ...(app.status ? { expected_status: app.status } : {}),
          subject,
          text: `${message}\n\n${admins ? config.ADMIN_NOTIFICATION_ORIGIN + path : 'Open the 1More app > Settings > Partner Program to see your application.'}\n\nApplication reference: ${app.id}\n1More Partner Program`,
        },
      },
    ];
  });
  if (rows.length)
    await tx.query(
      `INSERT INTO notifications(id,user_id,type,channel,title,body,data,updated_at)
      SELECT n.id,n.user_id,'SYSTEM','EMAIL',n.title,n.body,n.data,clock_timestamp()
      FROM jsonb_to_recordset($1::jsonb) n(id text,user_id text,title text,body text,data jsonb)`,
      [JSON.stringify(rows)],
    );
}

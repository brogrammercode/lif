import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { TransactionClient } from '../database/client.js';
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
  tx: TransactionClient,
  app: Application,
  event: string,
  subject: string,
  message: string,
  admins = false,
) {
  const recipients = admins
    ? await tx.user.findMany({
        where: {
          role: 'ADMIN',
          status: 'ACTIVE',
          deleted_at: null,
          email: { not: null },
        },
        select: { id: true, email: true },
        orderBy: { id: 'asc' },
      })
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
        } as Prisma.InputJsonObject,
      },
    ];
  });
  if (rows.length) await tx.notification.createMany({ data: rows });
}

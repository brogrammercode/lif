import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { waitUntil } from '@vercel/functions';
import type { Prisma, User } from '@prisma/client';
import { config } from '../../core/config.js';
import {
  prisma,
  type AppPrismaClient,
  type TransactionClient,
} from '../database/client.js';
import {
  new_user_email,
  type NewUserEmailDetails,
} from './new_user_email.template.js';

export const NEW_USER_EMAIL_TITLE = 'New 1More user registered';
const KIND = 'ADMIN_NEW_USER_EMAIL';
const RETRY_MS = 5 * 60 * 1000;
// Email delivery records stay out of the mobile notification feed, including
// after an administrator's access has been revoked.
export const visible_notification_filter: Prisma.NotificationWhereInput = {
  NOT: { channel: 'EMAIL', type: 'SYSTEM', title: NEW_USER_EMAIL_TITLE },
};

export async function queue_new_user_emails(
  tx: TransactionClient,
  user: User,
  source: string,
) {
  const admins = await tx.user.findMany({
    where: {
      role: 'ADMIN',
      status: 'ACTIVE',
      deleted_at: null,
      email: { not: null },
      id: { not: user.id },
    },
    select: { id: true, email: true },
    orderBy: { id: 'asc' },
  });
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
  const data = admins.flatMap((admin) => {
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
        } as Prisma.InputJsonObject,
      },
    ];
  });
  if (data.length) await tx.notification.createMany({ data });
}

// Reuses the existing EMAIL notification channel as a durable transactional
// outbox. Account creation and queued emails either both commit or both roll back.
export async function deliver_new_user_emails(
  database: AppPrismaClient = prisma,
) {
  if (!config.MAIL_USER || !config.GOOGLE_APP_PASSWORD) return 0;
  const pending = await database.notification.findMany({
    where: {
      channel: 'EMAIL',
      type: 'SYSTEM',
      title: NEW_USER_EMAIL_TITLE,
      sent_at: null,
      data: { path: ['kind'], equals: KIND },
      OR: [
        { data: { path: ['state'], equals: 'PENDING' } },
        { updated_at: { lt: new Date(Date.now() - RETRY_MS) } },
      ],
    },
    orderBy: { created_at: 'asc' },
    take: 10,
  });
  const mailer = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    auth: {
      user: config.MAIL_USER,
      pass: config.GOOGLE_APP_PASSWORD.replace(/\s+/g, ''),
    },
  });
  let sent = 0;
  // Bound parallel SMTP connections and runtime per invocation.
  for (let offset = 0; offset < pending.length; offset += 3) {
    const results = await Promise.allSettled(
      pending.slice(offset, offset + 3).map(async (row) => {
        const data = row.data as Prisma.JsonObject;
        const claim = randomUUID();
        const claimed_data = {
          ...data,
          state: 'SENDING',
          claim,
          attempts: Number(data.attempts ?? 0) + 1,
        } as Prisma.InputJsonObject;
        const claimed = await database.notification.updateMany({
          where: {
            id: row.id,
            sent_at: null,
            updated_at: row.updated_at,
            data: { equals: row.data as Prisma.InputJsonValue },
          },
          data: { data: claimed_data },
        });
        if (!claimed.count) return;
        const owned = {
          id: row.id,
          sent_at: null,
          data: { path: ['claim'], equals: claim },
        };
        try {
          // Recheck privileges and address immediately before sending. Never send
          // customer data to a deactivated/revoked admin or an old email address.
          const admin = await database.user.findFirst({
            where: {
              id: row.user_id,
              role: 'ADMIN',
              status: 'ACTIVE',
              deleted_at: null,
              email: {
                equals: String(data.recipient_email),
                mode: 'insensitive',
              },
            },
            select: { email: true },
          });
          if (!admin?.email) {
            await database.notification.updateMany({
              where: owned,
              data: {
                sent_at: new Date(),
                data: {
                  ...claimed_data,
                  state: 'SKIPPED',
                  last_error:
                    'Recipient no longer has active admin access at this email.',
                },
              },
            });
            return;
          }
          const message = new_user_email(
            data.details as unknown as NewUserEmailDetails,
            config.ADMIN_NOTIFICATION_ORIGIN,
          );
          const result = await mailer.sendMail({
            from: { name: '1More Admin', address: config.MAIL_USER },
            to: admin.email,
            ...message,
            messageId: `<new-user-${row.id}@${config.MAIL_USER.split('@')[1]}>`,
          });
          if (!result.accepted?.length)
            throw new Error('SMTP_RECIPIENT_NOT_ACCEPTED');
          await database.notification.updateMany({
            where: owned,
            data: {
              sent_at: new Date(),
              data: { ...claimed_data, state: 'SENT', last_error: null },
            },
          });
          sent++;
        } catch {
          await database.notification.updateMany({
            where: owned,
            data: {
              data: {
                ...claimed_data,
                state: 'FAILED',
                last_error: 'Email delivery failed; retry pending.',
              },
            },
          });
          console.warn({
            event: 'ADMIN_NEW_USER_EMAIL_FAILED',
            notification_id: row.id,
          });
        }
      }),
    );
    for (const result of results) {
      if (result.status === 'rejected')
        console.warn({ event: 'ADMIN_NEW_USER_EMAIL_QUEUE_WRITE_FAILED' });
    }
  }
  return sent;
}

let running: Promise<unknown> | undefined;
export function schedule_new_user_emails() {
  if (config.NODE_ENV === 'test' || running) return;
  running = deliver_new_user_emails()
    .catch(() => {
      console.warn({ event: 'ADMIN_NEW_USER_EMAIL_QUEUE_FAILED' });
    })
    .finally(() => {
      running = undefined;
    });
  try {
    waitUntil(running);
  } catch {
    // The task already has its own error handler; local runtimes may not have
    // a Vercel request context. Notification delivery must not fail sign-in.
    console.warn({
      event: 'ADMIN_NEW_USER_EMAIL_BACKGROUND_CONTEXT_UNAVAILABLE',
    });
  }
}

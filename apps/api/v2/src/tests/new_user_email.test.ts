import { queue_partner_email } from '../infra/mail/partner_email.js';
import type { PartnerApplicationDeletionService } from '../features/partner_program/partner_application_deletion.service.js';
import { RegistrationEmailController } from '../features/admin_pending/registration_email.controller.js';
import { AdminPartnerProgramController } from '../features/partner_program/partner_program.controller.js';
import type { PartnerProgramService } from '../features/partner_program/partner_program.service.js';
import type { PartnerDocumentService } from '../features/partner_program/partner_document.service.js';
import type { PartnerDeliveryService } from '../features/partner_program/partner_delivery.service.js';
import type { Request, Response } from 'express';
import { smtp_transport, smtp_failure } from '../infra/mail/smtp.js';
import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import nodemailer from 'nodemailer';
import { AuthRepository } from '../features/auth/auth.repo.js';
import type { PrismaService } from '../infra/database/prisma.service.js';
import type { User, Prisma } from '@prisma/client';
import { config } from '../core/config.js';
import type {
  AppPrismaClient,
  TransactionClient,
} from '../infra/database/client.js';
import { new_user_email } from '../infra/mail/new_user_email.template.js';
import {
  queue_new_user_emails,
  deliver_new_user_emails,
  drain_account_emails,
} from '../infra/mail/new_user_email.js';

const details = {
  id: '123',
  name: '<img src=x onerror=alert(1)>',
  email: 'user@example.test',
  phone: null,
  role: 'RIDER',
  status: 'ACTIVE',
  created_at: '2026-10-22T09:00:00Z',
  source: 'GOOGLE sign-in',
};
const initial_mail = {
  MAIL_USER: config.MAIL_USER,
  GOOGLE_APP_PASSWORD: config.GOOGLE_APP_PASSWORD,
};
afterEach(() => {
  mock.restoreAll();
  Object.assign(config, initial_mail);
});

it('renders escaped signup details and the real personal-page route', () => {
  const message = new_user_email(details, 'https://adminonemore.vercel.app');
  assert.ok(message.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!message.html.includes('<img src=x'));
  assert.ok(
    message.html.includes('https://adminonemore.vercel.app/users/123/personal'),
  );
  assert.ok(message.text.includes('Phone: Not provided'));
  assert.ok(message.text.includes('Created (India time)'));
  assert.ok(!message.html.includes('provider_account_id'));
});

it('queues one private delivery per normalized admin email in the creation transaction', async () => {
  let queued: Prisma.NotificationCreateManyInput[] = [];
  const tx = {
    user: {
      findMany: async (args: { where: unknown }) => {
        assert.deepEqual(args.where, {
          role: 'ADMIN',
          status: 'ACTIVE',
          deleted_at: null,
          email: { not: null },
          id: { not: '123' },
        });
        return [
          { id: '1', email: 'Admin@Example.test' },
          { id: '2', email: 'admin@example.test' },
          { id: '3', email: null },
        ];
      },
    },
    notification: {
      createMany: async (args: {
        data: Prisma.NotificationCreateManyInput[];
      }) => {
        queued = args.data;
      },
    },
  } as unknown as TransactionClient;
  await queue_new_user_emails(
    tx,
    {
      id: '123',
      first_name: 'Example',
      last_name: 'User',
      email: details.email,
      phone_e164: null,
      role: 'RIDER',
      status: 'ACTIVE',
      created_at: new Date(details.created_at),
    } as User,
    'GOOGLE sign-in',
  );
  assert.equal(queued.length, 1);
  assert.equal(queued[0]!.channel, 'EMAIL');
  assert.equal(
    (queued[0]!.data as Prisma.InputJsonObject).recipient_email,
    'admin@example.test',
  );
});

function worker_fixture(active = true, claimable = true, partner = false) {
  const updates: { where: unknown; data: Record<string, unknown> }[] = [];
  let sends = 0;
  Object.assign(config, {
    MAIL_USER: 'sender@example.test',
    GOOGLE_APP_PASSWORD: 'fake-password',
  });
  mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async () => {
      sends++;
      return { accepted: ['admin@example.test'] };
    },
  }));
  const database = {
    notification: {
      findMany: async () => [
        {
          id: 'delivery-1',
          user_id: 'admin-1',
          updated_at: new Date(),
          data: {
            kind: partner ? 'PARTNER_LIFECYCLE_EMAIL' : 'ADMIN_NEW_USER_EMAIL',
            ...(partner
              ? {
                  application_id: 'application',
                  recipient_role: 'ADMIN',
                  expected_status: 'SUBMITTED',
                  subject: 'Application',
                  text: 'Review the application',
                }
              : {}),
            attempts: 0,
            state: 'PENDING',
            recipient_email: 'admin@example.test',
            details,
          },
        },
      ],
      updateMany: async (input: (typeof updates)[number]) => {
        updates.push(input);
        return { count: claimable ? 1 : 0 };
      },
    },
    partnerApplication: {
      findUnique: async () => ({
        status: 'APPROVED',
        user: { status: 'ACTIVE', deleted_at: null },
      }),
    },
    user: {
      findFirst: async (input: { where: Record<string, unknown> }) => {
        assert.equal(input.where.role, 'ADMIN');
        assert.equal(input.where.status, 'ACTIVE');
        assert.equal(input.where.deleted_at, null);
        assert.deepEqual(input.where.email, {
          equals: 'admin@example.test',
          mode: 'insensitive',
        });
        return active ? { email: 'admin@example.test' } : null;
      },
    },
  } as unknown as AppPrismaClient;
  return { database, updates, sends: () => sends };
}

it('does not email an admin whose access or email has changed', async () => {
  const f = worker_fixture(false);
  assert.equal(await deliver_new_user_emails(f.database), 0);
  assert.equal(f.sends(), 0);
  assert.equal(
    (f.updates.at(-1)!.data.data as Record<string, unknown>).state,
    'SKIPPED',
  );
});

it('does not send without winning the conditional delivery claim', async () => {
  const f = worker_fixture(true, false);
  assert.equal(await deliver_new_user_emails(f.database), 0);
  assert.equal(f.sends(), 0);
});

it('marks a successfully accepted email as sent', async () => {
  const f = worker_fixture();
  assert.equal(await deliver_new_user_emails(f.database), 1);
  assert.equal(f.sends(), 1);
  assert.equal(
    (f.updates.at(-1)!.data.data as Record<string, unknown>).state,
    'SENT',
  );
  assert.ok(f.updates.at(-1)!.data.sent_at instanceof Date);
});

it('leaves SMTP failures retryable without exposing SMTP error contents', async () => {
  const f = worker_fixture();
  mock.restoreAll();
  mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async () => {
      throw new Error('secret SMTP exchange');
    },
  }));
  assert.equal(await deliver_new_user_emails(f.database), 0);
  const data = f.updates.at(-1)!.data.data as Record<string, unknown>;
  assert.equal(data.state, 'FAILED');
  assert.ok(!JSON.stringify(data).includes('secret SMTP exchange'));
  assert.equal(f.updates.at(-1)!.data.sent_at, undefined);
});

for (const initialPoolFailure of [false, true])
  it(
    'enqueues account mail once across sign-in reuse and acquisition failure=' +
      initialPoolFailure,
    async () => {
      let created = 0,
        queued = 0,
        linked = false;
      let attempts = 0;
      const user = {
        id: 'new-user',
        first_name: 'Example',
        last_name: null,
        email: 'new@example.test',
        phone_e164: null,
        role: 'RIDER',
        status: 'ACTIVE',
        deleted_at: null,
        created_at: new Date(),
      };
      const tx = {
        $executeRaw: async () => 0,
        authAccount: {
          findUnique: async () => (linked ? { user } : null),
          create: async () => {
            linked = true;
          },
        },
        user: {
          findMany: async (args: { where: Record<string, unknown> }) =>
            args.where.role
              ? [{ id: 'admin', email: 'admin@example.test' }]
              : created
                ? [user]
                : [],
          create: async () => {
            created++;
            return user;
          },
          update: async () => user,
        },
        notification: {
          createMany: async () => {
            queued++;
          },
        },
        userLog: { create: async () => ({}) },
      };
      const repo = new AuthRepository({
        client: {
          $transaction: async (task: (client: unknown) => Promise<unknown>) => {
            if (++attempts === 1 && initialPoolFailure)
              throw { errorCode: 'P2024' };
            return task(tx);
          },
        },
      } as unknown as PrismaService);
      const identity = {
        provider_account_id: 'subject',
        provider_email: user.email,
      };
      await repo.resolve_external_user('GOOGLE', identity);
      await repo.resolve_external_user('GOOGLE', identity);
      assert.equal(created, 1);
      assert.equal(queued, 1);
      assert.equal(attempts, initialPoolFailure ? 3 : 2);
    },
  );

it('partner submission queues a normalized admin alert with a real review link and a separate applicant receipt', async () => {
  const rows: Prisma.NotificationCreateManyInput[] = [];
  const tx = {
    user: {
      findMany: async () => [
        { id: 'admin1', email: 'Admin@example.test' },
        { id: 'admin2', email: 'admin@example.test' },
      ],
    },
    notification: {
      createMany: async ({
        data,
      }: {
        data: Prisma.NotificationCreateManyInput[];
      }) => {
        rows.push(...data);
        return { count: data.length };
      },
    },
  } as unknown as TransactionClient;
  const app = {
    id: 'application',
    user_id: 'rider',
    contact_email: 'Rider@example.test',
    version: 2,
  };
  await queue_partner_email(
    tx,
    app,
    'APPLICATION_SUBMITTED',
    'New application',
    'Ready for review',
    true,
  );
  await queue_partner_email(
    tx,
    app,
    'APPLICATION_RECEIVED',
    'Application saved',
    'Track your review in the app.',
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.user_id, 'admin1');
  assert.equal(rows[1]!.user_id, 'rider');
  const data = rows.map((row) => row.data as Prisma.InputJsonObject);
  assert.equal(data[0]!.recipient_email, 'admin@example.test');
  assert.equal(data[1]!.recipient_email, 'rider@example.test');
  assert.ok(
    String(data[0]!.text).includes(
      '/partner-program/applications?application_id=application',
    ),
  );
  assert.equal(data[1]!.version, 2);
  assert.equal(data[1]!.state, 'PENDING');
});
it('SMTP uses explicit STARTTLS settings, strips app-password spacing and sanitizes authentication failures', () => {
  Object.assign(config, {
    MAIL_USER: 'sender@example.test',
    GOOGLE_APP_PASSWORD: 'abcd efgh ijkl mnop',
  });
  let options: Record<string, unknown> | undefined;
  mock.method(
    nodemailer,
    'createTransport',
    (value: Record<string, unknown>) => {
      options = value;
      return {};
    },
  );
  smtp_transport();
  assert.equal(options!.service, undefined);
  assert.equal(options!.port, 587);
  assert.equal(options!.secure, false);
  assert.equal(options!.requireTLS, true);
  assert.equal((options!.auth as { pass: string }).pass, 'abcdefghijklmnop');
  assert.equal(
    smtp_failure({
      code: 'EAUTH',
      message: 'secret password in SMTP exchange',
    }),
    'SMTP authentication failed. Check MAIL_USER and its app password.',
  );
});

it('obsolete lifecycle messages are skipped rather than emailing correction/submission instructions after the workflow moved forward', async () => {
  const f = worker_fixture(true, true, true);
  assert.equal(await deliver_new_user_emails(f.database), 0);
  assert.equal(f.sends(), 0);
  assert.equal(
    (f.updates.at(-1)!.data.data as Record<string, unknown>).state,
    'SKIPPED',
  );
});
it('missing SMTP configuration produces a visible retryable failure instead of silently losing the queued message', async () => {
  const f = worker_fixture();
  Object.assign(config, { MAIL_USER: '', GOOGLE_APP_PASSWORD: '' });
  assert.equal(await deliver_new_user_emails(f.database), 0);
  assert.equal(f.sends(), 0);
  const data = f.updates.at(-1)!.data.data as Record<string, unknown>;
  assert.equal(data.state, 'FAILED');
  assert.ok(String(data.last_error).includes('SMTP is not configured'));
});

it('a full batch of obsolete lifecycle alerts does not strand a newer valid account email', async () => {
  const f = worker_fixture();
  const [row] = await f.database.notification.findMany();
  let batches = 0;
  mock.method(f.database.notification, 'findMany', async () =>
    ++batches === 1
      ? Array.from({ length: 10 }, (_, i) => ({
          ...row!,
          id: `old-${i}`,
          data: {
            ...(row!.data as Prisma.JsonObject),
            kind: 'PARTNER_LIFECYCLE_EMAIL',
            application_id: 'application',
            expected_status: 'SUBMITTED',
            recipient_role: 'ADMIN',
          },
        }))
      : [row!],
  );
  assert.equal(await drain_account_emails(f.database), 1);
  assert.equal(batches, 2);
  assert.equal(f.sends(), 1);
});

it('queue draining is bounded even when every full batch loses its claims', async () => {
  const f = worker_fixture(true, false);
  const [row] = await f.database.notification.findMany();
  let batches = 0;
  mock.method(f.database.notification, 'findMany', async () => {
    batches++;
    return Array.from({ length: 10 }, (_, i) => ({ ...row!, id: `busy-${i}` }));
  });
  assert.equal(await drain_account_emails(f.database), 0);
  assert.equal(batches, 3);
  assert.equal(f.sends(), 0);
});

it('obsolete workflow messages can be skipped even while SMTP is not configured', async () => {
  const f = worker_fixture(true, true, true);
  Object.assign(config, { MAIL_USER: '', GOOGLE_APP_PASSWORD: '' });
  await deliver_new_user_emails(f.database);
  assert.equal(
    (f.updates.at(-1)!.data.data as Record<string, unknown>).state,
    'SKIPPED',
  );
});

for (const lifecycle of [false, true]) {
  it(`${lifecycle ? 'partner' : 'registration'} retry cannot overwrite a worker claim made in the same millisecond`, async () => {
    const original = {
      kind: lifecycle ? 'PARTNER_LIFECYCLE_EMAIL' : 'ADMIN_NEW_USER_EMAIL',
      state: 'FAILED',
    };
    const claimed = {
      ...original,
      state: 'SENDING',
      claim: 'concurrent-worker',
    };
    let writes = 0;
    const row = { id: 'email', updated_at: new Date(), data: original };
    const tx = {
      $executeRaw: async () => 1,
      user: {
        findUnique: async () => ({
          role: 'ADMIN',
          status: 'ACTIVE',
          deleted_at: null,
        }),
      },
      partnerApplication: { findUnique: async () => ({ id: 'application' }) },
      notification: {
        findFirst: async () => row,
        findMany: async () => [row],
        updateMany: async ({
          where,
        }: {
          where: { data?: { equals: unknown } };
        }) => {
          assert.deepEqual(where.data?.equals, original);
          if (
            !where.data ||
            JSON.stringify(where.data.equals) === JSON.stringify(claimed)
          ) {
            writes++;
            return { count: 1 };
          }
          return { count: 0 };
        },
      },
      userLog: { create: async () => ({}) },
    };
    const database = {
      client: {
        $transaction: async (fn: (client: typeof tx) => Promise<unknown>) =>
          fn(tx),
      },
    } as unknown as PrismaService;
    const req = {
      auth: { user_id: 'admin' },
      params: { id: lifecycle ? 'application' : 'email' },
    } as unknown as Request;
    const res = {
      status: () => res,
      json: (value: unknown) => value,
    } as unknown as Response;
    if (lifecycle) {
      const controller = new AdminPartnerProgramController(
        {} as PartnerProgramService,
        {} as PartnerDocumentService,
        {} as PartnerDeliveryService,
        database,
        {} as PartnerApplicationDeletionService,
      );
      await controller.retry_notifications(req, res);
    } else {
      const controller = new RegistrationEmailController(database);
      await assert.rejects(
        controller.retry(req, res),
        (error: { error_code?: string }) =>
          error.error_code === 'EMAIL_CHANGED',
      );
    }
    assert.equal(writes, 0);
  });
}

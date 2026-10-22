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

function worker_fixture(active = true, claimable = true) {
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
            kind: 'ADMIN_NEW_USER_EMAIL',
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

it('enqueues only on account creation, including when subsequent logins reuse the identity', async () => {
  let created = 0,
    queued = 0,
    linked = false;
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
      $transaction: async (task: (client: unknown) => Promise<unknown>) =>
        task(tx),
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
});

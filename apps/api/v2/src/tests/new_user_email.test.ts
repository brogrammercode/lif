import { queue_partner_email } from '../infra/mail/partner_email.js';
import { RegistrationEmailService } from '../features/admin_pending/registration-email.service.js';
import type {
  PostgresService,
  SqlClient,
} from '../database/postgres.service.js';
import { PartnerProgramService } from '../features/partner_program/partner_program.service.js';
import { smtp_transport, smtp_failure } from '../infra/mail/smtp.js';
import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import nodemailer from 'nodemailer';
import { AuthRepository } from '../features/auth/auth.repo.js';
import { AppError } from '../core/error.js';
import type { User, Prisma } from '@prisma/client';
import { config } from '../core/config.js';
import { new_user_email } from '../infra/mail/new_user_email.template.js';
import {
  queueNewUserEmailsSql,
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
    query: async (sql: string, args: unknown[]) => {
      if (sql.startsWith('SELECT')) {
        assert.match(sql, /role='ADMIN' AND status='ACTIVE'/);
        assert.match(
          sql,
          /deleted_at IS NULL AND email IS NOT NULL AND id<>\$1/,
        );
        assert.deepEqual(args, ['123']);
        return {
          rows: [
            { id: '1', email: 'Admin@Example.test' },
            { id: '2', email: 'admin@example.test' },
          ],
        };
      }
      assert.match(sql, /'SYSTEM','EMAIL'/);
      queued = JSON.parse(String(args[0]));
      return { rows: [] };
    },
  } as unknown as SqlClient;
  await queueNewUserEmailsSql(
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
  const source = {
    pending: async () => [
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
  };
  const database = {
    query: async (sql: string, args: unknown[] = []) => {
      if (sql.includes('FROM notifications'))
        return { rows: await source.pending() };
      if (sql.includes('FROM partner_applications a JOIN users'))
        return { rows: [{ available: false }] };
      if (sql.includes('SELECT u.email')) {
        assert.match(sql, /u.status='ACTIVE' AND u.deleted_at IS NULL/);
        assert.match(sql, /u.role='ADMIN' AND lower\(u.email\)=lower\(\$2\)/);
        assert.deepEqual(args, ['admin-1', 'admin@example.test', undefined]);
        return { rows: active ? [{ email: 'admin@example.test' }] : [] };
      }
      if (sql.includes('updated_at=$2')) {
        assert.match(sql, /data=\$3::jsonb/);
        updates.push({
          where: args.slice(0, 3),
          data: { data: JSON.parse(String(args[3])) },
        });
        return { rowCount: claimable ? 1 : 0 };
      }
      assert.match(sql, /data->>'claim'=\$2/);
      updates.push({
        where: args.slice(0, 2),
        data: { data: JSON.parse(String(args[2])), sent_at: args[3] },
      });
      return { rowCount: 1 };
    },
  } as unknown as SqlClient;
  return { database, source, updates, sends: () => sends };
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
        query: async (sql: string) => {
          if (sql.startsWith('SELECT user_id FROM auth_accounts'))
            return { rows: linked ? [{ user_id: user.id }] : [] };
          if (
            sql.startsWith('SELECT id, role') ||
            sql.startsWith('SELECT id,role')
          )
            return { rows: created ? [user] : [] };
          if (sql.startsWith('INSERT INTO users')) {
            created++;
            return { rows: [user] };
          }
          if (sql.startsWith('UPDATE users')) return { rows: [user] };
          if (sql.startsWith('INSERT INTO auth_accounts')) linked = true;
          if (sql.startsWith('SELECT id,email FROM users'))
            return { rows: [{ id: 'admin', email: 'admin@example.test' }] };
          if (sql.startsWith('INSERT INTO notifications')) queued++;
          return { rows: [] };
        },
      };
      const repo = new AuthRepository({
        transaction: async (task: (client: typeof tx) => Promise<unknown>) => {
          if (++attempts === 1 && initialPoolFailure)
            throw new AppError(
              503,
              'DATABASE_BUSY',
              'fixture acquisition failure',
            );
          return task(tx);
        },
      } as unknown as PostgresService);
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
    query: async (sql: string, args: unknown[] = []) => {
      if (sql.includes('SELECT id,email FROM users'))
        return {
          rows: [
            { id: 'admin1', email: 'Admin@example.test' },
            { id: 'admin2', email: 'admin@example.test' },
          ],
        };
      rows.push(...JSON.parse(String(args[0])));
      return { rows: [] };
    },
  } as unknown as import('../database/postgres.service.js').SqlClient;
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
  const [row] = await f.source.pending();
  let batches = 0;
  mock.method(f.source, 'pending', async () =>
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
  const [row] = await f.source.pending();
  let batches = 0;
  mock.method(f.source, 'pending', async () => {
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
    if (lifecycle) {
      const pg = {
        transaction: async (run: (tx: { query: typeof query }) => unknown) =>
          run({ query }),
      } as unknown as PostgresService;
      async function query(sql: string) {
        if (sql.includes('FROM users'))
          return {
            rows: [{ role: 'ADMIN', status: 'ACTIVE', deleted_at: null }],
          };
        if (sql.startsWith('SELECT id'))
          return { rows: [{ id: 'application' }], rowCount: 1 };
        if (sql.includes('WITH candidates')) {
          assert.match(sql, /FOR UPDATE SKIP LOCKED/);
          assert.match(sql, /data->>'state' IN \('FAILED','PENDING'\)/);
          assert.equal(claimed.state, 'SENDING');
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      }
      assert.deepEqual(
        await new PartnerProgramService(pg).retry_notifications(
          'admin',
          'application',
        ),
        { queued: 0 },
      );
    } else {
      const pg = {
        transaction: async (
          work: (client: {
            query: (sql: string, values?: unknown[]) => unknown;
          }) => unknown,
        ) =>
          work({
            query: async (sql, values) => {
              if (sql.includes('pg_advisory')) return { rows: [] };
              if (sql.startsWith('SELECT status'))
                return {
                  rows: [{ role: 'ADMIN', status: 'ACTIVE', deleted_at: null }],
                };
              if (sql.startsWith('SELECT id')) return { rows: [row] };
              assert.match(sql, /AND data = \$3::jsonb/);
              assert.deepEqual(JSON.parse(String(values?.[2])), original);
              const updated =
                JSON.stringify(original) === JSON.stringify(claimed);
              if (updated) writes++;
              return { rows: [], rowCount: updated ? 1 : 0 };
            },
          }),
      } as unknown as PostgresService;
      const service = new RegistrationEmailService(pg);
      await assert.rejects(
        service.retry('admin', 'email'),
        (error: { error_code?: string }) =>
          error.error_code === 'EMAIL_CHANGED',
      );
    }
    assert.equal(writes, 0);
  });
}

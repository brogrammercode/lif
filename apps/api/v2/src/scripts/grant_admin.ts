import { z } from 'zod';
import {
  queue_new_user_emails,
  deliver_new_user_emails,
} from '../infra/mail/new_user_email.js';
import { prisma } from '../infra/database/client.js';
import { create_user_log } from '../infra/database/user_log.js';
import {
  ADMIN_ACCESS_LOCK,
  ADMIN_ACCESS_TRANSACTION,
} from '../features/admin_access/admin_access.constant.js';
const run = async () => {
  const email_index = process.argv.indexOf('--email');
  const email = z
    .email()
    .parse(email_index >= 0 ? process.argv[email_index + 1] : undefined)
    .toLowerCase();
  const user = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_ACCESS_LOCK})`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(720047, hashtext(${email}))`;
    const matches = await tx.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      take: 2,
    });
    if (matches.length > 1)
      throw new Error(
        'Resolve duplicate accounts with this email before granting access.',
      );
    const existing = matches[0];
    if (existing && (existing.status !== 'ACTIVE' || existing.deleted_at))
      throw new Error(
        'Only an active account can be granted administrator access.',
      );
    if (existing?.role === 'ADMIN') return existing;
    const previous_role = existing?.role ?? 'RIDER';
    const admin = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { role: 'ADMIN' },
        })
      : await tx.user.create({ data: { email, role: 'ADMIN' } });
    const record = await tx.adminAccess.findUnique({
      where: { user_id: admin.id },
      select: { id: true },
    });
    if (!existing)
      await queue_new_user_emails(tx, admin, 'Admin provisioning command');
    const data = {
      previous_role,
      granted_by_id: null,
      granted_at: new Date(),
      revoked_at: null,
      revoked_by_id: null,
    };
    if (record) await tx.adminAccess.update({ where: { id: record.id }, data });
    else await tx.adminAccess.create({ data: { ...data, user_id: admin.id } });
    await tx.session.updateMany({
      where: { user_id: admin.id, family_id: { not: null }, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    await create_user_log(tx, {
      actor_id: admin.id,
      entity_type: 'User',
      entity_id: admin.id,
      action: 'PROVISION_ADMIN',
      before_data: { role: existing?.role ?? null },
      after_data: { role: 'ADMIN' },
    });
    return admin;
  }, ADMIN_ACCESS_TRANSACTION);
  process.stdout.write(
    `Admin access provisioned for ${user.email}. Sign in with that Google account.\n`,
  );
  try {
    await deliver_new_user_emails();
  } catch {
    process.stderr.write(
      'Admin access is provisioned; signup emails remain queued for retry.\n',
    );
  }
};
run()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof z.ZodError ? 'Usage: npm run admin:grant -- --email you@example.com' : error instanceof Error ? error.message : 'Provisioning failed'}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

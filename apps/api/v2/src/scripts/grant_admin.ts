import { z } from 'zod';
import { prisma } from '../infra/database/client.js';
import { create_user_log } from '../infra/database/user_log.js';
const run = async () => {
  const email_index = process.argv.indexOf('--email');
  const email = z
    .email()
    .parse(email_index >= 0 ? process.argv[email_index + 1] : undefined)
    .toLowerCase();
  const user = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
      if (existing && existing.status !== 'ACTIVE')
        throw new Error(
          'Only an active account can be granted administrator access.',
        );
      const admin = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { role: 'ADMIN' },
          })
        : await tx.user.create({ data: { email, role: 'ADMIN' } });
      await create_user_log(tx, {
        actor_id: admin.id,
        entity_type: 'User',
        entity_id: admin.id,
        action: 'PROVISION_ADMIN',
        before_data: { role: existing?.role ?? null },
        after_data: { role: 'ADMIN' },
      });
      return admin;
    },
    { maxWait: 10000, timeout: 10000 },
  );
  process.stdout.write(
    `Admin access provisioned for ${user.email}. Sign in with that Google account.\n`,
  );
};
run()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof z.ZodError ? 'Usage: npm run admin:grant -- --email you@example.com' : error instanceof Error ? error.message : 'Provisioning failed'}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

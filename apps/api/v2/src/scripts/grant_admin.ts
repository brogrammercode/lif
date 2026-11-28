import { z } from 'zod';
import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module.js';
import { PostgresService } from '../database/postgres.service.js';
import { AdminAccessRepository } from '../features/admin_access/admin_access.repo.js';
import { deliver_new_user_emails } from '../infra/mail/new_user_email.js';

let context:
  Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
try {
  const index = process.argv.indexOf('--email');
  const email = z
    .email()
    .parse(index >= 0 ? process.argv[index + 1] : undefined)
    .toLowerCase();
  context = await NestFactory.createApplicationContext(DatabaseModule, {
    logger: false,
  });
  const db = context.get(PostgresService);
  const { user } = await new AdminAccessRepository(db).provisionAdmin(email);
  process.stdout.write(
    `Admin access provisioned for ${user.email}. Sign in with that Google account.\n`,
  );
  try {
    await deliver_new_user_emails(db);
  } catch {
    process.stderr.write(
      'Admin access is provisioned; signup emails remain queued for retry.\n',
    );
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof z.ZodError ? 'Usage: npm run admin:grant -- --email you@example.com' : error instanceof Error ? error.message : 'Provisioning failed'}\n`,
  );
  process.exitCode = 1;
} finally {
  await context?.close();
}

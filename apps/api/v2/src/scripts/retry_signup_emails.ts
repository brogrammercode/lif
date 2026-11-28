import { drain_account_emails } from '../infra/mail/new_user_email.js';
import { NestFactory } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module.js';
import { PostgresService } from '../database/postgres.service.js';
import { config } from '../core/config.js';

let context:
  Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
try {
  if (!config.MAIL_USER || !config.GOOGLE_APP_PASSWORD)
    throw new Error(
      'Configure MAIL_USER and GOOGLE_APP_PASSWORD before retrying email.',
    );
  context = await NestFactory.createApplicationContext(DatabaseModule, {
    logger: false,
  });
  const sent = await drain_account_emails(context.get(PostgresService));
  process.stdout.write(
    `Sent ${sent} queued account and partner emails. Failed or busy deliveries remain queued.\n`,
  );
} catch {
  process.stderr.write(
    'Could not deliver the account/partner email queue. Check SMTP configuration and API logs.\n',
  );
  process.exitCode = 1;
} finally {
  await context?.close();
}

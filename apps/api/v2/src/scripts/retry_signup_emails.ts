import { drain_account_emails } from '../infra/mail/new_user_email.js';
import { prisma } from '../infra/database/client.js';
import { config } from '../core/config.js';

try {
  if (!config.MAIL_USER || !config.GOOGLE_APP_PASSWORD)
    throw new Error(
      'Configure MAIL_USER and GOOGLE_APP_PASSWORD before retrying email.',
    );
  const sent = await drain_account_emails();
  process.stdout.write(
    `Sent ${sent} queued account and partner emails. Failed or busy deliveries remain queued.\n`,
  );
} catch {
  process.stderr.write(
    'Could not deliver the account/partner email queue. Check SMTP configuration and API logs.\n',
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

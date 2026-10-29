import { PrismaService } from '../infra/database/prisma.service.js';
import { AuditRetentionService } from '../core/audit_retention.service.js';
const database = new PrismaService();
try {
  const service = new AuditRetentionService(database);
  const totals = { admin_activity: 0, user_logs: 0 };
  for (let pass = 0; pass < 100; pass++) {
    const result = await service.prune();
    totals.admin_activity += result.admin_activity;
    totals.user_logs += result.user_logs;
    if (!result.has_more) {
      console.log({ event: 'AUDIT_RETENTION_COMPLETE', ...totals });
      break;
    }
    if (pass === 99)
      throw new Error(
        'Audit cleanup remains pending; run again to finish the backlog.',
      );
  }
} catch {
  console.error(
    'Audit cleanup could not finish. Retry when the database is available.',
  );
  process.exitCode = 1;
} finally {
  await database.client.$disconnect();
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/database/prisma.service.js';

export const AUDIT_RETENTION_DAYS = 7;
export const audit_cutoff = (now = new Date()) =>
  new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86400000);
const BATCH = 1000;
@Injectable()
export class AuditRetentionService {
  constructor(private readonly database: PrismaService) {}
  async prune(maxBatches = 25, now = new Date()) {
    const cutoff = audit_cutoff(now),
      totals = { admin_activity: 0, user_logs: 0, has_more: false };
    const deadline = Date.now() + 25000;
    for (let batch = 0; batch < maxBatches; batch++) {
      const result = await this.database.client.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<
            { acquired: boolean }[]
          >`SELECT pg_try_advisory_xact_lock(720092) AS acquired`;
          if (!lock?.acquired) return null;
          const admin_activity =
            await tx.$executeRaw`DELETE FROM admin_activity WHERE id IN (SELECT id FROM admin_activity WHERE started_at <= ${cutoff} ORDER BY started_at, id LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)`;
          const user_logs =
            await tx.$executeRaw`DELETE FROM user_logs WHERE id IN (SELECT id FROM user_logs WHERE created_at <= ${cutoff} ORDER BY created_at, id LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)`;
          return { admin_activity, user_logs };
        },
        { maxWait: 1000, timeout: 5000 },
      );
      if (!result) break;
      totals.admin_activity += result.admin_activity;
      totals.user_logs += result.user_logs;
      totals.has_more =
        result.admin_activity === BATCH || result.user_logs === BATCH;
      if (!totals.has_more || Date.now() >= deadline) break;
    }
    if (totals.admin_activity || totals.user_logs)
      console.info({
        event: 'EXPIRED_AUDIT_LOGS_PURGED',
        cutoff: cutoff.toISOString(),
        ...totals,
      });
    return totals;
  }
}

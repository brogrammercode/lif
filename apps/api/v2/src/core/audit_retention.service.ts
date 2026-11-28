import { Injectable } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service.js';
import { pruneAuditBatch } from '../database/prune-audit.sql.js';

export const AUDIT_RETENTION_DAYS = 7;
export const audit_cutoff = (now = new Date()) =>
  new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86400000);
const BATCH = 1000;
@Injectable()
export class AuditRetentionService {
  constructor(private readonly database: PostgresService) {}
  async prune(maxBatches = 25, now = new Date()) {
    const cutoff = audit_cutoff(now),
      totals = { admin_activity: 0, user_logs: 0, has_more: false };
    const deadline = Date.now() + 25000;
    for (let batch = 0; batch < maxBatches; batch++) {
      const result = await this.database.transaction(
        async (tx) => {
          const batch = await tx.query<{
            admin_activity: number;
            user_logs: number;
          }>(pruneAuditBatch, [cutoff, BATCH]);
          return batch.rows[0] ?? null;
        },
        'READ COMMITTED',
        { checkoutMs: 1000, statementMs: 5000 },
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

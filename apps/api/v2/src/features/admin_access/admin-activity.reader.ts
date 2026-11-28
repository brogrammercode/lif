import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  AUDIT_RETENTION_DAYS,
  audit_cutoff,
} from '../../core/audit_retention.service.js';
import {
  admin_action_label,
  audit_resource,
  legacy_action_aliases,
} from '../../core/admin_audit.action.js';
import { PostgresService } from '../../database/postgres.service.js';
import { adminActivitySql } from './sql/admin-activity.sql.js';

export const activityFilter = z.object({
  query: z.string().trim().max(100).default(''),
  actor_id: z.string().max(100).optional(),
  outcome: z.enum(['all', 'success', 'failure', 'pending']).default('all'),
  activity: z.enum(['all', 'changes', 'reads']).default('all'),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
});

export type ActivityFilter = z.output<typeof activityFilter>;
type Activity = {
  action: string;
  method: string;
  path: string;
  started_at: string;
  completed_at: string | null;
};

@Injectable()
export class AdminActivityReader {
  constructor(private readonly db: PostgresService) {}

  async list(input: ActivityFilter) {
    const { query } = input;
    const { rows } = await this.db.query<{
      activities: Activity[];
      total: number;
      page: number;
    }>(adminActivitySql, [
      audit_cutoff(),
      input.actor_id,
      input.outcome,
      input.activity,
      query,
      query.includes('_') ? query.replaceAll('_', ' ').trim() : null,
      legacy_action_aliases(query).map((alias) => alias.toLowerCase()),
      input.page,
    ]);
    const result = rows[0]!;
    return {
      total: result.total,
      page: result.page,
      page_size: 20,
      retention_days: AUDIT_RETENTION_DAYS,
      activities: result.activities.map((activity) => ({
        ...activity,
        started_at: new Date(activity.started_at),
        completed_at: activity.completed_at
          ? new Date(activity.completed_at)
          : null,
        resource: audit_resource(activity.path),
        action:
          /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/|administrator request)/i.test(
            activity.action,
          )
            ? admin_action_label(activity.method, activity.path)
            : activity.action,
      })),
    };
  }
}

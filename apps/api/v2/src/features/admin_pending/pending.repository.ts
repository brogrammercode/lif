import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service.js';
import { PENDING_SNAPSHOT_KEY } from './pending.rules.js';
import {
  active_owner,
  driver_owner,
  pendingCountsSql,
} from './sql/pending-counts.sql.js';
import {
  pending_confirmation_sql,
  pending_vehicle_sql,
} from './sql/pending-predicates.sql.js';

type Counts = {
  signup_emails: number;
  brands: number;
  models: number;
  vehicles: number;
  applications: number;
  confirmations: number;
  exits: number;
  reviews: number;
  email_failures: number;
  activation_locked: number;
};

@Injectable()
export class PendingRepository {
  constructor(private readonly db: PostgresService) {}

  snapshot() {
    return this.db.transaction(async (tx) => {
      const read = async () =>
        (
          await tx.query<{ payload: Counts; valid: boolean }>(
            'SELECT payload, expires_at > NOW() AS valid FROM admin_pending_snapshots WHERE key = $1',
            [PENDING_SNAPSHOT_KEY],
          )
        ).rows[0];
      let row = await read();
      if (row?.valid) return row.payload;
      // Invalidation uses the same transaction lock, including during the bridge.
      await tx.query('SELECT pg_advisory_xact_lock(720091)');
      row = await read();
      if (row?.valid) return row.payload;
      const counts = (await tx.query<Counts>(pendingCountsSql)).rows[0]!;
      await tx.query(
        `INSERT INTO admin_pending_snapshots (key, payload, expires_at)
        VALUES ($1, $2::jsonb, NOW() + INTERVAL '30 seconds')
        ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at`,
        [PENDING_SNAPSHOT_KEY, JSON.stringify(counts)],
      );
      return counts;
    });
  }

  async users(ids: string[]) {
    const { rows } = await this.db.query<{ id: string; count: number }>(
      `SELECT u.id, count(*)::int AS count
      FROM vehicles v JOIN driver_profiles d ON d.id=v.driver_id JOIN users u ON u.id=d.user_id
      WHERE u.id = ANY($1::text[]) AND ${driver_owner} AND ${pending_vehicle_sql} GROUP BY u.id`,
      [ids],
    );
    return rows;
  }

  async applications(ids: string[]) {
    const { rows } = await this.db.query<{
      id: string;
      fields: number;
      confirmations: number;
    }>(
      `SELECT a.id,
      (SELECT count(*)::int FROM partner_application_fields f WHERE f.application_id=a.id
       AND a.status IN ('SUBMITTED','CHANGES_REQUESTED') AND f.status='PENDING'
       AND f.value IS NOT NULL AND f.value NOT IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb)) AS fields,
      CASE WHEN ${pending_confirmation_sql} THEN 1 ELSE 0 END AS confirmations
      FROM partner_applications a JOIN users u ON u.id=a.user_id
      WHERE a.id=ANY($1::text[]) AND ${active_owner}`,
      [ids],
    );
    return rows;
  }
}

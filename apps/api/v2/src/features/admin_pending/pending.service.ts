import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/database/prisma.service.js';
import {
  pending_application_sql,
  pending_confirmation_sql,
  pending_vehicle_sql,
  pending_exit_sql,
  pending_query,
  PENDING_SNAPSHOT_KEY,
} from './pending.rules.js';
import type { z } from 'zod';
type Numbers = {
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
const active_owner = Prisma.sql`u.deleted_at IS NULL AND u.status = 'ACTIVE'`;
const driver_owner = Prisma.sql`${active_owner} AND (u.role='DRIVER' OR u.partner_activated_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM partner_applications excluded WHERE excluded.user_id=u.id AND excluded.status='EXITED')`;

@Injectable()
export class PendingService {
  constructor(private readonly database: PrismaService) {}
  async counts(input: z.infer<typeof pending_query>) {
    const snapshot = await this.database.client.$transaction(
      async (tx) => {
        const read = () =>
          tx.$queryRaw<
            { payload: Numbers; valid: boolean }[]
          >`SELECT payload, expires_at>NOW() AS valid FROM admin_pending_snapshots WHERE key=${PENDING_SNAPSHOT_KEY}`;
        let row = (await read())[0];
        if (row?.valid) return row.payload;
        // The rebuild lock is also used by invalidation, preventing stale overwrite.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(720091)`;
        row = (await read())[0];
        if (row?.valid) return row.payload;
        const [counts] = await tx.$queryRaw<Numbers[]>`SELECT
      (SELECT COUNT(*)::int FROM notifications WHERE channel='EMAIL' AND sent_at IS NULL AND data->>'kind'='ADMIN_NEW_USER_EMAIL' AND (data->>'state'='FAILED' OR updated_at<NOW()-INTERVAL '5 minutes')) AS signup_emails,
      (SELECT COUNT(*)::int FROM vehicle_brands WHERE status='REQUESTED') AS brands,
      (SELECT COUNT(*)::int FROM vehicle_models WHERE status='REQUESTED') AS models,
      (SELECT COUNT(*)::int FROM vehicles v JOIN driver_profiles d ON d.id=v.driver_id JOIN users u ON u.id=d.user_id WHERE ${driver_owner} AND ${pending_vehicle_sql}) AS vehicles,
      (SELECT COUNT(*)::int FROM partner_applications a JOIN users u ON u.id=a.user_id WHERE ${active_owner} AND ${pending_application_sql}) AS applications,
      (SELECT COUNT(*)::int FROM partner_applications a JOIN users u ON u.id=a.user_id WHERE ${active_owner} AND ${pending_confirmation_sql}) AS confirmations,
      (SELECT COUNT(*)::int FROM partner_exit_requests e JOIN partner_applications a ON a.id=e.application_id JOIN users u ON u.id=a.user_id WHERE ${active_owner} AND ${pending_exit_sql}) AS exits,
      (SELECT COUNT(*)::int FROM ride_settlement_reviews WHERE status IN ('REQUESTED','DISPUTED','APPROVED')) AS reviews,
      (SELECT COUNT(*)::int FROM partner_deliveries WHERE status='FAILED') +
      (SELECT COUNT(*)::int FROM notifications WHERE channel='EMAIL' AND sent_at IS NULL AND data->>'state'='FAILED') AS email_failures,
      (SELECT COUNT(*)::int FROM partner_applications WHERE status='COMPLETED' AND activation_attempts>=5) AS activation_locked`;
        await tx.$executeRaw`INSERT INTO admin_pending_snapshots(key,payload,expires_at) VALUES(${PENDING_SNAPSHOT_KEY},${JSON.stringify(counts)}::jsonb,NOW()+INTERVAL '30 seconds')
      ON CONFLICT(key) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at`;
        return counts!;
      },
      { maxWait: 10000, timeout: 30000 },
    );
    const users: Record<string, { vehicle_verification: number }> = {};
    const applications: Record<
      string,
      { fields: number; confirmations: number }
    > = {};
    if (input.user_ids.length) {
      for (const id of input.user_ids) users[id] = { vehicle_verification: 0 };
      const rows = await this.database.client.$queryRaw<
        { id: string; count: number }[]
      >`SELECT u.id,COUNT(*)::int AS count FROM vehicles v JOIN driver_profiles d ON d.id=v.driver_id JOIN users u ON u.id=d.user_id
      WHERE u.id IN (${Prisma.join(input.user_ids)}) AND ${driver_owner} AND ${pending_vehicle_sql} GROUP BY u.id`;
      for (const row of rows)
        users[row.id] = { vehicle_verification: row.count };
    }
    if (input.application_ids.length) {
      const rows = await this.database.client.$queryRaw<
        { id: string; fields: number; confirmations: number }[]
      >`SELECT a.id,
      (SELECT COUNT(*)::int FROM partner_application_fields f WHERE f.application_id=a.id AND a.status IN ('SUBMITTED','CHANGES_REQUESTED') AND f.status='PENDING' AND f.value IS NOT NULL AND f.value NOT IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb)) AS fields,
      CASE WHEN ${pending_confirmation_sql} THEN 1 ELSE 0 END AS confirmations
      FROM partner_applications a JOIN users u ON u.id=a.user_id WHERE a.id IN (${Prisma.join(input.application_ids)}) AND ${active_owner}`;
      for (const row of rows)
        applications[row.id] = {
          fields: row.fields,
          confirmations: row.confirmations,
        };
    }
    const tabs = {
      vehicle_models: snapshot.brands + snapshot.models,
      vehicle_verification: snapshot.vehicles,
      applications: snapshot.applications,
      confirmations: snapshot.confirmations,
      exit_requests: snapshot.exits,
      ride_reviews: snapshot.reviews,
      registration_emails: snapshot.signup_emails,
    };
    const sections = {
      app: tabs.vehicle_models + tabs.ride_reviews,
      users: tabs.vehicle_verification,
      partner_program:
        tabs.applications + tabs.confirmations + tabs.exit_requests,
      admin: snapshot.signup_emails,
      support: 0,
    };
    return {
      total: Object.values(sections).reduce((a, b) => a + b, 0),
      sections,
      tabs,
      queues: {
        brands: snapshot.brands,
        models: snapshot.models,
        email_failures: snapshot.email_failures,
        activation_locked: snapshot.activation_locked,
      },
      entities: { users, applications },
    };
  }
}

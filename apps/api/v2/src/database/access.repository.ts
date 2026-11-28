import { Injectable } from '@nestjs/common';
import { PostgresService } from './postgres.service.js';

@Injectable()
export class AccessRepository {
  constructor(private readonly db: PostgresService) {}

  async account(userId: string, familyId: string | undefined, now: Date) {
    const { rows } = await this.db.query<{
      role: string;
      status: string;
      deleted_at: Date | null;
      session_valid: boolean;
    }>(
      `SELECT u.role, u.status, u.deleted_at,
      ($2::text IS NULL OR EXISTS (SELECT 1 FROM sessions s
        WHERE s.user_id = u.id AND s.family_id = $2 AND s.revoked_at IS NULL
          AND s.expires_at > $3)) AS session_valid
      FROM users u WHERE u.id = $1`,
      [userId, familyId, now],
    );
    return rows[0];
  }

  async partnerStatus(userId: string) {
    const { rows } = await this.db.query<{ status: string }>(
      'SELECT status FROM partner_applications WHERE current_user_id = $1',
      [userId],
    );
    return rows[0]?.status;
  }
}

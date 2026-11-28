import { Injectable } from '@nestjs/common';
import { nextEntityId } from './entity-id.js';
import { PostgresService } from './postgres.service.js';

type AuditStart = {
  request_id: string;
  actor_id?: string;
  method: string;
  path: string;
  action: string;
  ip_address?: string;
  user_agent?: string;
};

type AuditCompletion = {
  actor_id?: string;
  action: string;
  status_code: number;
  completed_at: Date;
};

@Injectable()
export class AdminAuditRepository {
  constructor(private readonly db: PostgresService) {}

  async start(data: AuditStart) {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO admin_activity (id, request_id, actor_id, method, path, action, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (request_id) DO UPDATE SET request_id=EXCLUDED.request_id
       RETURNING id`,
      [
        nextEntityId(),
        data.request_id,
        data.actor_id,
        data.method,
        data.path,
        data.action,
        data.ip_address,
        data.user_agent,
      ],
    );
    return rows[0]!.id;
  }

  async complete(id: string, data: AuditCompletion) {
    const result = await this.db.query(
      `UPDATE admin_activity SET actor_id=COALESCE($2,actor_id),
        action=$3,status_code=$4,completed_at=$5 WHERE id=$1`,
      [id, data.actor_id, data.action, data.status_code, data.completed_at],
    );
    if (!result.rowCount)
      throw new Error('Administrator activity was not found');
  }
}

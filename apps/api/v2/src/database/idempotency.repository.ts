import { Injectable } from '@nestjs/common';
import { nextEntityId } from './entity-id.js';
import { PostgresService } from './postgres.service.js';

type IdempotencyRecord = {
  id: string;
  request_hash: string;
  response_json: unknown;
  status_code: number | null;
  expires_at: Date;
};
const columns = 'id, request_hash, response_json, status_code, expires_at';

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly db: PostgresService) {}

  async find(scope: string, key: string) {
    const { rows } = await this.db.query<IdempotencyRecord>(
      `SELECT ${columns} FROM idempotency_keys WHERE scope=$1 AND key=$2`,
      [scope, key],
    );
    return rows[0];
  }

  async claim(
    userId: string,
    scope: string,
    key: string,
    hash: string,
    expiresAt: Date,
    now: Date,
  ) {
    const { rows } = await this.db.query<IdempotencyRecord>(
      `
      INSERT INTO idempotency_keys (id, user_id, scope, key, request_hash, expires_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp())
      ON CONFLICT (scope, key) DO UPDATE SET id=EXCLUDED.id, user_id=EXCLUDED.user_id,
        request_hash=EXCLUDED.request_hash, expires_at=EXCLUDED.expires_at,
        response_json=NULL, status_code=NULL, created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at
      WHERE idempotency_keys.expires_at <= $7
      RETURNING ${columns}`,
      [nextEntityId(), userId, scope, key, hash, expiresAt, now],
    );
    return rows[0];
  }

  complete(id: string, body: unknown, status: number) {
    return this.db.query(
      'UPDATE idempotency_keys SET response_json=$2::jsonb, status_code=$3, updated_at=clock_timestamp() WHERE id=$1',
      [id, JSON.stringify(body), status],
    );
  }

  removePending(id: string) {
    return this.db.query(
      'DELETE FROM idempotency_keys WHERE id=$1 AND response_json IS NULL',
      [id],
    );
  }
}

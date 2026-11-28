import { nextEntityId } from './entity-id.js';
import type { SqlClient } from './postgres.service.js';

export type UserLogInput = {
  actor_id?: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_data?: unknown;
  after_data?: unknown;
};

export async function insertUserLog(
  tx: SqlClient,
  input: UserLogInput,
): Promise<void> {
  await tx.query(
    `INSERT INTO user_logs
      (id, actor_id, entity_type, entity_id, action, before_data, after_data, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, clock_timestamp())`,
    [
      nextEntityId(),
      input.actor_id,
      input.entity_type,
      input.entity_id,
      input.action,
      JSON.stringify(input.before_data),
      JSON.stringify(input.after_data),
    ],
  );
}

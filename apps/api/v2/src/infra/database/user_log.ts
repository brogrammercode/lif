import type { TransactionClient } from './client.js';
import { Prisma } from '@prisma/client';
export type UserLogInput = {
  actor_id?: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_data?: unknown;
  after_data?: unknown;
};
export const create_user_log = async (
  tx: TransactionClient,
  input: UserLogInput,
): Promise<void> => {
  const to_json = (value: unknown) =>
    value === undefined
      ? undefined
      : value === null
        ? Prisma.JsonNull
        : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
  await tx.userLog.create({
    data: {
      actor_id: input.actor_id,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      action: input.action,
      before_data: to_json(input.before_data),
      after_data: to_json(input.after_data),
    },
  });
};

import type { Prisma } from '@prisma/client';
import { setTimeout as pause } from 'node:timers/promises';
import type { AppPrismaClient, TransactionClient } from './client.js';
import { DATABASE_POOL_WAIT_SECONDS } from './connection_url.js';

type Options = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

// Only retry acquisition: once Prisma enters the callback, any error (including
// a lost commit acknowledgement) must propagate without replaying writes.
export async function transaction_with_connection_retry<T>(
  database: AppPrismaClient,
  work: (tx: TransactionClient) => Promise<T>,
  options: Options = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let entered = false;
    try {
      return await database.$transaction(
        async (tx) => {
          entered = true;
          return work(tx);
        },
        { maxWait: DATABASE_POOL_WAIT_SECONDS * 1000, ...options },
      );
    } catch (error) {
      const failure = error as { code?: unknown; errorCode?: unknown } | null;
      const code = failure?.code ?? failure?.errorCode;
      if (entered || attempt > 0 || !['P2024', 'P2028'].includes(String(code)))
        throw error;
      await pause(100 + Math.floor(Math.random() * 100));
    }
  }
}

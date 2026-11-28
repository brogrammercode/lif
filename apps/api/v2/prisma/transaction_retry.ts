import type { Prisma } from '@prisma/client';
import { setTimeout as pause } from 'node:timers/promises';
import type { AppPrismaClient, TransactionClient } from './client.js';
import { DATABASE_POOL_WAIT_SECONDS } from '../src/infra/database/connection_url.js';

type Options = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

// Retrying before callback entry is the default. A read-only preflight may opt
// in, provided it calls begin_writes before attempting its first mutation.
export async function transaction_with_connection_retry<T>(
  database: AppPrismaClient,
  work: (tx: TransactionClient, begin_writes: () => void) => Promise<T>,
  {
    retry_read_only_preflight = false,
    ...options
  }: Options & {
    retry_read_only_preflight?: boolean;
  } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let write_attempted = false;
    try {
      return await database.$transaction(
        async (tx) => {
          write_attempted = !retry_read_only_preflight;
          return work(tx, () => {
            write_attempted = true;
          });
        },
        { maxWait: DATABASE_POOL_WAIT_SECONDS * 1000, ...options },
      );
    } catch (error) {
      const failure = error as { code?: unknown; errorCode?: unknown } | null;
      const code = failure?.code ?? failure?.errorCode;
      if (
        write_attempted ||
        attempt > 0 ||
        !['P2024', 'P2028'].includes(String(code))
      )
        throw error;
      await pause(100 + Math.floor(Math.random() * 100));
    }
  }
}

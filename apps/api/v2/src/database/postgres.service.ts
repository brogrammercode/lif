import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import {
  postgres_error,
  unusablePostgresConnection,
} from './postgres-error.js';

export const POSTGRES_POOL = Symbol('POSTGRES_POOL');

export interface SqlClient {
  query<T extends QueryResultRow>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

type Isolation = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

@Injectable()
export class PostgresService implements SqlClient, OnModuleDestroy {
  private readonly logger = new Logger(PostgresService.name);

  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {
    pool.on('error', (error: Error) => {
      this.logger.warn(postgres_error(error).message);
    });
  }

  async query<T extends QueryResultRow>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw postgres_error(error, true);
    }
    let discard = false;
    try {
      return await client.query<T>(sql, [...values]);
    } catch (error) {
      discard = unusablePostgresConnection(error);
      throw postgres_error(error);
    } finally {
      client.release(discard);
    }
  }

  async transaction<T>(
    work: (tx: SqlClient) => Promise<T>,
    isolation: Isolation = 'READ COMMITTED',
    options?: { checkoutMs: number; statementMs: number },
  ): Promise<T> {
    let client: PoolClient;
    try {
      client = options
        ? await this.checkoutWithin(options.checkoutMs)
        : await this.pool.connect();
    } catch (error) {
      throw postgres_error(error, true);
    }
    let discard = false;
    const statementMs = options?.statementMs ?? 15000;
    const execute: SqlClient['query'] = async <Row extends QueryResultRow>(
      sql: string,
      values: readonly unknown[] = [],
    ) => {
      try {
        // Let the server enforce the statement deadline before the client
        // abandons the connection.
        const query = {
          text: sql,
          values: [...values],
          query_timeout: statementMs + 5000,
        };
        return await client.query<Row>(query);
      } catch (error) {
        if (unusablePostgresConnection(error)) discard = true;
        throw postgres_error(error);
      }
    };
    let pending: Promise<void> = Promise.resolve();
    let statementFailure: unknown;
    let accepting = true;
    const query: SqlClient['query'] = <Row extends QueryResultRow>(
      sql: string,
      values: readonly unknown[] = [],
    ) => {
      if (!accepting)
        return Promise.reject(new Error('PostgreSQL transaction is closed'));
      // Transactions share a connection. A failed statement must also stop
      // commands queued by another branch of the same transaction.
      const result = pending.then(async () => {
        if (statementFailure) throw statementFailure;
        try {
          return await execute<Row>(sql, values);
        } catch (error) {
          statementFailure = error;
          throw error;
        }
      });
      pending = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    };
    try {
      await execute(`BEGIN ISOLATION LEVEL ${isolation}`);
      if (options) {
        await execute(
          "SELECT set_config('statement_timeout',$1,true), set_config('lock_timeout',$2,true)",
          [String(statementMs), String(Math.min(10000, statementMs))],
        );
      } else {
        await execute("SET LOCAL statement_timeout = '15s'");
        await execute("SET LOCAL lock_timeout = '10s'");
      }
      const result = await work({ query });
      accepting = false;
      await pending;
      if (statementFailure) throw statementFailure;
      const commit = await execute('COMMIT');
      if (commit.command !== 'COMMIT')
        throw new Error('PostgreSQL transaction rolled back before commit');
      return result;
    } catch (error) {
      accepting = false;
      await pending;
      if (!discard) {
        try {
          await client.query('ROLLBACK');
        } catch {
          discard = true;
        }
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }

  private async checkoutWithin(ms: number): Promise<PoolClient> {
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        reject(new Error('Timed out acquiring a PostgreSQL connection'));
      }, ms);
    });
    const connection = this.pool.connect().then((client) => {
      if (expired) client.release();
      return client;
    });
    try {
      return await Promise.race([connection, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

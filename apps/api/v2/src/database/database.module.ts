import { Module } from '@nestjs/common';
import pg from 'pg';
import { config } from '../core/config.js';
import {
  database_connection_url,
  DATABASE_POOL_WAIT_SECONDS,
} from '../infra/database/connection_url.js';
import { POSTGRES_POOL, PostgresService } from './postgres.service.js';

@Module({
  providers: [
    {
      provide: POSTGRES_POOL,
      useFactory: () => {
        const url = new URL(database_connection_url(config.DB_STRING));
        const seconds = Number(url.searchParams.get('pool_timeout'));
        const limit = Number(url.searchParams.get('connection_limit')) || 5;
        for (const option of [
          'connection_limit',
          'connect_timeout',
          'pool_timeout',
          'pgbouncer',
          'schema',
        ]) {
          url.searchParams.delete(option);
        }
        return new pg.Pool({
          connectionString: url.toString(),
          max: Number.isInteger(limit) && limit > 0 ? limit : 5,
          connectionTimeoutMillis:
            Number.isFinite(seconds) && seconds > 0
              ? seconds * 1000
              : DATABASE_POOL_WAIT_SECONDS * 1000,
          query_timeout: 20000,
          allowExitOnIdle: true,
        });
      },
    },
    PostgresService,
  ],
  exports: [PostgresService],
})
export class DatabaseModule {}

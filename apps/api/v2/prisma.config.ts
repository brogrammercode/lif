import './src/core/environment.js';
import { defineConfig, env } from 'prisma/config';
import { database_connection_url } from './src/infra/database/connection_url.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: database_connection_url(env('DB_STRING')),
  },
});

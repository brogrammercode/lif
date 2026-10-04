import 'dotenv/config';
import { z } from 'zod';

const CONFIG_SCHEMA = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DB_STRING: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().min(1).default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().min(1).default('*'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  ROUTING_BASE_URL: z.string().url().default('https://router.project-osrm.org'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).default('development-webhook-secret'),
});

const parsed_config = CONFIG_SCHEMA.safeParse(process.env);

if (!parsed_config.success) {
  throw new Error(`Invalid environment configuration: ${parsed_config.error.message}`);
}

export const config = parsed_config.data;

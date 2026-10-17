import './environment.js';
import { z } from 'zod';
import { isIP } from 'node:net';
import {
  DEVELOPMENT_WEBHOOK_SECRET,
  EXAMPLE_JWT_SECRET,
  EXAMPLE_WEBHOOK_SECRET,
} from './constants.js';
const origin_list = z
  .string()
  .trim()
  .min(1)
  .refine(
    (input) =>
      input.split(',').every((entry) => {
        try {
          const origin = new URL(entry.trim());
          return (
            ['http:', 'https:'].includes(origin.protocol) &&
            !origin.username &&
            !origin.password &&
            origin.pathname === '/' &&
            !origin.search &&
            !origin.hash
          );
        } catch {
          return false;
        }
      }),
    'Provide exact HTTP or HTTPS origins separated by commas.',
  )
  .transform((input) =>
    [
      ...new Set(input.split(',').map((entry) => new URL(entry.trim()).origin)),
    ].join(','),
  );
const CONFIG_SCHEMA = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4001),
  DB_STRING: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^[1-9]\d*(?:ms|s|m|h|d|w|y)$/)
    .default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.union([z.literal('*'), origin_list]).default('*'),
  TRUSTED_PROXY_CIDRS: z
    .string()
    .trim()
    .default('')
    .transform((value) =>
      value ? value.split(',').map((entry) => entry.trim()) : [],
    )
    .refine(
      (entries) =>
        entries.every((entry) => {
          const [address, prefix, extra] = entry.split('/');
          const version = isIP(address ?? '');
          return (
            version !== 0 &&
            extra === undefined &&
            (prefix === undefined ||
              (/^\d+$/.test(prefix) &&
                Number(prefix) <= (version === 4 ? 32 : 128)))
          );
        }),
      'TRUSTED_PROXY_CIDRS must contain explicit proxy IP addresses or CIDR subnets.',
    ),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_WEB_CLIENT_ID: z.string().default(''),
  CLOUDINARY_CLOUD_NAME: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]*$/)
    .default(''),
  CLOUDINARY_API_KEY: z.string().trim().default(''),
  CLOUDINARY_API_SECRET: z.string().trim().default(''),
  ADMIN_WEB_ORIGIN: origin_list.default(
    'http://localhost:5173,http://127.0.0.1:5173',
  ),
  ROUTING_BASE_URL: z.string().url().default('https://router.project-osrm.org'),
  PAYMENT_WEBHOOK_SECRET: z
    .string()
    .min(16)
    .default(DEVELOPMENT_WEBHOOK_SECRET),
});
const parsed_config = CONFIG_SCHEMA.safeParse(process.env);
if (!parsed_config.success) {
  const configuration_help =
    process.env.VERCEL === '1'
      ? 'Configure these variables in the API Vercel project Settings > Environment Variables for the deployment environment, then redeploy. No .env file is required.'
      : 'Provide valid process environment variables. A local .env file is optional for development.';
  throw new Error(
    `Invalid environment configuration: ${parsed_config.error.message}\n${configuration_help}`,
  );
}
export const config = parsed_config.data;

if (config.NODE_ENV === 'production') {
  const example_secret_variables: string[] = [];
  if (config.JWT_SECRET === EXAMPLE_JWT_SECRET) {
    example_secret_variables.push('JWT_SECRET');
  }
  if (
    [DEVELOPMENT_WEBHOOK_SECRET, EXAMPLE_WEBHOOK_SECRET].includes(
      config.PAYMENT_WEBHOOK_SECRET,
    )
  ) {
    example_secret_variables.push('PAYMENT_WEBHOOK_SECRET');
  }
  if (example_secret_variables.length) {
    console.warn({
      event: 'EXAMPLE_SECRETS_CONFIGURED',
      variables: example_secret_variables,
      message:
        'API startup continues with the configured secrets. Public example secrets allow forged tokens or payment signatures; replace them with private values before production use.',
    });
  }
}

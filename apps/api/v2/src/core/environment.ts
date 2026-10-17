import { config as load_dotenv } from 'dotenv';

// Hosted deployments receive configuration from the process environment.
// A local .env file is only an optional development convenience.
if (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1') {
  load_dotenv();
}

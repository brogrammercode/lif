import { createServer } from 'node:net';
import { config as load_dotenv } from 'dotenv';

if (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1')
  load_dotenv({ quiet: true });

const port = Number(process.env.PORT ?? 4001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}

const probe = createServer();
probe.once('error', (error) => {
  const message =
    error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Stop the existing API with Ctrl+C in its terminal, then rerun npm run dev.`
      : `Cannot listen on port ${port} (${error.code}).`;
  console.error(message);
  process.exitCode = 1;
});
probe.listen(port, () => probe.close());

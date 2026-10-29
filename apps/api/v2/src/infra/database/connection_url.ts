export const DATABASE_POOL_WAIT_SECONDS = 30;
export const database_connection_url = (
  value: string,
  options: { serverless?: boolean } = {},
): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DB_STRING must be a valid database connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return value;
  if (!url.searchParams.has('connect_timeout'))
    url.searchParams.set('connect_timeout', '15');
  // Acquisition must allow the connection's cold-start budget as well. Prisma's
  // default pool wait is only 10s, shorter than our remote connect timeout.
  if (!url.searchParams.has('pool_timeout'))
    url.searchParams.set('pool_timeout', String(DATABASE_POOL_WAIT_SECONDS));
  // A CPU-derived pool per Vercel instance multiplies as functions scale. Keep
  // local long-running servers unchanged and respect explicit operator tuning.
  if (
    (options.serverless ?? process.env.VERCEL === '1') &&
    !url.searchParams.has('connection_limit')
  )
    url.searchParams.set('connection_limit', '5');
  return url.toString();
};

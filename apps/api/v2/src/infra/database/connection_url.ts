export const database_connection_url = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DB_STRING must be a valid database connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return value;
  if (!url.searchParams.has('connect_timeout'))
    url.searchParams.set('connect_timeout', '15');
  return url.toString();
};

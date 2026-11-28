import { AppError } from '../core/error.js';
import { DUPLICATE_RECORD_MESSAGE } from '../core/constants.js';

const profiles = {
  unavailable: [
    503,
    'DATABASE_UNAVAILABLE',
    'The database is temporarily unavailable. Please try again shortly.',
  ],
  busy: [
    503,
    'DATABASE_BUSY',
    'The database is busy. Please try again shortly.',
  ],
  timeout: [
    503,
    'DATABASE_BUSY',
    'The database transaction could not finish. Please try again shortly.',
  ],
  duplicate: [409, 'RECORD_EXISTS', DUPLICATE_RECORD_MESSAGE],
  reference: [
    409,
    'REFERENCE_CONFLICT',
    'A referenced record is unavailable or still in use.',
  ],
  transactionConflict: [
    409,
    'TRANSACTION_CONFLICT',
    'The data changed during this request. Please try again.',
  ],
} as const;

const codes = new Map<string, keyof typeof profiles>([
  ['23505', 'duplicate'],
  ['23503', 'reference'],
  ['40001', 'transactionConflict'],
  ['40P01', 'transactionConflict'],
  ['55P03', 'busy'],
  ['57014', 'timeout'],
  ['53300', 'busy'],
  ['57P01', 'unavailable'],
  ['57P02', 'unavailable'],
  ['57P03', 'unavailable'],
  ['28000', 'unavailable'],
  ['28P01', 'unavailable'],
  ['ECONNREFUSED', 'unavailable'],
  ['ECONNRESET', 'unavailable'],
  ['EPIPE', 'unavailable'],
  ['ETIMEDOUT', 'unavailable'],
  ['ENOTFOUND', 'unavailable'],
]);

export function unusablePostgresConnection(error: unknown): boolean {
  const failure = error as {
    code?: unknown;
    message?: unknown;
    severity?: unknown;
  } | null;
  const code = typeof failure?.code === 'string' ? failure.code : '';
  return (
    failure?.severity === 'FATAL' ||
    failure?.severity === 'PANIC' ||
    failure?.message === 'Query read timeout' ||
    !/^[0-9A-Z]{5}$/.test(code) ||
    code.startsWith('08') ||
    code === 'EPIPE' ||
    ['57P01', '57P02', '57P03'].includes(code)
  );
}

export function postgres_error(error: unknown, acquiring = false): Error {
  const failure = error as { code?: unknown; message?: unknown } | null;
  const code = typeof failure?.code === 'string' ? failure.code : undefined;
  const timeout = failure?.message === 'Query read timeout';
  const disconnected =
    failure?.message === 'Connection terminated unexpectedly' ||
    failure?.message === 'Connection terminated';
  const mapped =
    disconnected || code?.startsWith('08')
      ? 'unavailable'
      : code
        ? codes.get(code)
        : timeout
          ? 'timeout'
          : acquiring
            ? 'busy'
            : undefined;
  if (mapped) {
    const [status, errorCode, message] = profiles[mapped];
    return new AppError(status, errorCode, message);
  }
  return new Error(
    code
      ? `PostgreSQL operation failed (${code})`
      : 'PostgreSQL operation failed',
  );
}

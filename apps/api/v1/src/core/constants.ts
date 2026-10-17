export const API_PREFIX = '/api/v1';
export const DEVELOPMENT_WEBHOOK_SECRET = 'development-webhook-secret';
export const EXAMPLE_JWT_SECRET = 'replace-with-a-long-random-secret';
export const EXAMPLE_WEBHOOK_SECRET = 'replace-with-a-webhook-secret';
export const JSON_CONTENT_TYPE = 'application/json';
export const AUTHORIZATION_PREFIX = 'Bearer ';
export const DEFAULT_CURRENCY = 'INR';
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const HEALTH_MESSAGE = 'Lif API is healthy';
export const UNKNOWN_ERROR_MESSAGE = 'An unexpected error occurred';
export const VALIDATION_ERROR_MESSAGE = 'Request validation failed';
export const UNAUTHORIZED_ERROR_MESSAGE = 'Authentication is required';
export const FORBIDDEN_ERROR_MESSAGE =
  'You are not allowed to perform this action';
export const NOT_FOUND_ERROR_MESSAGE = 'The requested resource was not found';
export const RIDE_NOT_FOUND_ERROR_MESSAGE = 'Ride was not found';
export const RIDE_STATE_ERROR_MESSAGE =
  'This ride cannot be changed from its current state';
export const DRIVER_NOT_AVAILABLE_ERROR_MESSAGE =
  'No verified driver is available';
export const QUOTE_EXPIRED_ERROR_MESSAGE = 'The selected quote has expired';
export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const IDEMPOTENCY_TTL_HOURS = 24;
export const IDEMPOTENCY_REQUIRED_MESSAGE =
  'An idempotency-key header is required for this request';
export const IDEMPOTENCY_CONFLICT_MESSAGE =
  'This idempotency key was already used with a different request';
export const IDEMPOTENCY_IN_PROGRESS_MESSAGE =
  'This request is already being processed';
export const MALFORMED_JSON_MESSAGE =
  'The request body must contain valid JSON.';
export const BODY_TOO_LARGE_MESSAGE = 'The request body is too large.';
export const DUPLICATE_RECORD_MESSAGE =
  'A record with these unique details already exists.';
export const ACCOUNT_INACTIVE_MESSAGE =
  'This account is not active. Contact support for assistance.';
export const SESSION_EXPIRED_MESSAGE =
  'Your session has ended. Please sign in again.';
export const DATABASE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 15_000,
} as const;

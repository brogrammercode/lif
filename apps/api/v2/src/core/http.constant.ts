import {
  DUPLICATE_RECORD_MESSAGE,
  NOT_FOUND_ERROR_MESSAGE,
} from './constants.js';

export const HTTP_CONFIG = {
  PREFIX: 'api',
  VERSIONS: ['1', '2'],
  DEFAULT_PORT: 4001,
  BODY_LIMIT: '1mb',
  IMAGE_BODY_LIMIT: '8mb',
  IMAGE_FORM_PATH:
    /^\/api\/v[12]\/admin\/(?:vehicle-categories|users)(?:\/[^/]+)?\/?$/i,
  IMAGE_METHODS: ['POST', 'PATCH'],
  REQUEST_ID_HEADER: 'X-Request-ID',
  CACHE_CONTROL_HEADER: 'Cache-Control',
  NO_STORE: 'no-store',
  POWERED_BY_HEADER: 'x-powered-by',
  RATE_LIMIT_MS: 60_000,
  RATE_LIMIT_COUNT: 15,
  RATE_LIMIT_HEADER: 'Retry-After',
  UNKNOWN_IP: 'unknown',
  IDEMPOTENCY_VERSION_PATH: /^\/api\/v2(?=\/)/,
  IDEMPOTENCY_COMPATIBILITY_PATH: '/api/v1',
  ROUTE_PARAMETER_PATTERN: /:([A-Za-z_][A-Za-z0-9_]*)/g,
} as const;
export const HTTP_DATABASE_ERRORS = {
  P2002: {
    status_code: 409,
    error_code: 'RECORD_EXISTS',
    message: DUPLICATE_RECORD_MESSAGE,
  },
  P2025: {
    status_code: 404,
    error_code: 'NOT_FOUND',
    message: NOT_FOUND_ERROR_MESSAGE,
  },
  P2003: {
    status_code: 409,
    error_code: 'REFERENCE_CONFLICT',
    message: 'A referenced record is unavailable or still in use.',
  },
  P2034: {
    status_code: 409,
    error_code: 'TRANSACTION_CONFLICT',
    message: 'The data changed during this request. Please try again.',
  },
} as const;
export const HTTP_MESSAGES = {
  STARTED: '1More Nest API listening on port',
  NOT_FOUND: 'Route was not found',
  WEBHOOK_SIGNATURE_REQUIRED: 'Payment webhook signature is required',
  WEBHOOK_BODY_REQUIRED: 'Payment webhook body is missing',
  WEBHOOK_SIGNATURE_INVALID: 'Payment webhook signature is invalid',
  UNSUPPORTED_ENCODING: 'The request encoding is not supported.',
  INVALID_BODY_ENCODING: 'The request body could not be decoded.',
} as const;
export const HTTP_ERROR_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'BODY_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
} as const;

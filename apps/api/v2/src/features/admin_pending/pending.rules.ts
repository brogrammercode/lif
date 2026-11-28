import { z } from 'zod';

export const PENDING_SNAPSHOT_KEY = 'admin-pending-v1';

const ids = z
  .string()
  .max(5100)
  .default('')
  .transform((value) => (value ? [...new Set(value.split(','))] : []))
  .pipe(
    z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9_-]+$/),
      )
      .max(50),
  );
export const pending_query = z
  .object({ user_ids: ids, application_ids: ids })
  .strict()
  .refine(
    (value) => value.user_ids.length + value.application_ids.length <= 50,
    'Request at most 50 visible entities.',
  );
export const pending_review_statuses = ['REQUESTED', 'DISPUTED', 'APPROVED'];
export const is_pending_poll = (method: string, path: string) =>
  method.toUpperCase() === 'GET' &&
  /^\/api\/v[12]\/admin\/pending-counts\/?$/i.test(path.split('?')[0]!);
export const changes_pending = (method: string, path: string) =>
  !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) &&
  !/\/assets(?:\/|$)/i.test(path) &&
  /\/(?:admin\/(?:users|access|registration-emails|trip-reviews|vehicle-brands|vehicle-models|vehicle-catalog|partner-program)|partner-program|driver\/(?:vehicle-verification|vehicle-brands|vehicle-models)|vehicles|(?:rides|trips)\/[^/]+\/(?:cancel|dispute|payment|no-show|issues|collection))\b/i.test(
    path,
  );

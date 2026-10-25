import { Prisma } from '@prisma/client';
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
// Keep the predicates shared by counts and drill-down lists.
export const pending_application_sql = Prisma.sql`(a.status = 'SUBMITTED' OR
  (a.status = 'CHANGES_REQUESTED' AND EXISTS(SELECT 1 FROM partner_application_fields f
    WHERE f.application_id=a.id AND f.status='PENDING'
      AND f.value IS NOT NULL AND f.value NOT IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb))) OR
  (a.status IN ('CHANGES_REQUESTED','APPROVED') AND EXISTS(SELECT 1 FROM notifications n
    WHERE n.channel='EMAIL' AND n.sent_at IS NULL AND n.data->>'application_id'=a.id
    AND (n.data->>'expected_status' IS NULL OR n.data->>'expected_status'=a.status::text)
    AND (n.data->>'state'='FAILED' OR n.updated_at < NOW()-INTERVAL '5 minutes'))))`;
export const pending_vehicle_sql = Prisma.sql`(v.status='UNDER_REVIEW' OR (v.status='REJECTED' AND EXISTS(
  SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.verification_fields)='array' THEN v.verification_fields ELSE '[]'::jsonb END) f
  WHERE f->>'status'='PENDING')))`;
export const pending_confirmation_sql = Prisma.sql`(a.status='CONFIRMATION_SUBMITTED' OR
 (a.status='COMPLETED' AND a.activation_attempts >= 5) OR EXISTS(
 SELECT 1 FROM partner_deliveries d WHERE d.application_id=a.id AND
 ((d.channel='EMAIL' AND a.status IN ('COMPLETED','ACTIVATED')) OR (d.channel='ACTIVATION_EMAIL' AND a.status='COMPLETED'))
 AND (d.status='FAILED' OR (d.status IN ('PENDING','SENDING') AND d.updated_at < NOW()-INTERVAL '5 minutes')))
 OR (a.status IN ('CONFIRMATION_SUBMITTED','CONFIRMATION_CHANGES_REQUESTED','COMPLETED') AND EXISTS(
 SELECT 1 FROM notifications n WHERE n.channel='EMAIL' AND n.sent_at IS NULL AND n.data->>'application_id'=a.id
    AND (n.data->>'expected_status' IS NULL OR n.data->>'expected_status'=a.status::text)
 AND (n.data->>'state'='FAILED' OR n.updated_at < NOW()-INTERVAL '5 minutes'))))`;

export const pending_exit_sql = Prisma.sql`(e.status IN ('REQUESTED','REVIEWING') OR
 (e.status='COMPLETED' AND EXISTS(SELECT 1 FROM partner_deliveries d WHERE d.application_id=e.application_id AND d.channel='EXIT_EMAIL'
 AND (d.status='FAILED' OR (d.status IN ('PENDING','SENDING') AND d.updated_at<NOW()-INTERVAL '5 minutes')))))`;
export const pending_exit_where = (
  now = new Date(),
): Prisma.PartnerExitRequestWhereInput => ({
  OR: [
    { status: { in: ['REQUESTED', 'REVIEWING'] } },
    {
      status: 'COMPLETED',
      application: {
        deliveries: {
          some: {
            channel: 'EXIT_EMAIL',
            OR: [
              { status: 'FAILED' },
              {
                status: { in: ['PENDING', 'SENDING'] },
                updated_at: { lt: new Date(now.getTime() - 300000) },
              },
            ],
          },
        },
      },
    },
  ],
});

export const pending_vehicle_where: Prisma.VehicleWhereInput = {
  OR: [
    { status: 'UNDER_REVIEW' },
    {
      status: 'REJECTED',
      verification_fields: { array_contains: [{ status: 'PENDING' }] },
    },
  ],
};

export const is_pending_poll = (method: string, path: string) =>
  method.toUpperCase() === 'GET' &&
  /^\/api\/v[12]\/admin\/pending-counts\/?$/i.test(path.split('?')[0]!);
export const changes_pending = (method: string, path: string) =>
  !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) &&
  !/\/assets(?:\/|$)/i.test(path) &&
  /\/(?:admin\/(?:users|access|registration-emails|trip-reviews|vehicle-brands|vehicle-models|vehicle-catalog|partner-program)|partner-program|driver\/(?:vehicle-verification|vehicle-brands|vehicle-models)|vehicles|(?:rides|trips)\/[^/]+\/(?:cancel|dispute|payment|no-show|issues|collection))\b/i.test(
    path,
  );

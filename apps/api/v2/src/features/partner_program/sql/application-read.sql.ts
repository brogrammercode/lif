import type { PostgresService } from '../../../database/postgres.service.js';
import {
  pending_application_sql,
  pending_confirmation_sql,
} from '../../admin_pending/sql/pending-predicates.sql.js';
import type { ListInput } from '../dto/partner-program.dto.js';

const from = 'FROM partner_applications a JOIN users u ON u.id=a.user_id';

const fullFields = `a.id,a.user_id,a.status,a.version,a.contact_email,a.whatsapp_phone,
  a.submitted_at,a.completed_at,a.activation_issued_at,a.activation_attempts,
  jsonb_build_object('first_name',u.first_name,'last_name',u.last_name,'avatar_url',u.avatar_url) AS "user",
  (SELECT jsonb_build_object('status',c.status,'accepted_at',
    to_char(c.accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    FROM partner_confirmations c WHERE c.application_id=a.id) AS confirmation,
  COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at,d.id)
    FROM partner_deliveries d WHERE d.application_id=a.id),'[]'::jsonb) AS deliveries`;

const pendingSearch =
  "strpos(lower(concat_ws(' ',a.id,a.contact_email,a.whatsapp_phone,u.first_name,u.last_name)),lower($2))>0";
const normalSearch = `(strpos(a.id,$2)>0 OR strpos(lower(a.contact_email),lower($2))>0
  OR strpos(a.whatsapp_phone,$2)>0 OR strpos(lower(u.first_name),lower($2))>0
  OR strpos(lower(u.last_name),lower($2))>0)`;

export async function applicationListPage(
  db: PostgresService,
  input: ListInput,
  projection: 'summary' | 'ids' = 'summary',
) {
  const pending = input.pending_only === 'true';
  const confirmation = input.section === 'confirmations';
  const condition = pending
    ? `u.deleted_at IS NULL AND u.status='ACTIVE' AND
      ${confirmation ? pending_confirmation_sql : pending_application_sql}`
    : confirmation
      ? 'EXISTS(SELECT 1 FROM partner_confirmations c WHERE c.application_id=a.id)'
      : 'TRUE';
  const where = `WHERE ${condition} AND ($1='all' OR a.status::text=$1)
    AND ($2='' OR ${pending ? pendingSearch : normalSearch})`;
  const params = [input.status, input.query];
  return db.transaction(async (tx) => {
    const {
      rows: [count],
    } = await tx.query<{ total: number }>(
      `SELECT count(*)::int AS total ${from} ${where}`,
      params,
    );
    const total = count?.total ?? 0;
    const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
    const { rows } = await tx.query<{ id: string }>(
      `SELECT ${projection === 'summary' ? fullFields : 'a.id'} ${from} ${where}
        ORDER BY a.submitted_at DESC,a.id DESC LIMIT 20 OFFSET $3`,
      [...params, (page - 1) * 20],
    );
    return { rows, total, page, page_size: 20 };
  }, 'REPEATABLE READ');
}

export const applicationDetails = `SELECT
  a.id,a.user_id,a.current_user_id,a.status,a.version,a.contact_email,a.whatsapp_phone,
  a.policy_snapshot,a.confirmation_document,a.submitted_at,a.reviewed_at,a.reviewed_by_id,
  a.completed_at,a.activated_at,a.final_pdf_id,a.activation_attempts,a.activation_issued_at,
  a.created_at,a.updated_at,
  jsonb_build_object('id',u.id,'first_name',u.first_name,'last_name',u.last_name,
    'email',u.email,'phone_e164',u.phone_e164,'role',u.role,
    'last_login_at',to_char(u.last_login_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'partner_activated_at',to_char(u.partner_activated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS "user",
  COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at,f.id)
    FROM partner_application_fields f WHERE f.application_id=a.id),'[]'::jsonb) AS fields,
  COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at,d.id)
    FROM partner_deliveries d WHERE d.application_id=a.id),'[]'::jsonb) AS deliveries,
  (SELECT to_jsonb(c) FROM partner_confirmations c WHERE c.application_id=a.id) AS confirmation,
  (SELECT jsonb_build_object('id',e.id,'status',e.status,'version',e.version)
    FROM partner_exit_requests e WHERE e.application_id=a.id) AS exit_request
  ${from} WHERE a.id=$1`;

export const applicationAssetMetadata = `SELECT id,owner_id,purpose,field_id,file_name,mime_type,size,created_at
  FROM partner_assets WHERE application_id=$1 AND owner_id=$2`;

export const applicationEmailHistory = `SELECT id,data,created_at,sent_at
  FROM notifications WHERE channel='EMAIL' AND data->>'application_id'=$1
  ORDER BY created_at DESC,id DESC LIMIT 50`;

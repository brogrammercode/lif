import { pending_exit_sql } from '../../admin_pending/sql/pending-predicates.sql.js';

export const exitColumns = 'e.*,trim_scale(e.dues_amount)::text AS dues_amount';
export const exitById = `SELECT ${exitColumns}
  FROM partner_exit_requests e WHERE e.id=$1`;
export const exitOwner = `SELECT e.application_id,e.status,e.settlement_pdf_id,a.user_id
  FROM partner_exit_requests e JOIN partner_applications a ON a.id=e.application_id WHERE e.id=$1`;
export const exitMine = `SELECT ${exitColumns}
  FROM partner_exit_requests e JOIN partner_applications a ON a.id=e.application_id
  WHERE a.current_user_id=$1`;
export const exitHistory = `SELECT e.id,e.completed_at,trim_scale(e.dues_amount)::text AS dues_amount,
  e.dues_direction,e.currency,e.settlement_pdf_id,jsonb_build_object('final_pdf_id',a.final_pdf_id) AS application
  FROM partner_exit_requests e JOIN partner_applications a ON a.id=e.application_id
  WHERE a.user_id=$1 AND e.status='COMPLETED' AND ($2::text IS NULL OR EXISTS(
    SELECT 1 FROM partner_exit_requests cursor_exit
    JOIN partner_applications own ON own.id=cursor_exit.application_id
    WHERE cursor_exit.id=$2 AND own.user_id=$1 AND cursor_exit.status='COMPLETED'
    AND (COALESCE(e.completed_at,'infinity'),e.id)<
      (COALESCE(cursor_exit.completed_at,'infinity'),cursor_exit.id)))
  ORDER BY e.completed_at DESC,e.id DESC LIMIT 21`;

export const exitAdminFrom = `FROM partner_exit_requests e JOIN partner_applications a ON a.id=e.application_id
  JOIN users u ON u.id=a.user_id`;
export const exitAdminFields = `${exitColumns},jsonb_build_object(
  'id',a.id,'user_id',a.user_id,'contact_email',a.contact_email,'whatsapp_phone',a.whatsapp_phone,
  'user',jsonb_build_object('first_name',u.first_name,'last_name',u.last_name),
  'deliveries',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'status',d.status,'attempts',d.attempts,'sent_at',to_char(d.sent_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'claimed_at',to_char(d.claimed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updated_at',to_char(d.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'last_error',d.last_error))
    FROM partner_deliveries d WHERE d.application_id=a.id AND d.channel='EXIT_EMAIL'),'[]'::jsonb)) AS application`;

export const exitAdminFilter = `WHERE ($1='all' OR e.status::text=$1 OR
  ($1='PENDING' AND u.deleted_at IS NULL AND u.status='ACTIVE' AND ${pending_exit_sql}))
  AND ($2='' OR strpos(e.id,$2)>0 OR strpos(a.user_id,$2)>0 OR
    strpos(lower(a.contact_email),lower($2))>0 OR
    strpos(lower(u.first_name),lower($2))>0 OR strpos(lower(u.last_name),lower($2))>0)`;

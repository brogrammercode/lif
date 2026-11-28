import type { SqlClient } from '../../database/postgres.service.js';

export type AccountEmail = {
  id: string;
  user_id: string;
  updated_at: Date;
  data: Record<string, unknown>;
};

export async function pendingAccountEmails(
  db: SqlClient,
  titles: string[],
  cutoff: Date,
) {
  const { rows } = await db.query<AccountEmail>(
    `SELECT id,user_id,updated_at,data FROM notifications
      WHERE channel='EMAIL' AND type='SYSTEM' AND title=ANY($1::text[]) AND sent_at IS NULL
        AND data->>'kind' IN ('ADMIN_NEW_USER_EMAIL','PARTNER_LIFECYCLE_EMAIL')
        AND (data->>'state'='PENDING' OR updated_at<$2)
      ORDER BY updated_at,id LIMIT 10`,
    [titles, cutoff],
  );
  return rows;
}

export async function claimAccountEmail(
  db: SqlClient,
  row: AccountEmail,
  data: Record<string, unknown>,
) {
  const result = await db.query(
    `UPDATE notifications SET data=$4::jsonb,updated_at=clock_timestamp()
      WHERE id=$1 AND sent_at IS NULL AND updated_at=$2 AND data=$3::jsonb`,
    [row.id, row.updated_at, JSON.stringify(row.data), JSON.stringify(data)],
  );
  return result.rowCount === 1;
}

export async function finishAccountEmail(
  db: SqlClient,
  id: string,
  claim: string,
  data: Record<string, unknown>,
  sent?: Date,
) {
  await db.query(
    `UPDATE notifications SET data=$3::jsonb,sent_at=$4,updated_at=clock_timestamp()
      WHERE id=$1 AND sent_at IS NULL AND data->>'claim'=$2`,
    [id, claim, JSON.stringify(data), sent],
  );
}

export async function activePartnerEmailSource(
  db: SqlClient,
  id: string,
  status: unknown,
) {
  const { rows } = await db.query<{ available: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM partner_applications a JOIN users u ON u.id=a.user_id
      WHERE a.id=$1 AND u.status='ACTIVE' AND u.deleted_at IS NULL
       AND ($2::text IS NULL OR a.status::text=$2)) AS available`,
    [id, typeof status === 'string' ? status : null],
  );
  return rows[0]?.available ?? false;
}

export async function accountEmailRecipient(
  db: SqlClient,
  id: string,
  email: string,
  application?: string,
) {
  const { rows } = await db.query<{ email: string | null }>(
    `SELECT u.email FROM users u WHERE u.id=$1 AND u.status='ACTIVE' AND u.deleted_at IS NULL
      AND (($3::text IS NULL AND u.role='ADMIN' AND lower(u.email)=lower($2))
        OR ($3 IS NOT NULL AND EXISTS(SELECT 1 FROM partner_applications a
          WHERE a.current_user_id=u.id AND a.id=$3 AND lower(a.contact_email)=lower($2))))`,
    [id, email, application],
  );
  return rows[0];
}

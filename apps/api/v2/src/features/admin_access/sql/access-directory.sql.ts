const googleAccount = `EXISTS (
  SELECT 1 FROM auth_accounts a WHERE a.user_id=u.id AND a.provider='GOOGLE'
)`;
const identity = `jsonb_build_object(
  'id',a.id, 'first_name',a.first_name, 'last_name',a.last_name,
  'email',a.email, 'avatar_url',a.avatar_url, 'role',a.role, 'status',a.status,
  'updated_at',a.updated_at, 'last_login_at',a.last_login_at, 'last_admin_login_at',a.last_admin_login_at,
  'has_google_account',a.has_google_account, 'access_version',g.updated_at, 'granted_at',g.granted_at,
  'granted_by', CASE WHEN by_account.id IS NOT NULL THEN jsonb_build_object('id',by_account.id,
    'first_name',by_account.first_name, 'last_name',by_account.last_name,
    'email',by_account.email, 'avatar_url',by_account.avatar_url) END,
  'login_audit', (SELECT l.after_data FROM user_logs l WHERE l.actor_id=a.id
    AND l.action='ADMIN_SIGN_IN' AND l.entity_type='Session' ORDER BY l.created_at DESC, l.id DESC LIMIT 1)
)`;
const grantJoins = `LEFT JOIN admin_access g ON g.user_id=a.id AND g.revoked_at IS NULL
  LEFT JOIN users by_account ON by_account.id=g.granted_by_id`;

export const accessAccountSql = `
  SELECT ${identity} AS data
  FROM (SELECT u.*, ${googleAccount} AS has_google_account FROM users u WHERE id=$1) a
  ${grantJoins}`;

export const accessDirectorySql = `
  WITH admins AS MATERIALIZED (
    SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url, u.role, u.status,
      u.updated_at, u.last_login_at, u.last_admin_login_at, u.created_at,
      ${googleAccount} AS has_google_account
    FROM users u WHERE u.role='ADMIN' AND u.deleted_at IS NULL AND u.status<>'DELETED'
  ), filtered AS MATERIALIZED (
    SELECT a.* FROM admins a
    WHERE ($1::text='all' OR a.status::text=$1)
      AND NOT EXISTS (SELECT 1 FROM unnest($2::text[]) AS t(term)
        WHERE NOT (a.id ILIKE '%' || t.term || '%'
          OR COALESCE(a.first_name, '') ILIKE '%' || t.term || '%'
          OR COALESCE(a.last_name, '') ILIKE '%' || t.term || '%'
          OR COALESCE(a.email, '') ILIKE '%' || t.term || '%'))
  ), bounds AS (
    SELECT count(*)::int AS total,
      LEAST($3::int, GREATEST(1, (count(*)::int + $4::int - 1) / $4::int)) AS page FROM filtered
  ), page_rows AS (
    SELECT f.* FROM filtered f ORDER BY f.created_at DESC, f.id ASC
    LIMIT $4 OFFSET (SELECT (page-1)*$4 FROM bounds)
  ), projected AS (
    SELECT a.created_at, a.id, ${identity} AS data FROM page_rows a ${grantJoins}
  )
  SELECT bounds.total, bounds.page,
    COALESCE((SELECT jsonb_agg(data ORDER BY created_at DESC, id ASC) FROM projected),'[]'::jsonb) AS admins,
    (SELECT jsonb_build_object('total_admins',count(*),
       'active_admins',count(*) FILTER (WHERE status='ACTIVE'),
       'awaiting_sign_in',count(*) FILTER (WHERE status='ACTIVE' AND NOT has_google_account)) FROM admins) AS stats
  FROM bounds`;

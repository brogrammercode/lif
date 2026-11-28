export const adminActivitySql = `
  WITH matches AS MATERIALIZED (
    SELECT a.*, CASE WHEN u.id IS NOT NULL THEN jsonb_build_object(
      'id', u.id, 'email', u.email, 'first_name', u.first_name, 'last_name', u.last_name,
      'avatar_url', u.avatar_url
    ) END AS actor
    FROM admin_activity a LEFT JOIN users u ON u.id=a.actor_id
    WHERE a.started_at>$1 AND (NULLIF($2::text,'') IS NULL OR a.actor_id=$2)
      AND ($3::text='all' OR ($3='success' AND a.status_code>=200 AND a.status_code<400)
        OR ($3='failure' AND a.status_code>=400) OR ($3='pending' AND a.completed_at IS NULL))
      AND ($4::text='all' OR ($4='reads' AND a.method IN ('GET','HEAD','OPTIONS'))
        OR ($4='changes' AND a.method NOT IN ('GET','HEAD','OPTIONS')))
      AND ($5::text='' OR a.path ILIKE '%'||$5||'%' OR a.request_id LIKE '%'||$5||'%'
        OR a.actor_id LIKE '%'||$5||'%' OR u.email ILIKE '%'||$5||'%'
        OR u.first_name ILIKE '%'||$5||'%' OR u.last_name ILIKE '%'||$5||'%'
        OR (CASE WHEN $6::text IS NULL THEN a.action ILIKE '%'||$5||'%'
          ELSE lower(a.action)=lower($6) END) OR lower(a.action)=ANY($7::text[]))
  ), bounds AS (
    SELECT count(*)::int AS total, LEAST($8::int,GREATEST(1,(count(*)::int + 19)/20)) AS page
    FROM matches
  ), page_rows AS (
    SELECT * FROM matches ORDER BY started_at DESC,id DESC
    LIMIT 20 OFFSET (SELECT (page-1)*20 FROM bounds)
  )
  SELECT total, page,
    COALESCE((SELECT jsonb_agg(p ORDER BY p.started_at DESC,p.id DESC) FROM page_rows p),'[]'::jsonb) AS activities
  FROM bounds`;

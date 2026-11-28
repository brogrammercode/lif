export const pruneAuditBatch = `
  WITH lease AS MATERIALIZED (
    SELECT pg_try_advisory_xact_lock(720092) AS acquired
  ), pruned_activity AS (
    DELETE FROM admin_activity WHERE id IN (
      SELECT id FROM admin_activity
      WHERE (SELECT acquired FROM lease) AND started_at <= $1
      ORDER BY started_at, id LIMIT $2 FOR UPDATE SKIP LOCKED
    ) RETURNING id
  ), pruned_user_logs AS (
    DELETE FROM user_logs WHERE id IN (
      SELECT id FROM user_logs
      WHERE (SELECT acquired FROM lease) AND created_at <= $1
      ORDER BY created_at, id LIMIT $2 FOR UPDATE SKIP LOCKED
    ) RETURNING id
  )
  SELECT (SELECT count(*)::int FROM pruned_activity) AS admin_activity,
    (SELECT count(*)::int FROM pruned_user_logs) AS user_logs
  FROM lease WHERE acquired`;

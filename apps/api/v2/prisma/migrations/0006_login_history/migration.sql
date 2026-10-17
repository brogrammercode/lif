-- Recover genuine login times from existing authentication events. Do not invent
-- timestamps for accounts without retained login events or touch updated_at.
WITH login_history AS (
  SELECT actor_id,
    MAX(created_at) AS last_login_at,
    MAX(created_at) FILTER (WHERE action = 'ADMIN_SIGN_IN') AS last_admin_login_at
  FROM user_logs
  WHERE actor_id IS NOT NULL AND action IN ('ADMIN_SIGN_IN', 'CREATE_SESSION')
  GROUP BY actor_id
)
UPDATE users AS account
SET last_login_at = CASE
      WHEN account.last_login_at IS NULL THEN history.last_login_at
      ELSE GREATEST(account.last_login_at, history.last_login_at)
    END,
    last_admin_login_at = CASE
      WHEN account.last_admin_login_at IS NULL THEN history.last_admin_login_at
      ELSE GREATEST(account.last_admin_login_at, history.last_admin_login_at)
    END
FROM login_history AS history
WHERE account.id = history.actor_id;

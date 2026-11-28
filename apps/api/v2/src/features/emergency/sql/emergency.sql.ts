const columns =
  'id, user_id, name, phone_e164, relationship, created_at, updated_at';

export const emergencySql = {
  list: `SELECT ${columns} FROM emergency_contacts WHERE user_id = $1 ORDER BY created_at ASC`,
  create: `INSERT INTO emergency_contacts (id, user_id, name, phone_e164, relationship, updated_at)
    VALUES ($1, $2, $3, $4, $5, clock_timestamp())
    RETURNING ${columns}`,
  lock: `SELECT ${columns} FROM emergency_contacts WHERE id = $1 AND user_id = $2 FOR UPDATE`,
  update: `UPDATE emergency_contacts
    SET name = $3, phone_e164 = $4, relationship = COALESCE($5, relationship), updated_at = clock_timestamp()
    WHERE id = $1 AND user_id = $2
    RETURNING ${columns}`,
  delete: `DELETE FROM emergency_contacts WHERE id = $1 AND user_id = $2 RETURNING ${columns}`,
};

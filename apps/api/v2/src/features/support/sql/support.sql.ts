const ticketColumns =
  'id, user_id, ride_id, status, priority, subject, created_at, updated_at, resolved_at';
const messageColumns =
  'id, ticket_id, author_id, body, attachments, created_at, updated_at';
const projection = `SELECT t.${ticketColumns.split(', ').join(', t.')},
  COALESCE(
    (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at)
      FROM (SELECT ${messageColumns} FROM support_messages WHERE ticket_id = t.id) m),
    '[]'::jsonb
  ) AS messages
  FROM support_tickets t`;

export const supportSql = {
  list: `${projection} WHERE t.user_id = $1 ORDER BY t.created_at DESC`,
  detail: `${projection} WHERE t.user_id = $1 AND t.id = $2`,
  ownedRide: `SELECT r.id FROM rides r LEFT JOIN driver_profiles d ON d.id = r.driver_id
    WHERE r.id = $1 AND (r.rider_id = $2 OR d.user_id = $2)`,
  createTicket: `INSERT INTO support_tickets (id, user_id, ride_id, subject, priority, updated_at)
    VALUES ($1, $2, $3, $4, $5::"TicketPriority", clock_timestamp()) RETURNING ${ticketColumns}`,
  createMessage: `INSERT INTO support_messages (id, ticket_id, author_id, body, updated_at)
    VALUES ($1, $2, $3, $4, clock_timestamp()) RETURNING ${messageColumns}`,
  reopenTicket: `UPDATE support_tickets SET status = 'OPEN', updated_at = clock_timestamp()
    WHERE id = $1 AND user_id = $2 RETURNING id`,
};

const user = `id, role, status, first_name, last_name, email, phone_e164, avatar_url,
  trim_scale(last_known_latitude)::text AS last_known_latitude,
  trim_scale(last_known_longitude)::text AS last_known_longitude,
  deleted_at, last_login_at, last_admin_login_at, created_at, updated_at, partner_activated_at`;
const place = `id, user_id, label, address, trim_scale(latitude)::text AS latitude,
  trim_scale(longitude)::text AS longitude, place_type, place_data, created_at, updated_at, community_place_id`;
const notification =
  'id, user_id, type, channel, title, body, data, read_at, sent_at, created_at, updated_at';
const ownedPlace = 'id=$1 AND user_id=$2';
const visible = (titles: '$2' | '$3') =>
  `NOT (channel='EMAIL' AND type='SYSTEM' AND title=ANY(${titles}::text[]))`;
const ownedNotification = `id=$1 AND user_id=$2 AND ${visible('$3')}`;

export const userSql = {
  lockProfile: `SELECT ${user} FROM users WHERE id=$1 FOR UPDATE`,
  profile: `UPDATE users SET first_name=COALESCE($2, first_name), last_name=COALESCE($3, last_name),
    phone_e164=COALESCE($4, phone_e164), avatar_url=COALESCE($5, avatar_url),
    updated_at=clock_timestamp() WHERE id=$1 RETURNING ${user}`,
  location: `UPDATE users SET last_known_latitude=$2, last_known_longitude=$3, updated_at=clock_timestamp()
    WHERE id=$1 RETURNING id, trim_scale(last_known_latitude)::text AS last_known_latitude,
    trim_scale(last_known_longitude)::text AS last_known_longitude`,
  places: `SELECT ${place} FROM saved_places WHERE user_id=$1 ORDER BY created_at DESC`,
  createPlace: `INSERT INTO saved_places (id, user_id, label, address, latitude, longitude, place_type, place_data, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, clock_timestamp()) RETURNING ${place}`,
  lockPlace: `SELECT ${place} FROM saved_places WHERE ${ownedPlace} FOR UPDATE`,
  updatePlace: `UPDATE saved_places SET label=$3, address=$4, latitude=$5, longitude=$6, place_type=$7,
    place_data=COALESCE($8::jsonb, place_data), updated_at=clock_timestamp()
    WHERE ${ownedPlace} RETURNING ${place}`,
  deletePlace: `DELETE FROM saved_places WHERE ${ownedPlace} RETURNING ${place}`,
  notifications: `SELECT ${notification} FROM notifications WHERE user_id=$1 AND ${visible('$2')}
    ORDER BY created_at DESC LIMIT 50`,
  lockNotification: `SELECT ${notification} FROM notifications WHERE ${ownedNotification} FOR UPDATE`,
  readNotification: `UPDATE notifications SET read_at=clock_timestamp(), updated_at=clock_timestamp()
    WHERE ${ownedNotification} RETURNING ${notification}`,
};

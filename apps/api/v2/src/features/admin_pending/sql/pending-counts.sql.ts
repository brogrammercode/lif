import {
  pending_application_sql,
  pending_confirmation_sql,
  pending_exit_sql,
  pending_vehicle_sql,
} from './pending-predicates.sql.js';
const active_owner = `u.deleted_at IS NULL AND u.status = 'ACTIVE'`;
const driver_owner = `${active_owner} AND (u.role='DRIVER' OR u.partner_activated_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM partner_applications excluded WHERE excluded.current_user_id=u.id AND excluded.status='EXITED')`;

export const pendingCountsSql = `SELECT
      (SELECT COUNT(*)::int FROM notifications WHERE channel='EMAIL' AND sent_at IS NULL AND data->>'kind'='ADMIN_NEW_USER_EMAIL' AND (data->>'state'='FAILED' OR updated_at<NOW()-INTERVAL '5 minutes')) AS signup_emails,
      (SELECT COUNT(*)::int FROM vehicle_brands WHERE status='REQUESTED') AS brands,
      (SELECT COUNT(*)::int FROM vehicle_models WHERE status='REQUESTED') AS models,
      (SELECT COUNT(*)::int FROM vehicles v JOIN driver_profiles d ON d.id=v.driver_id JOIN users u ON u.id=d.user_id WHERE ${driver_owner} AND ${pending_vehicle_sql}) AS vehicles,
      (SELECT COUNT(*)::int FROM partner_applications a JOIN users u ON u.id=a.user_id WHERE ${active_owner} AND ${pending_application_sql}) AS applications,
      (SELECT COUNT(*)::int FROM partner_applications a JOIN users u ON u.id=a.user_id WHERE ${active_owner} AND ${pending_confirmation_sql}) AS confirmations,
      (SELECT COUNT(*)::int FROM partner_exit_requests e JOIN partner_applications a ON a.id=e.application_id JOIN users u ON u.id=a.user_id WHERE ${active_owner} AND ${pending_exit_sql}) AS exits,
      (SELECT COUNT(*)::int FROM ride_settlement_reviews WHERE status IN ('REQUESTED','DISPUTED','APPROVED')) AS reviews,
      (SELECT COUNT(*)::int FROM partner_deliveries WHERE status='FAILED') +
      (SELECT COUNT(*)::int FROM notifications WHERE channel='EMAIL' AND sent_at IS NULL AND data->>'state'='FAILED') AS email_failures,
      (SELECT COUNT(*)::int FROM partner_applications WHERE status='COMPLETED' AND activation_attempts>=5) AS activation_locked`;
export { active_owner, driver_owner };

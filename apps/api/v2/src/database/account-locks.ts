import { AppError } from '../core/error.js';
import { ADMIN_ACCESS_LOCK } from '../features/admin_access/admin_access.constant.js';
import type { SqlClient } from './postgres.service.js';

export const ACCOUNT_LIFECYCLE_LOCK = 720050;

export async function requireDriverParticipation(
  tx: SqlClient,
  userId: string,
) {
  const { rows } = await tx.query<{ status: string }>(
    'SELECT status FROM partner_applications WHERE current_user_id=$1',
    [userId],
  );
  const status = rows[0]?.status;
  if (status === 'EXITED')
    throw new AppError(
      403,
      'DRIVER_EXITED',
      'Your partner exit is complete. Driver operations are disabled; your settlement document remains available.',
    );
  if (status && status !== 'ACTIVATED')
    throw new AppError(
      403,
      'DRIVER_ACTIVATION_REQUIRED',
      'Complete driver activation before using driver operations.',
    );
}

export async function requireActiveAccount(tx: SqlClient, userId: string) {
  await tx.query(
    'SELECT pg_advisory_xact_lock_shared($1::integer, hashtext($2))',
    [ACCOUNT_LIFECYCLE_LOCK, userId],
  );
  const { rows } = await tx.query<{
    status: string;
    deleted_at: Date | null;
    role: string;
  }>('SELECT status, deleted_at, role FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  if (!user || user.status !== 'ACTIVE' || user.deleted_at)
    throw new AppError(403, 'USER_INACTIVE', 'This account is not active.');
  return user;
}

export async function requireActiveAdmin(tx: SqlClient, userId: string) {
  await tx.query('SELECT pg_advisory_xact_lock_shared($1::integer)', [
    ADMIN_ACCESS_LOCK,
  ]);
  const user = await requireActiveAccount(tx, userId);
  if (user.role !== 'ADMIN')
    throw new AppError(
      403,
      'ADMIN_ACCESS_DENIED',
      'Administrator access is required.',
    );
}

export async function requireDriverWalletAccess(tx: SqlClient, userId: string) {
  await requireActiveAccount(tx, userId);
  await tx.query('SELECT pg_advisory_xact_lock(720061,hashtext($1))', [userId]);
  const {
    rows: [user],
  } = await tx.query<{
    role: string;
    partner_activated_at: Date | null;
    partner_status: string | null;
  }>(
    `SELECT u.role,u.partner_activated_at,a.status AS partner_status FROM users u
      LEFT JOIN partner_applications a ON a.current_user_id=u.id WHERE u.id=$1`,
    [userId],
  );
  if (
    !user ||
    (user.partner_status && user.partner_status !== 'ACTIVATED') ||
    (user.role !== 'DRIVER' && !user.partner_activated_at)
  )
    throw new AppError(
      403,
      'DRIVER_ACCESS_REQUIRED',
      'Driver access is required.',
    );
}

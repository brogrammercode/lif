import { AppError } from '../../core/error.js';
import type { TransactionClient } from './client.js';
import { ADMIN_ACCESS_LOCK } from '../../features/admin_access/admin_access.constant.js';
import { partner_lock } from '../../features/partner_program/partner_program.security.js';
export const ACCOUNT_LIFECYCLE_LOCK = 720050;
// Call again inside driver write locks, so an in-flight request cannot restore
// availability or accept a ride after the exit transaction completes.
export const require_driver_participation = async (
  tx: TransactionClient,
  user_id: string,
) => {
  const app = await tx.partnerApplication.findUnique({
    where: { current_user_id: user_id },
    select: { status: true },
  });
  if (app?.status === 'EXITED')
    throw new AppError(
      403,
      'DRIVER_EXITED',
      'Your partner exit is complete. Driver operations are disabled; your settlement document remains available.',
    );
  if (app && app.status !== 'ACTIVATED')
    throw new AppError(
      403,
      'DRIVER_ACTIVATION_REQUIRED',
      'Complete driver activation before using driver operations.',
    );
};
export const lock_account_for_write = async (
  tx: TransactionClient,
  user_id: string,
) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${ACCOUNT_LIFECYCLE_LOCK}::integer, hashtext(${user_id}))`;
};
export const require_active_account = async (
  tx: TransactionClient,
  user_id: string,
) => {
  await lock_account_for_write(tx, user_id);
  const user = await tx.user.findUnique({
    where: { id: user_id },
    select: { status: true, deleted_at: true, role: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.deleted_at)
    throw new AppError(403, 'USER_INACTIVE', 'This account is not active.');
  return user;
};

export const require_active_admin = async (
  tx: TransactionClient,
  user_id: string,
) => {
  // Use the same lock order as grant/revoke, sign-in and deactivation. Recheck
  // after any upload, immediately before the write transaction proceeds.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${ADMIN_ACCESS_LOCK})`;
  const user = await require_active_account(tx, user_id);
  if (user.role !== 'ADMIN')
    throw new AppError(
      403,
      'ADMIN_ACCESS_DENIED',
      'Administrator access is required.',
    );
};

export async function require_driver_wallet_access(
  tx: TransactionClient,
  user_id: string,
) {
  await require_active_account(tx, user_id);
  await partner_lock(tx, user_id);
  const user = await tx.user.findUniqueOrThrow({
    where: { id: user_id },
    select: {
      role: true,
      partner_activated_at: true,
      partner_application: { select: { status: true } },
    },
  });
  if (
    (user.partner_application &&
      user.partner_application.status !== 'ACTIVATED') ||
    (user.role !== 'DRIVER' && !user.partner_activated_at)
  ) {
    throw new AppError(
      403,
      'DRIVER_ACCESS_REQUIRED',
      'Driver access is required.',
    );
  }
}

import { AppError } from '../../core/error.js';
import type { TransactionClient } from './client.js';
import { ADMIN_ACCESS_LOCK } from '../../features/admin_access/admin_access.constant.js';
export const ACCOUNT_LIFECYCLE_LOCK = 720050;
// Call again inside driver write locks, so an in-flight request cannot restore
// availability or accept a ride after the exit transaction completes.
export const require_driver_participation = async (
  tx: TransactionClient,
  user_id: string,
) => {
  const app = await tx.partnerApplication.findUnique({
    where: { user_id },
    select: { status: true },
  });
  if (app?.status === 'EXITED')
    throw new AppError(
      403,
      'DRIVER_EXITED',
      'Your partner exit is complete. Driver operations are disabled; your settlement document remains available.',
    );
};
export const require_active_account = async (
  tx: TransactionClient,
  user_id: string,
) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${ACCOUNT_LIFECYCLE_LOCK}::integer, hashtext(${user_id}))`;
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

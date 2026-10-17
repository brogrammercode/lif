export const ADMIN_ACCESS_LOCK = 720048;
export const ADMIN_ACCESS_ROUTE = 'admin/access/1more-admin';
export const ADMIN_ACCESS_TRANSACTION = {
  maxWait: 10000,
  timeout: 30000,
} as const;
export const ADMIN_ACCESS_MESSAGES = {
  LOADED: 'Administrator access retrieved',
  GRANTED: 'Administrator access updated',
  REVOKED: 'Administrator access removed',
  INACTIVE: 'Only an active account can receive administrator access.',
  NOT_FOUND: 'This account was not found.',
  AMBIGUOUS:
    'More than one account uses this email. Resolve the duplicate accounts before granting access.',
  SELF_REVOKE: 'Ask another administrator to remove your access.',
  LAST_ADMIN: 'Keep at least one active administrator.',
  CONFLICT: 'This account changed. Refresh the list before removing access.',
} as const;

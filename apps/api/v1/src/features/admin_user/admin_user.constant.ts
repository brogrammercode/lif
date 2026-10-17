export const ADMIN_USERS_ROUTE = '/admin/users';
export const ADMIN_USER_MESSAGES = {
  NOT_FOUND: 'User was not found',
  UPDATED: 'Personal details saved',
  CONFLICT:
    'This user changed since you opened the form. Reload their details before saving again.',
  PHONE_EXISTS: 'This phone number is already used by another user',
} as const;

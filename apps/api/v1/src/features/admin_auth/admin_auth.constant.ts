import { API_PREFIX } from '../../core/constants.js';

export const ADMIN_AUTH_ROUTE = '/admin/auth';
export const ADMIN_COOKIE = 'lif_admin_refresh';
export const ADMIN_COOKIE_PATH = `${API_PREFIX}${ADMIN_AUTH_ROUTE}`;
export const ADMIN_AUTH_MESSAGES = {
  DENIED:
    'This account does not have access to 1More Admin. Contact your administrator.',
  ORIGIN: 'This browser origin is not allowed to access the admin session.',
  EXPIRED: 'Your admin session has ended. Please sign in again.',
  RATE_LIMIT: 'Too many sign-in attempts. Please wait a minute and try again.',
  SIGNED_IN: 'Admin signed in',
  RESTORED: 'Admin session restored',
  SIGNED_OUT: 'Admin signed out',
  PROFILE: 'Admin profile loaded',
} as const;

import { ADMIN_ACCESS_ROUTE } from './admin_access.constant.js';
export const ADMIN_ACCESS_ROUTES = {
  LIST: ADMIN_ACCESS_ROUTE,
  GRANT: ADMIN_ACCESS_ROUTE,
  REVOKE: `${ADMIN_ACCESS_ROUTE}/:id`,
} as const;

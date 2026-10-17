export const ADMIN_USER_ROUTES = {
  LIST: ['admin/users'],
  DETAIL: ['admin/users/:id'],
  UPDATE: ['admin/users/:id'],
} satisfies Record<string, string[]>;

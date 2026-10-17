export const ADMIN_AUTH_ROUTES = {
  GOOGLE: ['admin/auth/google'],
  REFRESH: ['admin/auth/refresh'],
  LOGOUT: ['admin/auth/logout'],
  ME: ['admin/auth/me'],
} satisfies Record<string, string[]>;

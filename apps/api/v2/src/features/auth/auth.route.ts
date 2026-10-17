export const AUTH_ROUTES = {
  GOOGLE_LOGIN: ['auth/google'],
  REFRESH: ['auth/refresh'],
  CURRENT_USER: ['auth/me', 'me'],
  REVOKE: ['auth/logout'],
} satisfies Record<string, string[]>;

import type { verify_google_identity } from '../auth/auth.security.js';

export type SessionRequest = { user_agent?: string; ip_address?: string };
export type AdminIdentity = Awaited<ReturnType<typeof verify_google_identity>>;

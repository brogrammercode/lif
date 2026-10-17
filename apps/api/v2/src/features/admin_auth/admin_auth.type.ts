import type { verify_google_identity } from '../auth/auth.security.js';
import { external_login_schema } from '../auth/auth.type.js';
import {
  browser_location_schema,
  type BrowserLocation,
  type LoginLocation,
} from '../../infra/security/login_location.js';
export const admin_login_schema = external_login_schema.extend({
  browser_location: browser_location_schema.optional(),
});
export type SessionRequest = {
  user_agent?: string;
  ip_address?: string;
  browser_location?: BrowserLocation;
  login_location?: LoginLocation;
};
export type AdminIdentity = Awaited<ReturnType<typeof verify_google_identity>>;

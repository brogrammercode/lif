import type { AuthTokenPayload } from '../infra/security/token.js';
declare global {
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
      request_id?: string;
      raw_body?: Buffer;
      admin_actor_id?: string;
      admin_activity_id?: string;
    }
  }
}
export {};

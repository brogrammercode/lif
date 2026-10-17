import type { AuthTokenPayload } from '../infra/security/token.js';
declare global {
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
      request_id?: string;
      raw_body?: Buffer;
    }
  }
}
export {};

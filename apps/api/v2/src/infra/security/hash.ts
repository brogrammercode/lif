import { createHash, randomBytes } from 'node:crypto';
export const create_token_hash = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
export const create_refresh_token = (): string =>
  randomBytes(48).toString('base64url');
export const create_otp_hash = (code: string): string =>
  createHash('sha256').update(code).digest('hex');

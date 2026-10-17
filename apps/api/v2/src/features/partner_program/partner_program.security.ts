import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { TransactionClient } from '../../infra/database/client.js';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';

export const partner_lock = async (tx: TransactionClient, user_id: string) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(720061, hashtext(${user_id}))`;
};
const encryption_key = () =>
  createHash('sha256')
    .update(`partner-activation:${config.JWT_SECRET}`)
    .digest();
export const create_activation = () => {
  const code = randomInt(100000, 1000000).toString();
  const salt = randomBytes(16).toString('hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryption_key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(code, 'utf8'),
    cipher.final(),
  ]);
  return {
    activation_hash: scryptSync(code, salt, 64).toString('hex'),
    activation_salt: salt,
    activation_ciphertext: [
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      encrypted.toString('hex'),
    ].join('.'),
    activation_attempts: 0,
    activation_issued_at: new Date(),
  };
};
export const reveal_activation = (encrypted: string) => {
  try {
    const [iv, tag, bytes] = encrypted.split('.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryption_key(),
      Buffer.from(iv!, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tag!, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(bytes!, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new AppError(
      503,
      'ACTIVATION_KEY_CHANGED',
      'The activation encryption key changed. Restore the signing secret used when this code was issued.',
    );
  }
};
export const matches_activation = (
  code: string,
  salt: string,
  expected: string,
) => {
  const hash = Buffer.from(expected, 'hex');
  const received = scryptSync(code, salt, 64);
  return hash.length === received.length && timingSafeEqual(hash, received);
};

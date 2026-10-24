import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';

export const ACTIVE_TRIP = [
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_WAITING',
  'IN_PROGRESS',
] as const;
export const trip_distance_m = (a: number, b: number, c: number, d: number) => {
  const radians = (n: number) => (n * Math.PI) / 180;
  const value =
    Math.sin(radians(c - a) / 2) ** 2 +
    Math.cos(radians(a)) *
      Math.cos(radians(c)) *
      Math.sin(radians(d - b) / 2) ** 2;
  return (
    6371000 *
    2 *
    Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)))
  );
};
export const search_radius_km = (
  age_s: number,
  initial: number,
  maximum: number,
  expansion_s: number,
) =>
  Math.min(
    maximum,
    initial * 2 ** Math.min(20, Math.floor(Math.max(0, age_s) / expansion_s)),
  );

const key = () =>
  createHash('sha256').update(`ride-start:${config.JWT_SECRET}`).digest();
const hash = (ride_id: string, code: string) =>
  createHmac('sha256', key()).update(`${ride_id}:${code}`).digest('hex');
export const new_trip_code = (ride_id: string) => {
  const code = randomInt(100000, 1000000).toString();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const bytes = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return {
    code_hash: hash(ride_id, code),
    code_ciphertext: `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${bytes.toString('hex')}`,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
  };
};
export const matches_trip_code = (
  ride_id: string,
  code: string,
  expected: string,
) => {
  const actual = Buffer.from(hash(ride_id, code), 'hex');
  const saved = Buffer.from(expected, 'hex');
  return actual.length === saved.length && timingSafeEqual(actual, saved);
};
export const reveal_trip_code = (ciphertext: string) => {
  try {
    const [iv, tag, text] = ciphertext.split('.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key(),
      Buffer.from(iv!, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tag!, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(text!, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new AppError(
      503,
      'TRIP_CODE_UNAVAILABLE',
      'The trip verification key is unavailable. Contact support.',
    );
  }
};

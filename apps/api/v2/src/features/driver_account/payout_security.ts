import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { config } from '../../core/config.js';
import { payout_details, type PayoutDetails } from './driver_account.type.js';
const key = () =>
  createHash('sha256')
    .update('driver-payout-v1:' + config.JWT_SECRET)
    .digest();
export function seal_payout(details: PayoutDetails) {
  const iv = randomBytes(12),
    c = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([
    c.update(JSON.stringify(details), 'utf8'),
    c.final(),
  ]);
  return [iv, c.getAuthTag(), encrypted]
    .map((v) => v.toString('base64url'))
    .join('.');
}
export function reveal_payout(value: string): PayoutDetails {
  const parts = value.split('.');
  if (parts.length !== 3 || parts.some((v) => !/^[A-Za-z0-9_-]+$/.test(v)))
    throw new Error('Invalid payout ciphertext');
  const [iv, tag, data] = parts.map((v) => Buffer.from(v, 'base64url'));
  if (
    !iv ||
    iv.length !== 12 ||
    !tag ||
    tag.length !== 16 ||
    !data ||
    parts.some(
      (v, i) => Buffer.from(v, 'base64url').toString('base64url') !== parts[i],
    )
  )
    throw new Error('Invalid payout ciphertext');
  const c = createDecipheriv('aes-256-gcm', key(), iv);
  c.setAuthTag(tag);
  return payout_details.parse(
    JSON.parse(Buffer.concat([c.update(data), c.final()]).toString('utf8')),
  );
}
export const mask_payout = (v: PayoutDetails) => ({
  holder_name: v.holder_name,
  upi: v.upi ? '***@' + v.upi.split('@')[1] : null,
  account_number: v.account_number ? '****' + v.account_number.slice(-4) : null,
  ifsc: v.ifsc ?? null,
});

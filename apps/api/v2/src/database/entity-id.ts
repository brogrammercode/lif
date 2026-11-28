import { randomBytes } from 'node:crypto';

// Preserve timestamp ordering while distinguishing concurrent API instances.
const instanceSuffix = randomBytes(8)
  .readBigUInt64BE()
  .toString()
  .padStart(20, '0');
let lastEntityId = 0;

export function nextEntityId(): string {
  lastEntityId = Math.max(Date.now(), lastEntityId + 1);
  return String(lastEntityId) + instanceSuffix;
}

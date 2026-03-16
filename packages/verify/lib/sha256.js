// Node.js native SHA-256 -- replaces Web Crypto version from src/warc.js
import { createHash } from 'node:crypto';

export function sha256(data) {
  const hex = createHash('sha256').update(data).digest('hex');
  return `sha256:${hex}`;
}

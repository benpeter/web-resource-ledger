// tva
// landing/public/.well-known/security.txt (RFC 9116): the reporting channel
// for security researchers. Expires is required and has to be renewed; this
// test fails 30 days before the date so the renewal happens in time.
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const root = join(import.meta.dirname, '..');
const path = join(root, 'landing/public/.well-known/security.txt');

function fields() {
  const text = readFileSync(path, 'utf8');
  return Object.fromEntries(text.split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]));
}

describe('security.txt', () => {
  it('exists on the landing site with a contact and its canonical address', () => {
    expect(existsSync(path)).toBe(true);
    const f = fields();
    expect(f.Contact).toMatch(/^(https:\/\/|mailto:)/);
    expect(f.Canonical).toBe('https://webresourceledger.com/.well-known/security.txt');
  });

  it('points its policy at SECURITY.md', () => {
    const f = fields();
    expect(f.Policy).toBe('https://github.com/benpeter/web-resource-ledger/blob/main/SECURITY.md');
    expect(existsSync(join(root, 'SECURITY.md'))).toBe(true);
  });

  it('expires more than 30 days and less than a year from now', () => {
    const expires = Date.parse(fields().Expires);
    const days = (expires - Date.now()) / 86400000;
    expect({ expires: fields().Expires, renewSoon: days < 30 }).toEqual({ expires: fields().Expires, renewSoon: false });
    expect(days).toBeLessThan(366);
  });
});

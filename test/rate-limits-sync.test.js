// tva
// RATE_LIMITS.verify, .admin and .auth only set the X-RateLimit-Limit header;
// the wrangler.toml bindings do the limiting. The two drifted apart (auth said
// 20 and account 30 while AUTH_RATE_LIMITER allows 10). Reads wrangler.toml as
// text, like mcp-sync.test.js reads its sources.
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { RATE_LIMITS } from '../src/rate-limits.js';

const wranglerPath = resolve(dirname(fileURLToPath(import.meta.url)), '../wrangler.toml');

const BINDING_FOR_GROUP = {
  verify: 'VERIFY_RATE_LIMITER',
  admin: 'ADMIN_RATE_LIMITER',
  auth: 'AUTH_RATE_LIMITER',
};

describe('RATE_LIMITS header values', () => {
  it('match the wrangler.toml bindings, production and staging', () => {
    const toml = readFileSync(wranglerPath, 'utf8');
    const bindings = [...toml.matchAll(/name = "(\w+)"\ntype = "ratelimit"\nnamespace_id = "\d+"\nsimple = \{ limit = (\d+), period = (\d+) \}/g)];
    expect(bindings.length).toBeGreaterThan(10);
    const mismatches = [];
    for (const [group, binding] of Object.entries(BINDING_FOR_GROUP)) {
      const found = bindings.filter(([, name]) => name === binding);
      expect(found.length).toBe(2);
      for (const [, , limit, period] of found) {
        if (Number(limit) !== RATE_LIMITS[group].limit || Number(period) !== RATE_LIMITS[group].period) {
          mismatches.push(`${group}: RATE_LIMITS says ${RATE_LIMITS[group].limit}/${RATE_LIMITS[group].period}s, ${binding} is ${limit}/${period}s`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

// docs/INTERNALS.md states every limiter twice, in the bindings table and the
// Rate Limiters table; the bindings table said ADMIN_RATE_LIMITER allows 5 req/60s
// while wrangler.toml and the other table said 30.
describe('docs/INTERNALS.md rate limiter values', () => {
  it('match the wrangler.toml bindings in both tables', () => {
    const toml = readFileSync(wranglerPath, 'utf8');
    const internals = readFileSync(resolve(dirname(wranglerPath), 'docs/INTERNALS.md'), 'utf8');
    const bindings = [...toml.matchAll(/name = "(\w+)"\ntype = "ratelimit"\nnamespace_id = "\d+"\nsimple = \{ limit = (\d+), period = (\d+) \}/g)];
    const rows = [...internals.matchAll(/^\| `(\w+)` \|[^\n]*?(\d+) req\/(\d+)s/gm)];
    const names = new Set(bindings.map(([, name]) => name));
    expect(names.size).toBe(6);
    const mismatches = [];
    for (const name of names) {
      const [, , limit, period] = bindings.find(([, n]) => n === name);
      const found = rows.filter(([, n]) => n === name);
      expect({ name, rows: found.length }).toEqual({ name, rows: 2 });
      for (const [, , docLimit, docPeriod] of found) {
        if (docLimit !== limit || docPeriod !== period) {
          mismatches.push(`${name}: INTERNALS says ${docLimit}/${docPeriod}s, wrangler.toml ${limit}/${period}s`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

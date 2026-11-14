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

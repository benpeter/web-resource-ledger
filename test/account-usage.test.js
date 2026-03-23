// tva
// Integration tests for GET /v1/account/usage endpoint.
// Uses SELF.fetch() -- requests go through the real worker.
// D1 is real (miniflare-backed). Session auth via createTestSession().

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanDb, createTestSession, seedUsageCounter } from './fixtures.js';
import { TIER_QUOTAS, DEFAULT_TIER } from '../src/quotas.js';
import { computePeriod } from '../src/db.js';

const USAGE_URL = 'https://worker.test/v1/account/usage';

let ipCounter = 200; // Distinct range from other test files
function nextIp() {
  return `10.0.2.${ipCounter++}`;
}

/**
 * Create a test session with ToS accepted.
 * All /v1/account/* routes (except /tos and /first-key) require tosAcceptedAt.
 */
async function createTosSession(overrides = {}) {
  const session = await createTestSession(env.DB, env, overrides);
  // Mark ToS as accepted in github_users so the session gate lets us through
  await env.DB.prepare(
    "UPDATE github_users SET tos_accepted_at = '2026-01-01T00:00:00.000Z', tos_version = '1.0' WHERE github_id = ?",
  ).bind(session.githubId).run();
  return session;
}

beforeEach(async () => {
  await cleanDb(env.DB);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('GET /v1/account/usage -- auth', () => {
  const ip = nextIp();

  it('returns 401 without a session cookie', async () => {
    const res = await SELF.fetch(USAGE_URL, {
      headers: { 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with a malformed session cookie', async () => {
    const res = await SELF.fetch(USAGE_URL, {
      headers: {
        Cookie: '__Host-wrl_session=notvalid',
        'CF-Connecting-IP': ip,
      },
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 with a valid session cookie', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: {
        Cookie: cookie,
        'CF-Connecting-IP': ip,
      },
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe('GET /v1/account/usage -- response shape', () => {
  const ip = nextIp();

  it('returns correct Content-Type', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('returns Cache-Control: private, no-store', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('response body has exactly the expected top-level fields', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ['captures', 'period', 'resetsAt', 'storageBytes', 'tenantId', 'tierDisplay'].sort(),
    );
  });

  it('captures object has used, limit, remaining fields', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const { captures } = await res.json();
    expect(typeof captures.used).toBe('number');
    expect(typeof captures.limit).toBe('number');
    expect(typeof captures.remaining).toBe('number');
  });

  it('storageBytes object has used, limit, remaining fields', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const { storageBytes } = await res.json();
    expect(typeof storageBytes.used).toBe('number');
    expect(typeof storageBytes.limit).toBe('number');
    expect(typeof storageBytes.remaining).toBe('number');
  });

  it('resetsAt is a valid ISO 8601 timestamp', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const { resetsAt } = await res.json();
    expect(new Date(resetsAt).toISOString()).toBe(resetsAt);
  });
});

// ---------------------------------------------------------------------------
// Tier display and quota limits
// ---------------------------------------------------------------------------

describe('GET /v1/account/usage -- tier display', () => {
  const ip = nextIp();

  it('free tenant shows tierDisplay "Starter"', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(body.tierDisplay).toBe('Starter');
  });

  it('does not expose the internal tier name in the response', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    // 'free' or 'pro' should not appear as a top-level field
    expect(Object.keys(body)).not.toContain('tier');
  });

  it('captures.limit equals free tier quota for free tenant', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(body.captures.limit).toBe(TIER_QUOTAS.free.capturesPerMonth);
  });

  it('storageBytes.limit equals free tier quota for free tenant', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(body.storageBytes.limit).toBe(TIER_QUOTAS.free.storageBytes);
  });

  it('pro tenant shows tierDisplay "Pro" with pro quota limits', async () => {
    const { cookie, tenantId } = await createTosSession();
    // Upgrade tenant to pro
    await env.DB.prepare('UPDATE tenants SET tier = ? WHERE id = ?').bind('pro', tenantId).run();

    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(body.tierDisplay).toBe('Pro');
    expect(body.captures.limit).toBe(TIER_QUOTAS.pro.capturesPerMonth);
    expect(body.storageBytes.limit).toBe(TIER_QUOTAS.pro.storageBytes);
  });
});

// ---------------------------------------------------------------------------
// Zero usage
// ---------------------------------------------------------------------------

describe('GET /v1/account/usage -- zero usage', () => {
  const ip = nextIp();

  it('returns 0 for captures.used when tenant has no usage row', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(body.captures.used).toBe(0);
    expect(body.storageBytes.used).toBe(0);
  });

  it('remaining equals limit when usage is zero', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(body.captures.remaining).toBe(body.captures.limit);
    expect(body.storageBytes.remaining).toBe(body.storageBytes.limit);
  });
});

// ---------------------------------------------------------------------------
// Usage data -- non-zero
// ---------------------------------------------------------------------------

describe('GET /v1/account/usage -- usage data', () => {
  const ip = nextIp();

  it('returns seeded usage for current period', async () => {
    const { cookie, tenantId } = await createTosSession();
    const period = computePeriod();

    await seedUsageCounter(env.DB, {
      tenantId,
      period,
      captureCount: 42,
      storageBytes: 123456,
    });

    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(body.captures.used).toBe(42);
    expect(body.storageBytes.used).toBe(123456);
    expect(body.period).toBe(period);
  });

  it('remaining is correctly computed as limit minus used', async () => {
    const { cookie, tenantId } = await createTosSession();
    const period = computePeriod();

    await seedUsageCounter(env.DB, { tenantId, period, captureCount: 30, storageBytes: 0 });

    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(body.captures.remaining).toBe(TIER_QUOTAS.free.capturesPerMonth - 30);
  });

  it('remaining is 0 (not negative) when usage exceeds the limit', async () => {
    const { cookie, tenantId } = await createTosSession();
    const period = computePeriod();

    // Seed usage beyond the free tier capture limit
    const overLimit = TIER_QUOTAS.free.capturesPerMonth + 10;
    await seedUsageCounter(env.DB, { tenantId, period, captureCount: overLimit });

    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(body.captures.remaining).toBe(0);
  });

  it('storageBytes.remaining is 0 (not negative) when at storage limit', async () => {
    const { cookie, tenantId } = await createTosSession();
    const period = computePeriod();

    await seedUsageCounter(env.DB, {
      tenantId,
      period,
      storageBytes: TIER_QUOTAS.free.storageBytes,
    });

    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(body.storageBytes.remaining).toBe(0);
    // used and limit should still be accurate
    expect(body.storageBytes.used).toBe(TIER_QUOTAS.free.storageBytes);
    expect(body.storageBytes.limit).toBe(TIER_QUOTAS.free.storageBytes);
  });

  it('tenantId in response matches the session tenant', async () => {
    const { cookie, tenantId } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(body.tenantId).toBe(tenantId);
  });

  it('period in response is current YYYY-MM period', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    expect(body.period).toBe(computePeriod());
  });
});

// ---------------------------------------------------------------------------
// resetsAt
// ---------------------------------------------------------------------------

describe('GET /v1/account/usage -- resetsAt', () => {
  const ip = nextIp();

  it('resetsAt is the first of next month at UTC midnight', async () => {
    const { cookie } = await createTosSession();
    const res = await SELF.fetch(USAGE_URL, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip },
    });
    const body = await res.json();
    const d = new Date(body.resetsAt);
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
  });
});

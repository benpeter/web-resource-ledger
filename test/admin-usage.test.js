// tva
// Integration tests for GET /v1/admin/usage endpoint.
// Uses SELF.fetch() -- all requests go through the real worker.
// D1 is real (miniflare-backed). ADMIN_KEY is injected via vitest.config.js.
//
// IMPORTANT: Admin rate limiter is 5 req/60s per IP (wrangler.toml).
// Each describe block uses a distinct CF-Connecting-IP to avoid cross-test
// rate limit exhaustion.

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { TEST_ADMIN_KEY, cleanDb, seedUsageCounter } from './fixtures.js';
import { computePeriod } from '../src/db.js';

const ADMIN_AUTH = `Bearer ${TEST_ADMIN_KEY}`;

let ipCounter = 100; // Start at 100 to not collide with admin-keys.test.js
function nextIp() {
  return `192.0.2.${ipCounter++}`;
}

function makeGet(ip) {
  return (query = '') => SELF.fetch(`https://worker.test/v1/admin/usage${query}`, {
    headers: {
      Authorization: ADMIN_AUTH,
      'CF-Connecting-IP': ip,
    },
  });
}

beforeEach(async () => {
  await cleanDb(env.DB);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('GET /v1/admin/usage — auth', () => {
  const ip = nextIp();

  it('returns 401 without auth header', async () => {
    const res = await SELF.fetch('https://worker.test/v1/admin/usage?tenant=default', {
      headers: { 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong admin key', async () => {
    const res = await SELF.fetch('https://worker.test/v1/admin/usage?tenant=default', {
      headers: {
        Authorization: 'Bearer wrong-key',
        'CF-Connecting-IP': ip,
      },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('GET /v1/admin/usage — validation', () => {
  const get = makeGet(nextIp());

  it('returns 400 when tenant param is missing', async () => {
    const res = await get();
    expect(res.status).toBe(400);
  });

  it('returns 400 when tenant param has invalid characters', async () => {
    const res = await get('?tenant=INVALID!');
    expect(res.status).toBe(400);
  });

  it('returns 400 when period has invalid format', async () => {
    const res = await get('?tenant=default&period=2026-3');
    expect(res.status).toBe(400);
  });

  it('returns 404 when tenant does not exist', async () => {
    const res = await get('?tenant=nonexistent');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Success responses
// ---------------------------------------------------------------------------

describe('GET /v1/admin/usage — success responses', () => {
  const get = makeGet(nextIp());

  it('returns zero-defaults for tenant with no usage data', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('test-tenant').run();

    const res = await get('?tenant=test-tenant');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.captureCount).toBe(0);
    expect(body.storageBytes).toBe(0);
    expect(body.apiCallCount).toBe(0);
    expect(body.updatedAt).toBeNull();
  });

  it('returns seeded usage data for queried period', async () => {
    await seedUsageCounter(env.DB, {
      tenantId: 'default',
      period: '2026-03',
      captureCount: 10,
      storageBytes: 5000,
      apiCallCount: 20,
    });

    const res = await get('?tenant=default&period=2026-03');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.captureCount).toBe(10);
    expect(body.storageBytes).toBe(5000);
    expect(body.apiCallCount).toBe(20);
  });

  it('returns current period when period param is omitted', async () => {
    const currentPeriod = computePeriod();

    await seedUsageCounter(env.DB, {
      tenantId: 'default',
      period: currentPeriod,
      captureCount: 7,
      storageBytes: 1234,
      apiCallCount: 3,
    });

    const res = await get('?tenant=default');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.captureCount).toBe(7);
    expect(body.storageBytes).toBe(1234);
    expect(body.apiCallCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Period filtering
// ---------------------------------------------------------------------------

describe('GET /v1/admin/usage — period filtering', () => {
  const get = makeGet(nextIp());

  it('returns data for the queried period only', async () => {
    await seedUsageCounter(env.DB, { tenantId: 'default', period: '2026-03', captureCount: 30 });
    await seedUsageCounter(env.DB, { tenantId: 'default', period: '2026-02', captureCount: 15 });

    const res = await get('?tenant=default&period=2026-02');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.captureCount).toBe(15);
    expect(body.period).toBe('2026-02');
  });

  it('returns zeros for period with no data', async () => {
    await seedUsageCounter(env.DB, { tenantId: 'default', period: '2026-03', captureCount: 30 });

    const res = await get('?tenant=default&period=2026-01');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.captureCount).toBe(0);
    expect(body.storageBytes).toBe(0);
    expect(body.apiCallCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe('GET /v1/admin/usage — response shape', () => {
  const get = makeGet(nextIp());

  it('response is JSON with correct Content-Type', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('default').run();

    const res = await get('?tenant=default');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('response includes Cache-Control: private, no-store', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('default').run();

    const res = await get('?tenant=default');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('response body has exactly the expected fields', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('default').run();

    const res = await get('?tenant=default');
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ['apiCallCount', 'captureCount', 'period', 'storageBytes', 'tenantId', 'updatedAt'].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('GET /v1/admin/usage — edge cases', () => {
  const get = makeGet(nextIp());

  it('returns 404 for non-existent tenant even with valid period', async () => {
    const res = await get('?tenant=ghost-tenant&period=2026-03');
    expect(res.status).toBe(404);
  });

  it('handles tenant with hyphens and underscores', async () => {
    await seedUsageCounter(env.DB, {
      tenantId: 'my-test_tenant',
      period: '2026-03',
      captureCount: 5,
      storageBytes: 999,
      apiCallCount: 2,
    });

    const res = await get('?tenant=my-test_tenant&period=2026-03');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe('my-test_tenant');
    expect(body.captureCount).toBe(5);
    expect(body.storageBytes).toBe(999);
    expect(body.apiCallCount).toBe(2);
  });
});

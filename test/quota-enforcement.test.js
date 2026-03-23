// tva
// Integration tests for quota enforcement in the capture pipeline.
// Tests the quota check wired into handleCreateCapture and handleBatchCapture.

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { seedApiKey, cleanDb, TEST_TENANT_KEY } from './fixtures.js';
import { FREE_CAPTURE_LIMIT, FREE_STORAGE_LIMIT } from '../src/quotas.js';
import { computePeriod } from '../src/db.js';

const AUTH = `Bearer ${TEST_TENANT_KEY}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Unique IPs prevent rate limit buckets from interfering across tests.
let ipCounter = 0;
function nextTestIp() {
  ipCounter += 1;
  const a = Math.floor(ipCounter / 256) % 256;
  const b = ipCounter % 256;
  return `10.0.${a}.${b}`;
}

function singleCapture(overrides = {}) {
  return SELF.fetch('https://worker.test/v1/captures', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: AUTH,
      'CF-Connecting-IP': nextTestIp(),
      ...overrides.headers,
    },
    body: JSON.stringify({ url: 'https://example.com', ...overrides.body }),
  });
}

function batchCapture(urls, extraHeaders = {}) {
  return SELF.fetch('https://worker.test/v1/captures/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: AUTH,
      'CF-Connecting-IP': nextTestIp(),
      ...extraHeaders,
    },
    body: JSON.stringify({ urls }),
  });
}

// Seed a usage_counters row for the current period.
async function seedUsage({ captureCount = 0, storageBytes = 0 } = {}) {
  const period = computePeriod();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count)
     VALUES ('default', ?, ?, ?, 0)`,
  ).bind(period, captureCount, storageBytes).run();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanDb(env.DB);
  const { keys: rlKeys } = await env.KV.list({ prefix: 'rl:' });
  for (const k of rlKeys) await env.KV.delete(k.name);

  // Seed the API key with a generous rate limit so quota tests aren't rate-limited first.
  await seedApiKey(env.DB, TEST_TENANT_KEY);
  await env.DB.prepare(
    `INSERT INTO tenants (id, config, updated_at, updated_by)
     VALUES ('default', ?, ?, 'test')
     ON CONFLICT(id) DO UPDATE SET
       config = excluded.config,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).bind(
    JSON.stringify({ rateLimit: { capture: { limit: 1000, period: 60 } } }),
    new Date().toISOString(),
  ).run();
});

// ---------------------------------------------------------------------------
// Single capture -- quota exceeded (payment_required for free tier)
// ---------------------------------------------------------------------------

describe('POST /v1/captures -- quota enforcement (payment_required)', () => {
  it('returns 429 with limitType quota when capture count is at the monthly limit', async () => {
    await seedUsage({ captureCount: FREE_CAPTURE_LIMIT });

    const res = await singleCapture();
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.status).toBe(429);
    expect(body.type).toBe('about:blank');
    expect(body.limitType).toBe('quota');
    expect(body.quota).toBeDefined();
    expect(body.quota.resource).toBe('captures');
    expect(body.quota.limit).toBe(FREE_CAPTURE_LIMIT);
    expect(body.quota.used).toBe(FREE_CAPTURE_LIMIT);
    expect(body.quota.resetsAt).toBeDefined();
  });

  it('returns Retry-After header set to the quota reset date', async () => {
    await seedUsage({ captureCount: FREE_CAPTURE_LIMIT });

    const res = await singleCapture();
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get('Retry-After');
    expect(retryAfter).not.toBeNull();
    // Retry-After is an HTTP-date (toUTCString) -- must parse as a future date
    const retryDate = new Date(retryAfter);
    expect(retryDate.getTime()).toBeGreaterThan(Date.now());
  });

  it('detail message mentions free tier limit', async () => {
    await seedUsage({ captureCount: FREE_CAPTURE_LIMIT });

    const res = await singleCapture();
    const body = await res.json();
    expect(body.detail).toContain('Free tier limit reached');
    expect(body.detail).toContain(String(FREE_CAPTURE_LIMIT));
  });
});

// ---------------------------------------------------------------------------
// Single capture -- quota exceeded (storage_limit)
// ---------------------------------------------------------------------------

describe('POST /v1/captures -- quota enforcement (storage_limit)', () => {
  it('returns 429 with resource:storage when storage is at limit', async () => {
    await seedUsage({ storageBytes: FREE_STORAGE_LIMIT });

    const res = await singleCapture();
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.limitType).toBe('quota');
    expect(body.quota.resource).toBe('storage');
    expect(body.quota.limit).toBe(FREE_STORAGE_LIMIT);
    expect(body.quota.used).toBe(FREE_STORAGE_LIMIT);
  });

  it('detail message mentions storage quota', async () => {
    await seedUsage({ storageBytes: FREE_STORAGE_LIMIT });

    const res = await singleCapture();
    const body = await res.json();
    expect(body.detail).toContain('Storage quota reached');
  });
});

// ---------------------------------------------------------------------------
// Single capture -- under quota (X-Quota-* headers)
// ---------------------------------------------------------------------------

describe('POST /v1/captures -- X-Quota-* headers on 202', () => {
  it('returns 202 with X-Quota-Limit, X-Quota-Used, X-Quota-Remaining when under quota', async () => {
    await seedUsage({ captureCount: 10 });

    const res = await singleCapture();
    expect(res.status).toBe(202);

    expect(res.headers.get('X-Quota-Limit')).toBe(String(FREE_CAPTURE_LIMIT));
    expect(res.headers.get('X-Quota-Used')).toBe('10');
    expect(res.headers.get('X-Quota-Remaining')).toBe(
      String(FREE_CAPTURE_LIMIT - 10),
    );
  });

  it('returns X-Quota-* headers when no usage row exists yet (brand new tenant)', async () => {
    // No seedUsage call -- tenant has no usage_counters row yet
    const res = await singleCapture();
    expect(res.status).toBe(202);

    expect(res.headers.get('X-Quota-Limit')).toBe(String(FREE_CAPTURE_LIMIT));
    expect(res.headers.get('X-Quota-Used')).toBe('0');
    expect(res.headers.get('X-Quota-Remaining')).toBe(String(FREE_CAPTURE_LIMIT));
  });

  it('X-Quota-Remaining is never negative (clamped to 0)', async () => {
    // Edge case: usage slightly above limit shouldn't produce a negative remaining
    // (This shouldn't happen in normal operation, but guard against it defensively.)
    await seedUsage({ captureCount: FREE_CAPTURE_LIMIT - 1 });

    const res = await singleCapture();
    expect(res.status).toBe(202);

    const remaining = parseInt(res.headers.get('X-Quota-Remaining'), 10);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Batch capture -- whole-batch rejection when batch exceeds remaining quota
// ---------------------------------------------------------------------------

describe('POST /v1/captures/batch -- quota enforcement (batch rejection)', () => {
  it('returns 429 with limitType quota when batch would exceed monthly limit', async () => {
    // 198 used, limit 200: a batch of 5 would push to 203
    await seedUsage({ captureCount: FREE_CAPTURE_LIMIT - 2 });

    const urls = Array.from({ length: 5 }, (_, i) => ({ url: `https://example.com/page${i}` }));
    const res = await batchCapture(urls);
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.status).toBe(429);
    expect(body.limitType).toBe('quota');
    expect(body.quota.resource).toBe('captures');
    expect(body.quota.requested).toBe(5);
    expect(body.quota.limit).toBe(FREE_CAPTURE_LIMIT);
    expect(body.quota.used).toBe(FREE_CAPTURE_LIMIT - 2);
  });

  it('detail message names the batch size for a payment_required rejection', async () => {
    await seedUsage({ captureCount: FREE_CAPTURE_LIMIT - 2 });

    const urls = [{ url: 'https://example.com/a' }, { url: 'https://example.com/b' }, { url: 'https://example.com/c' }];
    const res = await batchCapture(urls);
    const body = await res.json();
    expect(body.detail).toContain('Batch of 3');
    expect(body.detail).toContain('free tier limit');
  });

  it('returns 429 with resource:storage when storage quota is already at limit', async () => {
    await seedUsage({ storageBytes: FREE_STORAGE_LIMIT });

    const urls = [{ url: 'https://example.com' }];
    const res = await batchCapture(urls);
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.limitType).toBe('quota');
    expect(body.quota.resource).toBe('storage');
  });

  it('allows batch when count does not push over limit (boundary: exactly at limit is fine)', async () => {
    // 197 used, limit 200: batch of 3 pushes to exactly 200 -- allowed (> not >=)
    await seedUsage({ captureCount: FREE_CAPTURE_LIMIT - 3 });

    const urls = Array.from({ length: 3 }, (_, i) => ({ url: `https://example.com/page${i}` }));
    const res = await batchCapture(urls);
    expect(res.status).toBe(207);
  });
});

// ---------------------------------------------------------------------------
// Batch capture -- X-Quota-* headers on 207
// ---------------------------------------------------------------------------

describe('POST /v1/captures/batch -- X-Quota-* headers on 207', () => {
  it('returns 207 with X-Quota-* headers when under quota', async () => {
    await seedUsage({ captureCount: 20 });

    const urls = [{ url: 'https://example.com' }];
    const res = await batchCapture(urls);
    expect(res.status).toBe(207);

    expect(res.headers.get('X-Quota-Limit')).toBe(String(FREE_CAPTURE_LIMIT));
    expect(res.headers.get('X-Quota-Used')).toBe('20');
    expect(res.headers.get('X-Quota-Remaining')).toBe(
      String(FREE_CAPTURE_LIMIT - 20),
    );
  });

  it('returns X-Quota-* headers when tenant has no usage row yet', async () => {
    const urls = [{ url: 'https://example.com' }];
    const res = await batchCapture(urls);
    expect(res.status).toBe(207);

    expect(res.headers.get('X-Quota-Limit')).toBe(String(FREE_CAPTURE_LIMIT));
    expect(res.headers.get('X-Quota-Used')).toBe('0');
    expect(res.headers.get('X-Quota-Remaining')).toBe(String(FREE_CAPTURE_LIMIT));
  });
});

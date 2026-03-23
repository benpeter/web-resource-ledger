// tva
// Unit tests for src/quotas.js

import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  FREE_CAPTURE_LIMIT,
  FREE_STORAGE_LIMIT,
  getEffectiveQuota,
  checkQuota,
  computeQuotaReset,
} from '../src/quotas.js';
import { cleanDb } from './fixtures.js';

beforeEach(async () => {
  await cleanDb(env.DB);
});

// ---------------------------------------------------------------------------
// getEffectiveQuota
// ---------------------------------------------------------------------------

describe('getEffectiveQuota', () => {
  it('returns free tier defaults when no payment method and no config overrides', () => {
    const quota = getEffectiveQuota(false, null);
    expect(quota.capturesPerMonth).toBe(FREE_CAPTURE_LIMIT);
    expect(quota.storageBytes).toBe(FREE_STORAGE_LIMIT);
  });

  it('returns unlimited when payment method exists and no config overrides', () => {
    const quota = getEffectiveQuota(true, null);
    expect(quota.capturesPerMonth).toBe(Infinity);
    expect(quota.storageBytes).toBe(Infinity);
  });

  it('merges capturesPerMonth override with free tier defaults', () => {
    const quota = getEffectiveQuota(false, { quotas: { capturesPerMonth: 999 } });
    expect(quota.capturesPerMonth).toBe(999);
    expect(quota.storageBytes).toBe(FREE_STORAGE_LIMIT);
  });

  it('merges storageBytes override with paid tier defaults', () => {
    const quota = getEffectiveQuota(true, { quotas: { storageBytes: 12345 } });
    expect(quota.storageBytes).toBe(12345);
    expect(quota.capturesPerMonth).toBe(Infinity);
  });

  it('merges both overrides simultaneously', () => {
    const quota = getEffectiveQuota(false, { quotas: { capturesPerMonth: 50, storageBytes: 500 } });
    expect(quota.capturesPerMonth).toBe(50);
    expect(quota.storageBytes).toBe(500);
  });

  it('returns defaults when tenantConfig has no quotas key', () => {
    const quota = getEffectiveQuota(true, { rateLimit: { capture: { limit: 5 } } });
    expect(quota.capturesPerMonth).toBe(Infinity);
    expect(quota.storageBytes).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// computeQuotaReset
// ---------------------------------------------------------------------------

describe('computeQuotaReset', () => {
  afterEach(() => vi.useRealTimers());

  it('returns the first of next month at midnight UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:34:56Z'));
    const reset = computeQuotaReset();
    const d = new Date(reset);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(3); // April = 3 (0-indexed)
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
  });

  it('rolls over year correctly in December', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-12-20T00:00:00Z'));
    const reset = computeQuotaReset();
    const d = new Date(reset);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(0); // January = 0
    expect(d.getUTCDate()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// checkQuota -- helpers to seed tenant and usage rows directly
// ---------------------------------------------------------------------------

async function seedTenant(db, tenantId, { config = null, paymentMethodAddedAt = null } = {}) {
  await db.prepare(
    `INSERT OR IGNORE INTO tenants (id, config, payment_method_added_at) VALUES (?, ?, ?)`,
  ).bind(tenantId, config ? JSON.stringify(config) : null, paymentMethodAddedAt).run();
}

async function seedUsage(db, tenantId, period, { captureCount = 0, storageBytes = 0 } = {}) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(
      `INSERT OR REPLACE INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count)
       VALUES (?, ?, ?, ?, 0)`,
    ).bind(tenantId, period, captureCount, storageBytes),
  ]);
}

// Derive the current period string 'YYYY-MM'
function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

describe('checkQuota', () => {
  afterEach(() => vi.useRealTimers());

  it('returns allowed:true when under limits (free tier)', async () => {
    await seedTenant(env.DB, 'test-t1');
    await seedUsage(env.DB, 'test-t1', currentPeriod(), { captureCount: 10, storageBytes: 100 });
    const result = await checkQuota(env.DB, 'test-t1');
    expect(result.allowed).toBe(true);
    expect(result.hasPaymentMethod).toBe(false);
    expect(result.captureCount).toBe(10);
    expect(result.storageBytes).toBe(100);
    expect(result.period).toBe(currentPeriod());
  });

  it('returns allowed:false with payment_required reason when at/over capture count (free tier)', async () => {
    await seedTenant(env.DB, 'test-t2');
    // captureCount === capturesPerMonth means the next capture (count=1) pushes it over
    await seedUsage(env.DB, 'test-t2', currentPeriod(), { captureCount: FREE_CAPTURE_LIMIT });
    const result = await checkQuota(env.DB, 'test-t2');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('payment_required');
    expect(result.limit).toBe(FREE_CAPTURE_LIMIT);
    expect(result.used).toBe(FREE_CAPTURE_LIMIT);
    expect(result.requested).toBe(1);
  });

  it('returns allowed:false with storage_limit reason when at/over storage', async () => {
    await seedTenant(env.DB, 'test-t3');
    await seedUsage(env.DB, 'test-t3', currentPeriod(), { storageBytes: FREE_STORAGE_LIMIT });
    const result = await checkQuota(env.DB, 'test-t3');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('storage_limit');
    expect(result.limit).toBe(FREE_STORAGE_LIMIT);
    expect(result.used).toBe(FREE_STORAGE_LIMIT);
  });

  it('handles missing usage_counters row -- defaults to 0', async () => {
    await seedTenant(env.DB, 'test-t4');
    // No usage row seeded -- tenant is brand new
    const result = await checkQuota(env.DB, 'test-t4');
    expect(result.allowed).toBe(true);
    expect(result.captureCount).toBe(0);
    expect(result.storageBytes).toBe(0);
  });

  it('handles missing tenant row -- returns tenant_not_found', async () => {
    const result = await checkQuota(env.DB, 'nonexistent-tenant');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('tenant_not_found');
  });

  it('respects count parameter for batch checks -- denies when count pushes over limit', async () => {
    await seedTenant(env.DB, 'test-t5');
    // 197 used, free limit 200: count=5 would push to 202 (over limit)
    await seedUsage(env.DB, 'test-t5', currentPeriod(), { captureCount: 197 });
    const result = await checkQuota(env.DB, 'test-t5', 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('payment_required');
    expect(result.requested).toBe(5);
    expect(result.used).toBe(197);
  });

  it('allows when count does not push over limit', async () => {
    await seedTenant(env.DB, 'test-t5b');
    // 197 used, free limit 200: count=3 pushes to exactly 200 -- NOT over (> not >=)
    await seedUsage(env.DB, 'test-t5b', currentPeriod(), { captureCount: 197 });
    const result = await checkQuota(env.DB, 'test-t5b', 3);
    expect(result.allowed).toBe(true);
  });

  it('returns correct resetsAt -- first of next month, UTC midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T08:00:00Z'));
    await seedTenant(env.DB, 'test-t6');
    const result = await checkQuota(env.DB, 'test-t6');
    expect(result.allowed).toBe(true);
    // resetsAt not present on allowed result; check denied case for resetsAt
    vi.useRealTimers();
  });

  it('returns correct resetsAt on denied result -- first of next month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T08:00:00Z'));
    await seedTenant(env.DB, 'test-t7');
    await seedUsage(env.DB, 'test-t7', '2026-03', { captureCount: FREE_CAPTURE_LIMIT });
    const result = await checkQuota(env.DB, 'test-t7');
    expect(result.allowed).toBe(false);
    const d = new Date(result.resetsAt);
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCMonth()).toBe(3); // April
    expect(d.getUTCFullYear()).toBe(2026);
    vi.useRealTimers();
  });

  it('handles zero usage row -- row exists with capture_count=0, storage_bytes=0', async () => {
    await seedTenant(env.DB, 'test-t8');
    await seedUsage(env.DB, 'test-t8', currentPeriod(), { captureCount: 0, storageBytes: 0 });
    const result = await checkQuota(env.DB, 'test-t8');
    expect(result.allowed).toBe(true);
    expect(result.captureCount).toBe(0);
    expect(result.storageBytes).toBe(0);
  });

  it('paid tenant has unlimited captures', async () => {
    await seedTenant(env.DB, 'test-t9', { paymentMethodAddedAt: new Date().toISOString() });
    // 200 captures -- free tier would block, but paid tenant has unlimited
    await seedUsage(env.DB, 'test-t9', currentPeriod(), { captureCount: 200 });
    const result = await checkQuota(env.DB, 'test-t9');
    expect(result.allowed).toBe(true);
    expect(result.hasPaymentMethod).toBe(true);
    expect(result.quota.capturesPerMonth).toBe(Infinity);
  });

  it('respects per-tenant quota overrides in config', async () => {
    // Override capturesPerMonth to 5 with payment method (so it's capture_limit not payment_required)
    await seedTenant(env.DB, 'test-t10', {
      config: { quotas: { capturesPerMonth: 5 } },
      paymentMethodAddedAt: new Date().toISOString(),
    });
    await seedUsage(env.DB, 'test-t10', currentPeriod(), { captureCount: 5 });
    const result = await checkQuota(env.DB, 'test-t10');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('capture_limit');
    expect(result.limit).toBe(5);
  });
});

// tva
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { computePeriod, incrementUsage, getUsage } from '../src/db.js';
import { cleanDb, seedUsageCounter } from './fixtures.js';

beforeEach(async () => {
  await cleanDb(env.DB);
});

// ---------------------------------------------------------------------------
// computePeriod
// ---------------------------------------------------------------------------

describe('computePeriod', () => {
  it('returns YYYY-MM format for current date', () => {
    const period = computePeriod();
    expect(period).toMatch(/^\d{4}-\d{2}$/);
  });

  it('returns correct period for a specific date', () => {
    expect(computePeriod(new Date('2026-03-15T10:00:00Z'))).toBe('2026-03');
  });

  it('returns correct period for January', () => {
    expect(computePeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });

  it('returns correct period for December', () => {
    expect(computePeriod(new Date('2025-12-31T23:59:59Z'))).toBe('2025-12');
  });

  it('returns correct period at UTC midnight boundary', () => {
    expect(computePeriod(new Date('2026-04-01T00:00:00Z'))).toBe('2026-04');
  });
});

// ---------------------------------------------------------------------------
// incrementUsage
// ---------------------------------------------------------------------------

describe('incrementUsage', () => {
  it('creates new row on first increment', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('test-tenant').run();
    await incrementUsage(env.DB, 'test-tenant', { captures: 1 });
    const period = computePeriod();
    const result = await getUsage(env.DB, 'test-tenant', period);
    expect(result.captureCount).toBe(1);
  });

  it('increments existing row', async () => {
    const period = computePeriod();
    await seedUsageCounter(env.DB, { tenantId: 'acme', period, captureCount: 5 });
    await incrementUsage(env.DB, 'acme', { captures: 3 });
    const result = await getUsage(env.DB, 'acme', period);
    expect(result.captureCount).toBe(8);
  });

  it('increments multiple counters atomically', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('multi-tenant').run();
    await incrementUsage(env.DB, 'multi-tenant', { captures: 1, storageBytes: 1024, apiCalls: 1 });
    const period = computePeriod();
    const result = await getUsage(env.DB, 'multi-tenant', period);
    expect(result.captureCount).toBe(1);
    expect(result.storageBytes).toBe(1024);
    expect(result.apiCallCount).toBe(1);
  });

  it('no-op when all deltas are zero', async () => {
    await incrementUsage(env.DB, 'ghost-tenant', { captures: 0, storageBytes: 0, apiCalls: 0 });
    const period = computePeriod();
    const result = await getUsage(env.DB, 'ghost-tenant', period);
    expect(result.captureCount).toBe(0);
    expect(result.storageBytes).toBe(0);
    expect(result.apiCallCount).toBe(0);
    expect(result.updatedAt).toBeNull();
  });

  it('no-op when deltas object is empty', async () => {
    await incrementUsage(env.DB, 'ghost-tenant', {});
    const period = computePeriod();
    const result = await getUsage(env.DB, 'ghost-tenant', period);
    expect(result.captureCount).toBe(0);
    expect(result.storageBytes).toBe(0);
    expect(result.apiCallCount).toBe(0);
    expect(result.updatedAt).toBeNull();
  });

  it('handles large storageBytes', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('big-tenant').run();
    const large = 50 * 1024 * 1024;
    await incrementUsage(env.DB, 'big-tenant', { storageBytes: large });
    const period = computePeriod();
    const result = await getUsage(env.DB, 'big-tenant', period);
    expect(result.storageBytes).toBe(large);
  });

  it('multiple increments accumulate', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('count-tenant').run();
    await incrementUsage(env.DB, 'count-tenant', { captures: 1 });
    await incrementUsage(env.DB, 'count-tenant', { captures: 1 });
    await incrementUsage(env.DB, 'count-tenant', { captures: 1 });
    const period = computePeriod();
    const result = await getUsage(env.DB, 'count-tenant', period);
    expect(result.captureCount).toBe(3);
  });

  it('concurrent periods are independent', async () => {
    await seedUsageCounter(env.DB, { tenantId: 'period-tenant', period: '2026-02', captureCount: 7 });
    await incrementUsage(env.DB, 'period-tenant', { captures: 2 });
    const currentPeriod = computePeriod();
    const feb = await getUsage(env.DB, 'period-tenant', '2026-02');
    const current = await getUsage(env.DB, 'period-tenant', currentPeriod);
    expect(feb.captureCount).toBe(7);
    expect(current.captureCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getUsage
// ---------------------------------------------------------------------------

describe('getUsage', () => {
  it('returns zero-defaults for nonexistent tenant', async () => {
    const result = await getUsage(env.DB, 'nonexistent', '2026-03');
    expect(result.captureCount).toBe(0);
    expect(result.storageBytes).toBe(0);
    expect(result.apiCallCount).toBe(0);
    expect(result.updatedAt).toBeNull();
  });

  it('returns zero-defaults for nonexistent period', async () => {
    await seedUsageCounter(env.DB, { tenantId: 'acme', period: '2026-03', captureCount: 5 });
    const result = await getUsage(env.DB, 'acme', '2026-02');
    expect(result.captureCount).toBe(0);
    expect(result.storageBytes).toBe(0);
    expect(result.apiCallCount).toBe(0);
    expect(result.updatedAt).toBeNull();
  });

  it('returns seeded values correctly', async () => {
    await seedUsageCounter(env.DB, {
      tenantId: 'acme',
      period: '2026-03',
      captureCount: 10,
      storageBytes: 5000,
      apiCallCount: 20,
    });
    const result = await getUsage(env.DB, 'acme', '2026-03');
    expect(result.captureCount).toBe(10);
    expect(result.storageBytes).toBe(5000);
    expect(result.apiCallCount).toBe(20);
  });

  it('returns camelCase field names', async () => {
    await seedUsageCounter(env.DB, { tenantId: 'acme', period: '2026-03' });
    const result = await getUsage(env.DB, 'acme', '2026-03');
    expect(result).toHaveProperty('tenantId');
    expect(result).toHaveProperty('period');
    expect(result).toHaveProperty('captureCount');
    expect(result).toHaveProperty('storageBytes');
    expect(result).toHaveProperty('apiCallCount');
    expect(result).toHaveProperty('updatedAt');
  });
});

// ---------------------------------------------------------------------------
// schema constraints
// ---------------------------------------------------------------------------

describe('schema constraints', () => {
  it('period CHECK constraint rejects invalid format', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('t1').run();
    await expect(
      env.DB.prepare(
        'INSERT INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count) VALUES (?, ?, 0, 0, 0)',
      ).bind('t1', '2026-3').run(),
    ).rejects.toThrow();
  });

  it('period CHECK constraint rejects wrong length', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('t1').run();
    await expect(
      env.DB.prepare(
        'INSERT INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count) VALUES (?, ?, 0, 0, 0)',
      ).bind('t1', '2026-031').run(),
    ).rejects.toThrow();
  });

  it('non-negative CHECK constraint prevents negative capture_count', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind('t1').run();
    await expect(
      env.DB.prepare(
        'INSERT INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count) VALUES (?, ?, -1, 0, 0)',
      ).bind('t1', '2026-03').run(),
    ).rejects.toThrow();
  });
});

// tva
// Integration tests for admin dashboard: DAL functions and HTTP endpoints.
// DAL tests use env.DB directly. HTTP tests use SELF.fetch() through the real worker.
//
// IMPORTANT: Admin rate limiter is 30 req/60s per IP (wrangler.test.toml).
// Each describe block uses a distinct CF-Connecting-IP to avoid cross-test
// rate limit exhaustion. IP range: 10.0.1.150+

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TEST_ADMIN_KEY,
  TEST_TENANT_KEY,
  cleanDb,
  seedApiKey,
  seedUsageCounter,
  seedTenantWithTier,
} from './fixtures.js';
import { listTenantsWithUsage, getTenantDetail, getOverviewStats } from '../src/db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_AUTH = `Bearer ${TEST_ADMIN_KEY}`;

let ipCounter = 150;
function nextIp() {
  return `10.0.1.${ipCounter++}`;
}

function adminGet(path, ip) {
  return SELF.fetch(`https://worker.test${path}`, {
    headers: {
      Authorization: ADMIN_AUTH,
      'CF-Connecting-IP': ip,
    },
  });
}

beforeEach(async () => {
  await cleanDb(env.DB);
});

// ===========================================================================
// DAL: listTenantsWithUsage
// ===========================================================================

describe('DAL listTenantsWithUsage -- empty database', () => {
  it('returns empty array when no tenants exist', async () => {
    const rows = await listTenantsWithUsage(env.DB, '2026-03');
    expect(rows).toEqual([]);
  });
});

describe('DAL listTenantsWithUsage -- tenant with no usage row', () => {
  it('returns zeroed counters when tenant has no usage_counters row', async () => {
    await seedTenantWithTier(env.DB, 'tenant-nousage');
    const rows = await listTenantsWithUsage(env.DB, '2026-03');
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toBe('tenant-nousage');
    expect(row.captureCount).toBe(0);
    expect(row.storageBytes).toBe(0);
    expect(row.apiCallCount).toBe(0);
    expect(row.eidasCaptureCount).toBe(0);
    expect(row.keyCount).toBe(0);
  });
});

describe('DAL listTenantsWithUsage -- multiple tenants with mixed usage', () => {
  it('returns correct data for all tenants in the requested period', async () => {
    await seedTenantWithTier(env.DB, 'tenant-alpha', { createdAt: '2026-01-01T00:00:00.000Z' });
    await seedTenantWithTier(env.DB, 'tenant-beta', { createdAt: '2026-02-01T00:00:00.000Z' });
    await seedUsageCounter(env.DB, {
      tenantId: 'tenant-alpha',
      period: '2026-03',
      captureCount: 10,
      storageBytes: 1000,
      apiCallCount: 5,
      eidasCaptureCount: 3,
    });
    // tenant-beta has no usage row for this period

    const rows = await listTenantsWithUsage(env.DB, '2026-03');
    expect(rows).toHaveLength(2);

    const alpha = rows.find(r => r.id === 'tenant-alpha');
    expect(alpha.captureCount).toBe(10);
    expect(alpha.storageBytes).toBe(1000);
    expect(alpha.apiCallCount).toBe(5);
    expect(alpha.eidasCaptureCount).toBe(3);

    const beta = rows.find(r => r.id === 'tenant-beta');
    expect(beta.captureCount).toBe(0);
    expect(beta.eidasCaptureCount).toBe(0);
  });
});

describe('DAL listTenantsWithUsage -- ordering', () => {
  it('returns tenants ordered by created_at DESC', async () => {
    await seedTenantWithTier(env.DB, 'oldest', { createdAt: '2025-01-01T00:00:00.000Z' });
    await seedTenantWithTier(env.DB, 'middle', { createdAt: '2025-06-01T00:00:00.000Z' });
    await seedTenantWithTier(env.DB, 'newest', { createdAt: '2026-01-01T00:00:00.000Z' });

    const rows = await listTenantsWithUsage(env.DB, '2026-03');
    expect(rows.map(r => r.id)).toEqual(['newest', 'middle', 'oldest']);
  });
});

describe('DAL listTenantsWithUsage -- keyCount', () => {
  it('keyCount reflects only active (non-revoked) keys', async () => {
    await seedTenantWithTier(env.DB, 'tenant-keys');
    await seedApiKey(env.DB, 'wrl_live_' + 'k'.repeat(43), {
      tenantId: 'tenant-keys',
      name: 'active-1',
    });
    await seedApiKey(env.DB, 'wrl_live_' + 'l'.repeat(43), {
      tenantId: 'tenant-keys',
      name: 'active-2',
    });
    await seedApiKey(env.DB, 'wrl_live_' + 'm'.repeat(43), {
      tenantId: 'tenant-keys',
      name: 'revoked-key',
      revoked: true,
      revokedAt: new Date().toISOString(),
    });

    const rows = await listTenantsWithUsage(env.DB, '2026-03');
    const row = rows.find(r => r.id === 'tenant-keys');
    expect(row.keyCount).toBe(2);
  });
});

// ===========================================================================
// DAL: getTenantDetail
// ===========================================================================

describe('DAL getTenantDetail -- not found', () => {
  it('returns null for a nonexistent tenant', async () => {
    const result = await getTenantDetail(env.DB, 'does-not-exist');
    expect(result).toBeNull();
  });
});

describe('DAL getTenantDetail -- full detail', () => {
  it('includes tenant metadata, usage history, and active keys', async () => {
    await seedTenantWithTier(env.DB, 'detail-tenant', {
      tier: 'pro',
      billingStatus: 'active',
      stripeCustomerId: 'cus_test123',
    });
    await seedUsageCounter(env.DB, {
      tenantId: 'detail-tenant',
      period: '2026-03',
      captureCount: 50,
      storageBytes: 9999,
      apiCallCount: 12,
      eidasCaptureCount: 5,
    });
    await seedApiKey(env.DB, 'wrl_live_' + 'd'.repeat(43), {
      tenantId: 'detail-tenant',
      name: 'my-key',
    });

    const result = await getTenantDetail(env.DB, 'detail-tenant');
    expect(result).not.toBeNull();
    expect(result.tenant.id).toBe('detail-tenant');
    expect(result.tenant.tier).toBe('pro');
    expect(result.tenant.stripeCustomerId).toBe('cus_test123');
    expect(result.usageHistory).toHaveLength(1);
    expect(result.usageHistory[0].captureCount).toBe(50);
    expect(result.usageHistory[0].eidasCaptureCount).toBe(5);
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0].name).toBe('my-key');
  });

  it('keys array excludes revoked keys', async () => {
    await seedTenantWithTier(env.DB, 'detail-revoked');
    await seedApiKey(env.DB, 'wrl_live_' + 'e'.repeat(43), {
      tenantId: 'detail-revoked',
      name: 'active',
    });
    await seedApiKey(env.DB, 'wrl_live_' + 'f'.repeat(43), {
      tenantId: 'detail-revoked',
      name: 'revoked',
      revoked: true,
      revokedAt: new Date().toISOString(),
    });

    const result = await getTenantDetail(env.DB, 'detail-revoked');
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0].name).toBe('active');
  });
});

describe('DAL getTenantDetail -- periodLimit', () => {
  it('periodLimit caps history results -- LIMIT fires with fewer rows than seeded', async () => {
    await seedTenantWithTier(env.DB, 'tenant-hist');
    // Seed 8 usage rows (more than the default limit of 6)
    const periods = [
      '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
      '2026-01', '2026-02', '2026-03',
    ];
    for (const p of periods) {
      await seedUsageCounter(env.DB, { tenantId: 'tenant-hist', period: p, captureCount: 1 });
    }

    const result3 = await getTenantDetail(env.DB, 'tenant-hist', 3);
    expect(result3.usageHistory).toHaveLength(3);

    const result6 = await getTenantDetail(env.DB, 'tenant-hist', 6);
    expect(result6.usageHistory).toHaveLength(6);
  });
});

// ===========================================================================
// DAL: getOverviewStats
// ===========================================================================

describe('DAL getOverviewStats -- empty database', () => {
  it('returns zeroed stats when database is empty', async () => {
    const stats = await getOverviewStats(env.DB, '2026-03');
    expect(stats.totalTenants).toBe(0);
    expect(stats.totalCapturesCurrentPeriod).toBe(0);
    expect(stats.totalCapturesAllTime).toBe(0);
    expect(stats.currentPeriodStorageBytes).toBe(0);
    expect(stats.totalEidasCaptures).toBe(0);
    expect(stats.activeApiKeys).toBe(0);
    expect(stats.tenantsByTier.free).toBe(0);
    expect(stats.tenantsByTier.pro).toBe(0);
    expect(stats.tenantsByBillingStatus.active).toBe(0);
    expect(stats.tenantsByBillingStatus.gracePeriod).toBe(0);
    expect(stats.tenantsByBillingStatus.blocked).toBe(0);
  });
});

describe('DAL getOverviewStats -- tenant counts by tier', () => {
  it('correctly counts tenants by tier', async () => {
    await seedTenantWithTier(env.DB, 'free-1', { tier: 'free' });
    await seedTenantWithTier(env.DB, 'free-2', { tier: 'free' });
    await seedTenantWithTier(env.DB, 'pro-1', { tier: 'pro' });

    const stats = await getOverviewStats(env.DB, '2026-03');
    expect(stats.totalTenants).toBe(3);
    expect(stats.tenantsByTier.free).toBe(2);
    expect(stats.tenantsByTier.pro).toBe(1);
  });
});

describe('DAL getOverviewStats -- tenant counts by billing status', () => {
  it('correctly counts tenants by billing status', async () => {
    await seedTenantWithTier(env.DB, 'active-1', { billingStatus: 'active' });
    await seedTenantWithTier(env.DB, 'active-2', { billingStatus: 'active' });
    await seedTenantWithTier(env.DB, 'grace-1', { billingStatus: 'grace_period' });
    await seedTenantWithTier(env.DB, 'blocked-1', { billingStatus: 'blocked' });

    const stats = await getOverviewStats(env.DB, '2026-03');
    expect(stats.tenantsByBillingStatus.active).toBe(2);
    expect(stats.tenantsByBillingStatus.gracePeriod).toBe(1);
    expect(stats.tenantsByBillingStatus.blocked).toBe(1);
  });
});

describe('DAL getOverviewStats -- capture aggregates', () => {
  it('aggregates current period captures across all tenants', async () => {
    await seedUsageCounter(env.DB, { tenantId: 'agg-a', period: '2026-03', captureCount: 30 });
    await seedUsageCounter(env.DB, { tenantId: 'agg-b', period: '2026-03', captureCount: 20 });
    // Different period -- should not appear in current-period total
    await seedUsageCounter(env.DB, { tenantId: 'agg-a', period: '2026-02', captureCount: 100 });

    const stats = await getOverviewStats(env.DB, '2026-03');
    expect(stats.totalCapturesCurrentPeriod).toBe(50);
  });

  it('all-time captures includes all periods', async () => {
    await seedUsageCounter(env.DB, { tenantId: 'alltime-a', period: '2026-03', captureCount: 10 });
    await seedUsageCounter(env.DB, { tenantId: 'alltime-a', period: '2026-02', captureCount: 7 });
    await seedUsageCounter(env.DB, { tenantId: 'alltime-b', period: '2026-01', captureCount: 3 });

    const stats = await getOverviewStats(env.DB, '2026-03');
    expect(stats.totalCapturesAllTime).toBe(20);
  });

  it('eIDAS captures aggregated correctly for current period', async () => {
    await seedUsageCounter(env.DB, {
      tenantId: 'eidas-tenant-a',
      period: '2026-03',
      captureCount: 10,
      eidasCaptureCount: 4,
    });
    await seedUsageCounter(env.DB, {
      tenantId: 'eidas-tenant-b',
      period: '2026-03',
      captureCount: 5,
      eidasCaptureCount: 2,
    });
    // Different period eIDAS -- must NOT be included in current-period total
    await seedUsageCounter(env.DB, {
      tenantId: 'eidas-tenant-a',
      period: '2026-02',
      captureCount: 8,
      eidasCaptureCount: 8,
    });

    const stats = await getOverviewStats(env.DB, '2026-03');
    expect(stats.totalEidasCaptures).toBe(6);
  });
});

describe('DAL getOverviewStats -- active API keys', () => {
  it('active API keys count excludes revoked keys', async () => {
    await seedApiKey(env.DB, 'wrl_live_' + 'n'.repeat(43), { tenantId: 'keys-tenant', name: 'active' });
    await seedApiKey(env.DB, 'wrl_live_' + 'o'.repeat(43), {
      tenantId: 'keys-tenant',
      name: 'revoked',
      revoked: true,
      revokedAt: new Date().toISOString(),
    });

    const stats = await getOverviewStats(env.DB, '2026-03');
    expect(stats.activeApiKeys).toBe(1);
  });
});

// ===========================================================================
// API: GET /v1/admin/tenants
// ===========================================================================

describe('GET /v1/admin/tenants -- auth', () => {
  const ip = nextIp();

  it('returns 401 without Authorization header', async () => {
    const res = await SELF.fetch('https://worker.test/v1/admin/tenants', {
      headers: { 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong admin key', async () => {
    const res = await SELF.fetch('https://worker.test/v1/admin/tenants', {
      headers: {
        Authorization: 'Bearer wrong-key',
        'CF-Connecting-IP': ip,
      },
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/admin/tenants -- success', () => {
  const ip = nextIp();

  it('returns 200 with valid admin key', async () => {
    const res = await adminGet('/v1/admin/tenants', ip);
    expect(res.status).toBe(200);
  });

  it('response has data array and meta object', async () => {
    const res = await adminGet('/v1/admin/tenants', ip);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.meta).toBe('object');
    expect(typeof body.meta.totalTenants).toBe('number');
    expect(typeof body.meta.period).toBe('string');
  });

  it('each tenant object has the expected fields', async () => {
    await seedTenantWithTier(env.DB, 'shape-tenant');
    const res = await adminGet('/v1/admin/tenants', ip);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const tenant = body.data.find(t => t.tenantId === 'shape-tenant');
    expect(tenant).toBeDefined();
    expect(Object.keys(tenant).sort()).toEqual(
      ['billingStatus', 'createdAt', 'currentPeriod', 'eidasQualified',
        'hasPaymentMethod', 'keyCount', 'quota', 'tenantId', 'tier'].sort(),
    );
  });

  it('quota is computed correctly for free tier tenant without payment method', async () => {
    await seedTenantWithTier(env.DB, 'free-quota-tenant', { tier: 'free', paymentMethodAddedAt: null });
    const res = await adminGet('/v1/admin/tenants', ip);
    const body = await res.json();
    const tenant = body.data.find(t => t.tenantId === 'free-quota-tenant');
    expect(tenant.quota.capturesPerMonth).toBe(200);
  });

  it('Content-Type is application/json', async () => {
    const res = await adminGet('/v1/admin/tenants', ip);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('Cache-Control is private, no-store', async () => {
    const res = await adminGet('/v1/admin/tenants', ip);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

describe('GET /v1/admin/tenants -- period param validation', () => {
  const ip = nextIp();

  it('returns 400 for invalid period format', async () => {
    const res = await SELF.fetch('https://worker.test/v1/admin/tenants?period=2026-3', {
      headers: { Authorization: ADMIN_AUTH, 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(400);
  });

  it('accepts valid YYYY-MM period param', async () => {
    const res = await SELF.fetch('https://worker.test/v1/admin/tenants?period=2026-03', {
      headers: { Authorization: ADMIN_AUTH, 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// API: GET /v1/admin/tenants/:id
// ===========================================================================

describe('GET /v1/admin/tenants/:id -- auth', () => {
  const ip = nextIp();

  it('returns 401 without Authorization header', async () => {
    const res = await SELF.fetch('https://worker.test/v1/admin/tenants/any-tenant', {
      headers: { 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/admin/tenants/:id -- not found', () => {
  const ip = nextIp();

  it('returns 404 for nonexistent tenant', async () => {
    const res = await adminGet('/v1/admin/tenants/no-such-tenant', ip);
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/admin/tenants/:id -- success', () => {
  const ip = nextIp();

  it('returns 200 with full tenant detail including usageHistory and keys arrays', async () => {
    await seedTenantWithTier(env.DB, 'full-detail-tenant', {
      tier: 'pro',
      billingStatus: 'active',
      stripeCustomerId: 'cus_abc',
      eidasQualified: 1,
    });
    await seedUsageCounter(env.DB, {
      tenantId: 'full-detail-tenant',
      period: '2026-03',
      captureCount: 15,
      eidasCaptureCount: 7,
    });
    await seedApiKey(env.DB, 'wrl_live_' + 'g'.repeat(43), {
      tenantId: 'full-detail-tenant',
      name: 'detail-key',
      scopes: ['capture'],
    });

    const res = await adminGet('/v1/admin/tenants/full-detail-tenant', ip);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.tenantId).toBe('full-detail-tenant');
    expect(body.tier).toBe('pro');
    expect(body.stripeCustomerId).toBe('cus_abc');
    expect(Array.isArray(body.usageHistory)).toBe(true);
    expect(body.usageHistory[0].captureCount).toBe(15);
    expect(body.usageHistory[0].eidasCaptureCount).toBe(7);
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys[0].name).toBe('detail-key');
    expect(body.keys[0].scopes).toEqual(['capture']);
  });

  it('keys array shows name, scopes, createdAt, createdBy', async () => {
    await seedTenantWithTier(env.DB, 'keys-shape-tenant');
    await seedApiKey(env.DB, 'wrl_live_' + 'h'.repeat(43), {
      tenantId: 'keys-shape-tenant',
      name: 'shape-key',
      scopes: ['read'],
    });

    const res = await adminGet('/v1/admin/tenants/keys-shape-tenant', ip);
    const body = await res.json();
    expect(body.keys).toHaveLength(1);
    const key = body.keys[0];
    expect(Object.keys(key)).toEqual(expect.arrayContaining(['keyHash', 'name', 'scopes', 'createdAt', 'createdBy']));
  });

  it('Cache-Control is private, no-store', async () => {
    await seedTenantWithTier(env.DB, 'cache-detail-tenant');
    const res = await adminGet('/v1/admin/tenants/cache-detail-tenant', ip);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

describe('GET /v1/admin/tenants/:id -- periods param', () => {
  const ip = nextIp();

  it('periods defaults to 6 when omitted', async () => {
    await seedTenantWithTier(env.DB, 'periods-default-tenant');
    // Seed 8 periods to prove that only 6 are returned by default
    const periods = [
      '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
      '2026-01', '2026-02', '2026-03',
    ];
    for (const p of periods) {
      await seedUsageCounter(env.DB, {
        tenantId: 'periods-default-tenant',
        period: p,
        captureCount: 1,
      });
    }

    const res = await adminGet('/v1/admin/tenants/periods-default-tenant', ip);
    const body = await res.json();
    expect(body.usageHistory).toHaveLength(6);
  });

  it('periods=24 boundary value succeeds', async () => {
    await seedTenantWithTier(env.DB, 'periods-max-tenant');
    const res = await SELF.fetch('https://worker.test/v1/admin/tenants/periods-max-tenant?periods=24', {
      headers: { Authorization: ADMIN_AUTH, 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(200);
  });

  it('invalid periods param returns 400 (not silently coerced)', async () => {
    await seedTenantWithTier(env.DB, 'periods-bad-tenant');
    const res = await SELF.fetch('https://worker.test/v1/admin/tenants/periods-bad-tenant?periods=25', {
      headers: { Authorization: ADMIN_AUTH, 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(400);
  });

  it('periods=0 returns 400', async () => {
    await seedTenantWithTier(env.DB, 'periods-zero-tenant');
    const res = await SELF.fetch('https://worker.test/v1/admin/tenants/periods-zero-tenant?periods=0', {
      headers: { Authorization: ADMIN_AUTH, 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// API: GET /v1/admin/overview
// ===========================================================================

describe('GET /v1/admin/overview -- auth', () => {
  const ip = nextIp();

  it('returns 401 without Authorization header', async () => {
    const res = await SELF.fetch('https://worker.test/v1/admin/overview', {
      headers: { 'CF-Connecting-IP': ip },
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/admin/overview -- success', () => {
  const ip = nextIp();

  it('returns 200 with aggregate stats and expected fields', async () => {
    const res = await adminGet('/v1/admin/overview', ip);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        'activeApiKeys',
        'period',
        'tenantsByBillingStatus',
        'tenantsByTier',
        'totalCapturesAllTime',
        'totalCapturesCurrentPeriod',
        'totalEidasCaptures',
        'currentPeriodStorageBytes',
        'totalTenants',
      ].sort(),
    );
  });

  it('tenantsByTier and tenantsByBillingStatus reflect seeded data', async () => {
    await seedTenantWithTier(env.DB, 'ov-free-1', { tier: 'free', billingStatus: 'active' });
    await seedTenantWithTier(env.DB, 'ov-pro-1', { tier: 'pro', billingStatus: 'active' });
    await seedTenantWithTier(env.DB, 'ov-grace-1', { tier: 'free', billingStatus: 'grace_period' });

    const res = await adminGet('/v1/admin/overview', ip);
    const body = await res.json();
    expect(body.totalTenants).toBe(3);
    expect(body.tenantsByTier.free).toBe(2);
    expect(body.tenantsByTier.pro).toBe(1);
    expect(body.tenantsByBillingStatus.active).toBe(2);
    expect(body.tenantsByBillingStatus.gracePeriod).toBe(1);
  });

  it('Cache-Control is private, no-store', async () => {
    const res = await adminGet('/v1/admin/overview', ip);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

// ===========================================================================
// Security
// ===========================================================================

describe('Security -- tenant key rejected on admin endpoints', () => {
  const ip = nextIp();

  it('tenant API key rejected on GET /v1/admin/tenants', async () => {
    await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'security-tenant' });
    const res = await SELF.fetch('https://worker.test/v1/admin/tenants', {
      headers: {
        Authorization: `Bearer ${TEST_TENANT_KEY}`,
        'CF-Connecting-IP': ip,
      },
    });
    expect(res.status).toBe(401);
  });

  it('tenant API key rejected on GET /v1/admin/overview', async () => {
    await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'security-tenant' });
    const res = await SELF.fetch('https://worker.test/v1/admin/overview', {
      headers: {
        Authorization: `Bearer ${TEST_TENANT_KEY}`,
        'CF-Connecting-IP': ip,
      },
    });
    expect(res.status).toBe(401);
  });
});

describe('Security -- no CORS headers on admin responses', () => {
  const ip = nextIp();

  it('GET /v1/admin/tenants does not include Access-Control-Allow-Origin', async () => {
    const res = await adminGet('/v1/admin/tenants', ip);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('GET /v1/admin/overview does not include Access-Control-Allow-Origin', async () => {
    const res = await adminGet('/v1/admin/overview', ip);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

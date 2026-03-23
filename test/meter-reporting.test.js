// Unit tests for src/meter-reporter.js
//
// Tests reportPendingMeterEvents() in isolation using a real miniflare D1
// but with globalThis.fetch stubbed to intercept Stripe API calls.
// vi.useFakeTimers() / vi.setSystemTime() controls the current period.

import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { reportPendingMeterEvents } from '../src/meter-reporter.js';
import { computePeriod } from '../src/db.js';
import { setStripeCustomerId, setPaymentMethodAdded } from '../src/db.js';
import { cleanDb } from './fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Seed usage_counters for a tenant, creating the tenant row if needed.
 */
async function seedUsage(db, tenantId, { period, captureCount = 0, reportedCaptureCount = 0 } = {}) {
  const resolvedPeriod = period ?? computePeriod();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(
      `INSERT OR REPLACE INTO usage_counters
         (tenant_id, period, capture_count, reported_capture_count, storage_bytes, api_call_count)
       VALUES (?, ?, ?, ?, 0, 0)`,
    ).bind(tenantId, resolvedPeriod, captureCount, reportedCaptureCount),
  ]);
}

/**
 * Make the tenant a paid tenant (has stripe_customer_id + payment_method_added_at).
 */
async function makePaid(db, tenantId, stripeCustomerId = `cus_${tenantId}`) {
  await db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId).run();
  await setStripeCustomerId(db, tenantId, stripeCustomerId);
  await setPaymentMethodAdded(db, tenantId);
}

/**
 * Build a mock Stripe fetch that returns 200 for meter_events.
 * Any other URL throws.
 */
function stripeMock200() {
  return vi.fn().mockImplementation(async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('api.stripe.com/v1/billing/meter_events')) {
      return new Response(JSON.stringify({ object: 'billing.meter_event' }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${urlStr}`);
  });
}

/**
 * Build a mock that returns HTTP 500 for meter_events.
 */
function stripeMock500() {
  return vi.fn().mockImplementation(async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('api.stripe.com/v1/billing/meter_events')) {
      return new Response(
        JSON.stringify({ error: { message: 'Internal server error', type: 'api_error' } }),
        { status: 500 },
      );
    }
    throw new Error(`Unexpected fetch: ${urlStr}`);
  });
}

/**
 * Read back the usage_counters row for a tenant+period.
 */
async function getCounter(db, tenantId, period) {
  return db.prepare(
    `SELECT capture_count, reported_capture_count, last_reported_at
     FROM usage_counters WHERE tenant_id = ? AND period = ?`,
  ).bind(tenantId, period).first();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanDb(env.DB);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// 1. Paid tenant with delta: reports correct value, updates watermark
// ---------------------------------------------------------------------------

describe('paid tenant with delta', () => {
  it('calls Stripe with correct delta and updates reported_capture_count to snapshot', async () => {
    const tenantId = 'paid-tenant-a';
    const period = computePeriod();
    await makePaid(env.DB, tenantId, 'cus_aaa');
    await seedUsage(env.DB, tenantId, { period, captureCount: 50, reportedCaptureCount: 20 });

    const mock = stripeMock200();
    vi.stubGlobal('fetch', mock);

    await reportPendingMeterEvents(env, {});

    // Verify Stripe was called once
    const stripeCalls = mock.mock.calls.filter(([u]) => String(u).includes('meter_events'));
    expect(stripeCalls.length).toBe(1);

    // Decode form body and check value = delta (50 - 20 = 30)
    const [, opts] = stripeCalls[0];
    const body = new URLSearchParams(opts.body);
    expect(body.get('payload[value]')).toBe('30');
    expect(body.get('payload[stripe_customer_id]')).toBe('cus_aaa');
    expect(body.get('event_name')).toBe('captures');

    // Watermark updated to snapshot captureCount (50)
    const row = await getCounter(env.DB, tenantId, period);
    expect(row.reported_capture_count).toBe(50);
    expect(row.last_reported_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Paid tenant with no delta: no Stripe call
// ---------------------------------------------------------------------------

describe('paid tenant with no delta', () => {
  it('skips Stripe call when reported_capture_count equals capture_count', async () => {
    const tenantId = 'paid-tenant-no-delta';
    const period = computePeriod();
    await makePaid(env.DB, tenantId, 'cus_bbb');
    await seedUsage(env.DB, tenantId, { period, captureCount: 40, reportedCaptureCount: 40 });

    const mock = stripeMock200();
    vi.stubGlobal('fetch', mock);

    await reportPendingMeterEvents(env, {});

    const stripeCalls = mock.mock.calls.filter(([u]) => String(u).includes('meter_events'));
    expect(stripeCalls.length).toBe(0);

    const row = await getCounter(env.DB, tenantId, period);
    expect(row.reported_capture_count).toBe(40); // unchanged
  });
});

// ---------------------------------------------------------------------------
// 3. Free tenant (no stripe_customer_id): skipped
// ---------------------------------------------------------------------------

describe('free tenant', () => {
  it('is not queried or reported when stripe_customer_id is NULL', async () => {
    const tenantId = 'free-tenant';
    const period = computePeriod();
    // Free tenant -- only has a tenant row, no stripe_customer_id
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId).run();
    await seedUsage(env.DB, tenantId, { period, captureCount: 100, reportedCaptureCount: 0 });

    const mock = stripeMock200();
    vi.stubGlobal('fetch', mock);

    await reportPendingMeterEvents(env, {});

    const stripeCalls = mock.mock.calls.filter(([u]) => String(u).includes('meter_events'));
    expect(stripeCalls.length).toBe(0);

    const row = await getCounter(env.DB, tenantId, period);
    expect(row.reported_capture_count).toBe(0); // untouched
  });
});

// ---------------------------------------------------------------------------
// 4. Stripe 500: watermark NOT updated, error logged (no throw)
// ---------------------------------------------------------------------------

describe('Stripe 500 error', () => {
  it('does not update watermark on Stripe 500 and does not throw', async () => {
    const tenantId = 'paid-tenant-err';
    const period = computePeriod();
    await makePaid(env.DB, tenantId, 'cus_err');
    await seedUsage(env.DB, tenantId, { period, captureCount: 30, reportedCaptureCount: 0 });

    vi.stubGlobal('fetch', stripeMock500());

    // Should not throw -- per-tenant error isolation
    await expect(reportPendingMeterEvents(env, {})).resolves.toBeUndefined();

    const row = await getCounter(env.DB, tenantId, period);
    expect(row.reported_capture_count).toBe(0); // unchanged
    expect(row.last_reported_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Stripe 200 on duplicate identifier: success, watermark updated (NOT 409)
// ---------------------------------------------------------------------------

describe('duplicate idempotency key returns 200', () => {
  it('treats 200 on duplicate as success and updates watermark', async () => {
    const tenantId = 'paid-tenant-dup';
    const period = computePeriod();
    await makePaid(env.DB, tenantId, 'cus_dup');
    await seedUsage(env.DB, tenantId, { period, captureCount: 10, reportedCaptureCount: 0 });

    // Stripe returns 200 regardless (idempotent success)
    vi.stubGlobal('fetch', stripeMock200());

    await reportPendingMeterEvents(env, {});

    const row = await getCounter(env.DB, tenantId, period);
    expect(row.reported_capture_count).toBe(10);
    expect(row.last_reported_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Multiple tenants: independent calls; one failure doesn't block others
// ---------------------------------------------------------------------------

describe('multiple tenants', () => {
  it('processes all tenants independently and continues after one failure', async () => {
    await makePaid(env.DB, 'tenant-ok', 'cus_ok');
    await makePaid(env.DB, 'tenant-fail', 'cus_fail');

    const period = computePeriod();
    await seedUsage(env.DB, 'tenant-ok', { period, captureCount: 20, reportedCaptureCount: 0 });
    await seedUsage(env.DB, 'tenant-fail', { period, captureCount: 15, reportedCaptureCount: 0 });

    // tenant-fail's Stripe call returns 500, tenant-ok's returns 200
    const mock = vi.fn().mockImplementation(async (url, opts) => {
      const urlStr = String(url);
      if (!urlStr.includes('meter_events')) throw new Error(`Unexpected fetch: ${urlStr}`);
      const body = new URLSearchParams(opts?.body ?? '');
      if (body.get('payload[stripe_customer_id]') === 'cus_fail') {
        return new Response(
          JSON.stringify({ error: { message: 'fail', type: 'api_error' } }),
          { status: 500 },
        );
      }
      return new Response(JSON.stringify({ object: 'billing.meter_event' }), { status: 200 });
    });
    vi.stubGlobal('fetch', mock);

    await expect(reportPendingMeterEvents(env, {})).resolves.toBeUndefined();

    const okRow = await getCounter(env.DB, 'tenant-ok', period);
    const failRow = await getCounter(env.DB, 'tenant-fail', period);

    // tenant-ok watermark advanced
    expect(okRow.reported_capture_count).toBe(20);
    // tenant-fail watermark unchanged
    expect(failRow.reported_capture_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Idempotency key format: wrl-meter:{tenantId}:{period}:{captureCount}
// ---------------------------------------------------------------------------

describe('idempotency key format', () => {
  it('sends identifier = wrl-meter:{tenantId}:{period}:{captureCount}', async () => {
    const tenantId = 'id-key-tenant';
    const period = computePeriod();
    await makePaid(env.DB, tenantId, 'cus_idkey');
    await seedUsage(env.DB, tenantId, { period, captureCount: 77, reportedCaptureCount: 0 });

    const mock = stripeMock200();
    vi.stubGlobal('fetch', mock);

    await reportPendingMeterEvents(env, {});

    const [[, opts]] = mock.mock.calls.filter(([u]) => String(u).includes('meter_events'));
    const body = new URLSearchParams(opts.body);
    expect(body.get('identifier')).toBe(`wrl-meter:${tenantId}:${period}:77`);
  });
});

// ---------------------------------------------------------------------------
// 8. Watermark set to snapshot value (captureCount at query time, not current)
// ---------------------------------------------------------------------------

describe('watermark snapshot', () => {
  it('sets reported_capture_count to the exact captureCount value from the query', async () => {
    const tenantId = 'snapshot-tenant';
    const period = computePeriod();
    await makePaid(env.DB, tenantId, 'cus_snap');
    await seedUsage(env.DB, tenantId, { period, captureCount: 100, reportedCaptureCount: 60 });

    vi.stubGlobal('fetch', stripeMock200());

    await reportPendingMeterEvents(env, {});

    const row = await getCounter(env.DB, tenantId, period);
    // Must be exactly 100 (the snapshot), not some higher value
    expect(row.reported_capture_count).toBe(100);
  });
});

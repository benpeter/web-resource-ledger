// Tests for the scheduled() handler triggering meter reporting.
//
// Verifies:
//   1. Hourly tick (UTCMinutes === 0) fires reportPendingMeterEvents
//   2. Non-hourly tick (UTCMinutes !== 0) does NOT fire reportPendingMeterEvents

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index.js';
import { computePeriod } from '../src/db.js';
import { setStripeCustomerId, setPaymentMethodAdded } from '../src/db.js';
import { cleanDb } from './fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a ScheduledController for the given UTC time.
 * @param {Date} date
 */
function makeController(date) {
  return {
    scheduledTime: date.getTime(),
    cron: '0 * * * *',
    noRetry() {},
  };
}

/**
 * Run worker.scheduled() with an execution context and wait for it.
 */
async function runScheduled(date) {
  const ctx = createExecutionContext();
  await worker.scheduled(makeController(date), env, ctx);
  await waitOnExecutionContext(ctx);
}

/**
 * Seed a paid tenant with unreported usage.
 */
async function seedPaidTenantWithDelta(tenantId, captureCount = 50) {
  await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId).run();
  await setStripeCustomerId(env.DB, tenantId, `cus_${tenantId}`);
  await setPaymentMethodAdded(env.DB, tenantId);
  const period = computePeriod();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO usage_counters
       (tenant_id, period, capture_count, reported_capture_count, storage_bytes, api_call_count)
     VALUES (?, ?, ?, 0, 0, 0)`,
  ).bind(tenantId, period, captureCount).run();
  return period;
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
// 1. Hourly tick fires reporting
// ---------------------------------------------------------------------------

describe('hourly tick', () => {
  it('calls Stripe meter_events for a paid tenant with delta when tick is on the hour', async () => {
    const tenantId = 'hourly-tenant';
    const period = await seedPaidTenantWithDelta(tenantId, 30);

    const mock = vi.fn().mockImplementation(async (url) => {
      const urlStr = String(url);
      // Allow Coralogix (log delivery) to pass through silently
      if (urlStr.includes('coralogix')) {
        return new Response('', { status: 200 });
      }
      if (urlStr.includes('api.stripe.com/v1/billing/meter_events')) {
        return new Response(JSON.stringify({ object: 'billing.meter_event' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch in hourly test: ${urlStr}`);
    });
    vi.stubGlobal('fetch', mock);

    // Pick a date where UTCMinutes === 0
    const hourlyDate = new Date('2026-03-23T10:00:00.000Z');
    expect(hourlyDate.getUTCMinutes()).toBe(0);

    await runScheduled(hourlyDate);

    const stripeCalls = mock.mock.calls.filter(([u]) => String(u).includes('meter_events'));
    expect(stripeCalls.length).toBe(1);

    // Watermark should be advanced
    const row = await env.DB.prepare(
      `SELECT reported_capture_count FROM usage_counters WHERE tenant_id = ? AND period = ?`,
    ).bind(tenantId, period).first();
    expect(row.reported_capture_count).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// 2. Non-hourly tick skips reporting
// ---------------------------------------------------------------------------

describe('non-hourly tick', () => {
  it('does NOT call Stripe meter_events when tick is not on the hour', async () => {
    const tenantId = 'non-hourly-tenant';
    await seedPaidTenantWithDelta(tenantId, 30);

    const mock = vi.fn().mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('coralogix')) {
        return new Response('', { status: 200 });
      }
      if (urlStr.includes('api.stripe.com/v1/billing/meter_events')) {
        throw new Error('Stripe should NOT be called on non-hourly tick');
      }
      throw new Error(`Unexpected fetch in non-hourly test: ${urlStr}`);
    });
    vi.stubGlobal('fetch', mock);

    // UTCMinutes = 30 -- not on the hour
    const nonHourlyDate = new Date('2026-03-23T10:30:00.000Z');
    expect(nonHourlyDate.getUTCMinutes()).toBe(30);

    await runScheduled(nonHourlyDate);

    const stripeCalls = mock.mock.calls.filter(([u]) => String(u).includes('meter_events'));
    expect(stripeCalls.length).toBe(0);
  });
});

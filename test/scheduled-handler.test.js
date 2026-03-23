// tva
// Unit tests for the scheduled() handler (handleScheduledTick).
//
// Calls worker.scheduled(controller, env, ctx) directly without going through
// HTTP. Verifies D1 state (captures created, next_run_at advanced) after the
// handler completes.
//
// The scheduled controller is constructed manually:
//   { scheduledTime: <ms>, cron: '*/1 * * * *', noRetry() {} }
//
// QUEUE NOTE: sendBatch succeeds in the test environment because the
// CAPTURE_QUEUE producer binding is defined in wrangler.test.toml.
// Messages are enqueued but not consumed (consumers are omitted from
// wrangler.test.toml to prevent auto-processing).

import { env, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { seedSchedule, seedApiKey, cleanDb, TEST_TENANT_KEY } from './fixtures.js';
import { computePeriod } from '../src/db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal ScheduledController for testing.
 * scheduledTime should be AFTER next_run_at of any due schedules.
 *
 * @param {number} [scheduledTime]  Unix ms timestamp, defaults to now
 */
function makeController(scheduledTime = Date.now()) {
  return {
    scheduledTime,
    cron: '*/1 * * * *',
    noRetry() {},
  };
}

async function runScheduled(controller = makeController()) {
  const ctx = createExecutionContext();
  await worker.scheduled(controller, env, ctx);
}

/**
 * Seed usage_counters for tenant at the current billing period.
 */
async function seedUsage(tenantId, captureCount) {
  const period = computePeriod();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count)
     VALUES (?, ?, ?, 0, 0)`,
  ).bind(tenantId, period, captureCount).run();
}

// A schedule ID that sorts before others to be predictable
const SCHEDULE_A = 'sch_' + 'a'.repeat(32);
const SCHEDULE_B = 'sch_' + 'b'.repeat(32);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanDb(env.DB);
  // Seed the test API key so tenant 'default' exists
  await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'default', scopes: ['capture', 'read'] });
});

// ---------------------------------------------------------------------------
// 1. No due schedules -- handler completes without creating captures
// ---------------------------------------------------------------------------

describe('scheduled handler -- no due schedules', () => {
  it('creates no captures when no schedules are due', async () => {
    // Seed a schedule with next_run_at in the future
    await seedSchedule(env.DB, SCHEDULE_A, {
      tenantId: 'default',
      url: 'https://example.com',
      cron: '0 * * * *',
      nextRunAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
    });

    // Run handler with current time (before next_run_at)
    await runScheduled(makeController(Date.now()));

    const captures = await env.DB.prepare('SELECT * FROM captures').all();
    expect(captures.results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. One due schedule -- creates one pending capture with schedule_id, advances next_run_at
// ---------------------------------------------------------------------------

describe('scheduled handler -- one due schedule', () => {
  it('creates one pending capture with correct schedule_id', async () => {
    const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
    await seedSchedule(env.DB, SCHEDULE_A, {
      tenantId: 'default',
      url: 'https://example.com/scheduled',
      cron: '0 * * * *',
      nextRunAt: pastTime,
    });

    await runScheduled(makeController(Date.now()));

    const captures = await env.DB.prepare('SELECT * FROM captures').all();
    expect(captures.results.length).toBe(1);
    const cap = captures.results[0];
    expect(cap.status).toBe('pending');
    expect(cap.schedule_id).toBe(SCHEDULE_A);
    expect(cap.url).toBe('https://example.com/scheduled');
    expect(cap.tenant_id).toBe('default');
  });

  it('advances next_run_at to a future time after the tick', async () => {
    const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await seedSchedule(env.DB, SCHEDULE_A, {
      tenantId: 'default',
      url: 'https://example.com',
      cron: '0 * * * *',
      nextRunAt: pastTime,
    });

    const tickTime = Date.now();
    await runScheduled(makeController(tickTime));

    const schedule = await env.DB.prepare('SELECT next_run_at FROM schedules WHERE id = ?').bind(SCHEDULE_A).first();
    expect(schedule).not.toBeNull();
    expect(new Date(schedule.next_run_at).getTime()).toBeGreaterThan(tickTime);
  });
});

// ---------------------------------------------------------------------------
// 3. Over-quota tenant -- schedule skipped, next_run_at still advanced
// ---------------------------------------------------------------------------

describe('scheduled handler -- over-quota tenant', () => {
  it('skips capture creation but still advances next_run_at', async () => {
    // Import FREE_CAPTURE_LIMIT dynamically to avoid circular deps
    const { FREE_CAPTURE_LIMIT } = await import('../src/quotas.js');

    const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await seedSchedule(env.DB, SCHEDULE_A, {
      tenantId: 'default',
      url: 'https://example.com',
      cron: '0 * * * *',
      nextRunAt: pastTime,
    });

    // Exhaust quota
    await seedUsage('default', FREE_CAPTURE_LIMIT);

    const tickTime = Date.now();
    await runScheduled(makeController(tickTime));

    // No captures should have been created
    const captures = await env.DB.prepare('SELECT * FROM captures').all();
    expect(captures.results.length).toBe(0);

    // But next_run_at should have advanced (schedule not stuck)
    const schedule = await env.DB.prepare('SELECT next_run_at FROM schedules WHERE id = ?').bind(SCHEDULE_A).first();
    expect(schedule).not.toBeNull();
    expect(new Date(schedule.next_run_at).getTime()).toBeGreaterThan(tickTime);
  });
});

// ---------------------------------------------------------------------------
// 4. Paused schedule -- not processed
// ---------------------------------------------------------------------------

describe('scheduled handler -- paused schedule', () => {
  it('does not create a capture for a paused schedule', async () => {
    const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await seedSchedule(env.DB, SCHEDULE_B, {
      tenantId: 'default',
      url: 'https://example.com/paused',
      cron: '0 * * * *',
      nextRunAt: pastTime,
      paused: 1,
    });

    await runScheduled(makeController(Date.now()));

    const captures = await env.DB.prepare('SELECT * FROM captures').all();
    expect(captures.results.length).toBe(0);
  });

  it('does not advance next_run_at for a paused schedule', async () => {
    const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await seedSchedule(env.DB, SCHEDULE_B, {
      tenantId: 'default',
      url: 'https://example.com/paused',
      cron: '0 * * * *',
      nextRunAt: pastTime,
      paused: 1,
    });

    await runScheduled(makeController(Date.now()));

    // next_run_at should remain unchanged (paused schedules are not queried by getDueSchedules)
    const schedule = await env.DB.prepare('SELECT next_run_at FROM schedules WHERE id = ?').bind(SCHEDULE_B).first();
    expect(schedule.next_run_at).toBe(pastTime);
  });
});

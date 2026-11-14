// Captures still pending a day after they were created (phase 0139). Production
// had 8 captures pending since July to September 2026: their queue messages were
// lost, nothing would ever finish them, and the API, dashboard and MCP showed
// them as in progress for months.

import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { MINUTE_CRON } from '../src/crons.js';
import { failStaleCaptures } from '../src/stale-captures.js';
import { seedCapture, seedSchedule, cleanDb } from './fixtures.js';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const ago = (hours) => new Date(NOW.getTime() - hours * HOUR).toISOString();

const STALE = 'cap_' + '1'.repeat(32);
const RECENT = 'cap_' + '2'.repeat(32);
const OLD_COMPLETE = 'cap_' + '3'.repeat(32);
const STALE_WITH_REASON = 'cap_' + '4'.repeat(32);
const SCH = 'sch_' + '5'.repeat(32);

async function captureRow(id) {
  return env.DB.prepare('SELECT status, error, retryable, failed_at FROM captures WHERE id = ?').bind(id).first();
}

beforeEach(async () => {
  await cleanDb(env.DB);
});

describe('failStaleCaptures', () => {
  it('fails a capture still pending after 24 hours', async () => {
    await seedCapture(env.DB, STALE, { createdAt: ago(25) });
    await failStaleCaptures(env, NOW);
    const row = await captureRow(STALE);
    expect(row.status).toBe('failed');
    expect(row.error).toBe('WRL lost track of this capture before it finished.');
    expect(row.retryable).toBe(1);
    expect(row.failed_at).toBe(NOW.toISOString());
  });

  it('leaves a capture pending for less than 24 hours and an old complete capture alone', async () => {
    await seedCapture(env.DB, RECENT, { createdAt: ago(23) });
    await seedCapture(env.DB, OLD_COMPLETE, { status: 'complete', createdAt: ago(48), completedAt: ago(48) });
    await failStaleCaptures(env, NOW);
    expect((await captureRow(RECENT)).status).toBe('pending');
    expect((await captureRow(OLD_COMPLETE)).status).toBe('complete');
  });

  it('keeps the reason of the last failed attempt', async () => {
    await seedCapture(env.DB, STALE_WITH_REASON, {
      createdAt: ago(30),
      error: 'Page did not finish loading within 20 seconds',
    });
    await failStaleCaptures(env, NOW);
    expect((await captureRow(STALE_WITH_REASON)).error).toBe(
      'Page did not finish loading within 20 seconds. WRL then lost track of the capture.',
    );
  });

  it("updates the schedule's last capture status", async () => {
    await seedSchedule(env.DB, SCH, { lastCaptureId: STALE, lastCaptureStatus: 'pending' });
    await seedCapture(env.DB, STALE, { createdAt: ago(25), scheduleId: SCH });
    await failStaleCaptures(env, NOW);
    const sch = await env.DB.prepare('SELECT last_capture_status FROM schedules WHERE id = ?').bind(SCH).first();
    expect(sch.last_capture_status).toBe('failed');
  });
});

describe('scheduled() runs the sweep on the hour', () => {
  it('fails stale captures at minute 0', async () => {
    await seedCapture(env.DB, STALE, { createdAt: ago(25) });
    const ctx = createExecutionContext();
    await worker.scheduled({ cron: MINUTE_CRON, scheduledTime: NOW.getTime(), noRetry() {} }, env, ctx);
    await waitOnExecutionContext(ctx);
    expect((await captureRow(STALE)).status).toBe('failed');
  });

  it('does not run in the other minutes', async () => {
    await seedCapture(env.DB, STALE, { createdAt: ago(25) });
    const ctx = createExecutionContext();
    await worker.scheduled({ cron: MINUTE_CRON, scheduledTime: NOW.getTime() + 5 * 60 * 1000, noRetry() {} }, env, ctx);
    await waitOnExecutionContext(ctx);
    expect((await captureRow(STALE)).status).toBe('pending');
  });
});

// tva
// Schedule management (phase 0132): edit and pause schedules, keep the last
// capture status current, and compare a schedule's captures only with captures
// of the same URL.

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TEST_TENANT_KEY,
  TEST_SCHEDULE_ID,
  seedApiKey,
  seedSchedule,
  seedCapture,
  cleanDb,
} from './fixtures.js';
import {
  getDueSchedules,
  completeCapture,
  failCapture,
  failCaptureAfterRetries,
  getPreviousCaptureId,
} from '../src/db.js';

// IP-literal URLs pass SSRF validation without a DNS lookup.
const URL_A = 'https://93.184.216.34/page';
const URL_B = 'https://93.184.216.35/other';
const OTHER_TENANT_SCHEDULE = 'sch_' + 'f'.repeat(32);
const READ_ONLY_KEY = 'wrl_live_' + 'r'.repeat(43);

let ipCounter = 10;
function nextIp() {
  return `198.51.100.${ipCounter++}`;
}

function patch(scheduleId, body, { key = TEST_TENANT_KEY, contentType = 'application/json' } = {}) {
  return SELF.fetch(`https://worker.test/v1/schedules/${scheduleId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': contentType,
      Authorization: `Bearer ${key}`,
      'CF-Connecting-IP': nextIp(),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function scheduleRow(id) {
  return env.DB.prepare('SELECT * FROM schedules WHERE id = ?').bind(id).first();
}

beforeEach(async () => {
  await cleanDb(env.DB);
  await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'default', scopes: ['capture', 'read'] });
});

afterEach(() => cleanDb(env.DB));

// ---------------------------------------------------------------------------
// PATCH /v1/schedules/:id
// ---------------------------------------------------------------------------

describe('PATCH /v1/schedules/:id -- edit', () => {
  it('renames a schedule and leaves url, cron and next run alone', async () => {
    const nextRunAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { url: URL_A, name: 'Old name', nextRunAt });

    const res = await patch(TEST_SCHEDULE_ID, { name: 'New name' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(TEST_SCHEDULE_ID);
    expect(body.name).toBe('New name');
    expect(body.url).toBe(URL_A);
    expect(body.cron).toBe('0 * * * *');
    expect(body.nextRunAt).toBe(nextRunAt);
    expect(body.updatedAt).toBeTruthy();
  });

  it('changes the URL after validating it', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { url: URL_A });
    const res = await patch(TEST_SCHEDULE_ID, { url: URL_B });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe(URL_B);
    expect((await scheduleRow(TEST_SCHEDULE_ID)).url).toBe(URL_B);
  });

  it('refuses a URL that points to a private address and keeps the old one', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { url: URL_A });
    const res = await patch(TEST_SCHEDULE_ID, { url: 'http://10.0.0.1/admin' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect((await scheduleRow(TEST_SCHEDULE_ID)).url).toBe(URL_A);
  });

  it('changing the cron recomputes the next run from now', async () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { url: URL_A, nextRunAt: farFuture });

    const res = await patch(TEST_SCHEDULE_ID, { cron: '0 0 * * *' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cron).toBe('0 0 * * *');
    const next = Date.parse(body.nextRunAt);
    expect(next).toBeGreaterThan(Date.now());
    expect(next).toBeLessThanOrEqual(Date.now() + 24 * 3600 * 1000 + 60_000);
  });

  it('refuses a cron that runs more often than hourly', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { url: URL_A });
    const res = await patch(TEST_SCHEDULE_ID, { cron: '*/5 * * * *' });
    expect(res.status).toBe(400);
    expect((await scheduleRow(TEST_SCHEDULE_ID)).cron).toBe('0 * * * *');
  });
});

describe('PATCH /v1/schedules/:id -- pause and resume', () => {
  it('pausing keeps the schedule out of the scheduler', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, {
      url: URL_A,
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const res = await patch(TEST_SCHEDULE_ID, { paused: true });
    expect(res.status).toBe(200);
    expect((await res.json()).paused).toBe(true);

    const due = await getDueSchedules(env.DB, new Date(Date.now() + 3600_000).toISOString());
    expect(due.map((s) => s.id)).not.toContain(TEST_SCHEDULE_ID);
  });

  it('resuming moves a missed next run into the future instead of running at once', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, {
      url: URL_A,
      paused: 1,
      nextRunAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    });

    const res = await patch(TEST_SCHEDULE_ID, { paused: false });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paused).toBe(false);
    expect(Date.parse(body.nextRunAt)).toBeGreaterThan(Date.now());
  });

  it('pausing an already paused schedule changes nothing else', async () => {
    const nextRunAt = new Date(Date.now() + 3600_000).toISOString();
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { url: URL_A, paused: 1, nextRunAt });
    const res = await patch(TEST_SCHEDULE_ID, { paused: true });
    expect(res.status).toBe(200);
    expect((await res.json()).nextRunAt).toBe(nextRunAt);
  });
});

describe('PATCH /v1/schedules/:id -- input checks', () => {
  beforeEach(() => seedSchedule(env.DB, TEST_SCHEDULE_ID, { url: URL_A }));

  it('rejects an empty body', async () => {
    const res = await patch(TEST_SCHEDULE_ID, {});
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toMatch(/name, url, cron, paused/);
  });

  it('rejects unknown fields', async () => {
    const res = await patch(TEST_SCHEDULE_ID, { tenant_id: 'someone-else' });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toMatch(/tenant_id/);
  });

  it('rejects a paused value that is not a boolean', async () => {
    const res = await patch(TEST_SCHEDULE_ID, { paused: 'yes' });
    expect(res.status).toBe(400);
  });

  it('rejects a name with characters outside the allowed set', async () => {
    const res = await patch(TEST_SCHEDULE_ID, { name: '<script>' });
    expect(res.status).toBe(400);
  });

  it('rejects a body that is not JSON', async () => {
    const res = await patch(TEST_SCHEDULE_ID, 'name=x', { contentType: 'application/x-www-form-urlencoded' });
    expect(res.status).toBe(415);
  });
});

describe('PATCH /v1/schedules/:id -- access', () => {
  it('returns 404 for a schedule that does not exist', async () => {
    const res = await patch('sch_' + '0'.repeat(32), { name: 'x' });
    expect(res.status).toBe(404);
  });

  it("returns 404 for another tenant's schedule and leaves it unchanged", async () => {
    await seedSchedule(env.DB, OTHER_TENANT_SCHEDULE, { tenantId: 'other-tenant', name: 'Theirs' });
    const res = await patch(OTHER_TENANT_SCHEDULE, { name: 'Mine now' });
    expect(res.status).toBe(404);
    expect((await scheduleRow(OTHER_TENANT_SCHEDULE)).name).toBe('Theirs');
  });

  it('requires the capture scope', async () => {
    await seedApiKey(env.DB, READ_ONLY_KEY, { tenantId: 'default', scopes: ['read'], name: 'read-only' });
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { url: URL_A });
    const res = await patch(TEST_SCHEDULE_ID, { paused: true }, { key: READ_ONLY_KEY });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Last capture status follows the capture
// ---------------------------------------------------------------------------

describe("a schedule's last capture status follows the capture", () => {
  const CAP = 'cap_' + '1'.repeat(32);
  const OLDER = 'cap_' + '2'.repeat(32);

  beforeEach(async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, {
      url: URL_A,
      lastCaptureId: CAP,
      lastCaptureStatus: 'pending',
      lastRunAt: new Date().toISOString(),
    });
    await seedCapture(env.DB, CAP, { url: URL_A, scheduleId: TEST_SCHEDULE_ID });
  });

  it('becomes complete when the capture completes', async () => {
    await completeCapture(env.DB, CAP, { screenshot: 'x' });
    expect((await scheduleRow(TEST_SCHEDULE_ID)).last_capture_status).toBe('complete');
  });

  it('becomes failed when the capture fails', async () => {
    await failCapture(env.DB, CAP, 'The page did not finish loading within 20 seconds', false);
    expect((await scheduleRow(TEST_SCHEDULE_ID)).last_capture_status).toBe('failed');
  });

  it('becomes failed when the capture fails after retries', async () => {
    await failCaptureAfterRetries(env.DB, CAP, 4);
    expect((await scheduleRow(TEST_SCHEDULE_ID)).last_capture_status).toBe('failed');
  });

  it('is not overwritten by an older capture of the same schedule', async () => {
    await seedCapture(env.DB, OLDER, { url: URL_A, scheduleId: TEST_SCHEDULE_ID });
    await failCapture(env.DB, OLDER, 'old failure', false);
    expect((await scheduleRow(TEST_SCHEDULE_ID)).last_capture_status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// Change detection compares captures of the same URL only
// ---------------------------------------------------------------------------

describe('getPreviousCaptureId -- same URL only', () => {
  const FIRST = 'cap_' + 'a'.repeat(32);
  const SECOND = 'cap_' + 'b'.repeat(32);
  const t1 = '2026-10-20T10:00:00.000Z';
  const t2 = '2026-10-21T10:00:00.000Z';

  beforeEach(() => seedSchedule(env.DB, TEST_SCHEDULE_ID, { url: URL_A }));

  it('returns the previous capture when the URL is unchanged', async () => {
    await seedCapture(env.DB, FIRST, { url: URL_A, status: 'complete', createdAt: t1, scheduleId: TEST_SCHEDULE_ID });
    await seedCapture(env.DB, SECOND, { url: URL_A, status: 'complete', createdAt: t2, scheduleId: TEST_SCHEDULE_ID });
    expect(await getPreviousCaptureId(env.DB, TEST_SCHEDULE_ID, SECOND)).toBe(FIRST);
  });

  it('returns null after the schedule URL changed, so the new URL starts a fresh baseline', async () => {
    await seedCapture(env.DB, FIRST, { url: URL_A, status: 'complete', createdAt: t1, scheduleId: TEST_SCHEDULE_ID });
    await seedCapture(env.DB, SECOND, { url: URL_B, status: 'complete', createdAt: t2, scheduleId: TEST_SCHEDULE_ID });
    expect(await getPreviousCaptureId(env.DB, TEST_SCHEDULE_ID, SECOND)).toBeNull();
  });
});

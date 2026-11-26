// tva
// Watch lists (backlog #59): a schedule with several URLs. Creating and
// editing the list through the API, and the scheduler capturing every URL of
// a due schedule in one run.

import { env, SELF, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import worker from '../src/index.js';
import {
  TEST_TENANT_KEY,
  TEST_SCHEDULE_ID,
  seedApiKey,
  seedSchedule,
  cleanDb,
} from './fixtures.js';
import { computePeriod } from '../src/db.js';
import { FREE_CAPTURE_LIMIT } from '../src/quotas.js';

// IP-literal URLs pass SSRF validation without a DNS lookup.
const URL_A = 'https://93.184.216.34/a';
const URL_B = 'https://93.184.216.34/b';
const URL_C = 'https://93.184.216.35/c';

let ipCounter = 10;
function nextIp() {
  return `203.0.113.${ipCounter++}`;
}

function send(method, path, body) {
  return SELF.fetch(`https://worker.test${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_TENANT_KEY}`,
      'CF-Connecting-IP': nextIp(),
    },
    body: JSON.stringify(body),
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
// POST /v1/schedules with urls
// ---------------------------------------------------------------------------

describe('POST /v1/schedules -- urls', () => {
  it('creates a schedule with several URLs; url is the first of them', async () => {
    const res = await send('POST', '/v1/schedules', { urls: [URL_A, URL_B, URL_C], cron: '0 6 * * *', name: 'Watch list' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.urls).toEqual([URL_A, URL_B, URL_C]);
    expect(body.url).toBe(URL_A);

    const row = await scheduleRow(body.id);
    expect(row.url).toBe(URL_A);
    expect(JSON.parse(row.urls)).toEqual([URL_A, URL_B, URL_C]);
  });

  it('a single-URL schedule lists its one URL in urls', async () => {
    const res = await send('POST', '/v1/schedules', { url: URL_A, cron: '0 6 * * *', name: 'One page' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toBe(URL_A);
    expect(body.urls).toEqual([URL_A]);
    expect((await scheduleRow(body.id)).urls).toBeNull();
  });

  it('urls with one entry is stored like a single-URL schedule', async () => {
    const res = await send('POST', '/v1/schedules', { urls: [URL_B], cron: '0 6 * * *', name: 'One page' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toBe(URL_B);
    expect(body.urls).toEqual([URL_B]);
    expect((await scheduleRow(body.id)).urls).toBeNull();
  });

  it('returns 400 when both url and urls are given', async () => {
    const res = await send('POST', '/v1/schedules', { url: URL_A, urls: [URL_B], cron: '0 6 * * *', name: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain("either 'url' or 'urls'");
  });

  it('returns 400 when neither url nor urls is given', async () => {
    const res = await send('POST', '/v1/schedules', { cron: '0 6 * * *', name: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain("'url' or 'urls'");
  });

  it('returns 400 for an empty urls array', async () => {
    const res = await send('POST', '/v1/schedules', { urls: [], cron: '0 6 * * *', name: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain('1 to 100');
  });

  it('returns 400 for more than 100 URLs', async () => {
    const urls = Array.from({ length: 101 }, (_, i) => `https://93.184.216.34/p${i}`);
    const res = await send('POST', '/v1/schedules', { urls, cron: '0 6 * * *', name: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain('1 to 100');
  });

  it('returns 400 when urls is not an array of strings', async () => {
    const res = await send('POST', '/v1/schedules', { urls: [URL_A, 42], cron: '0 6 * * *', name: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain('urls[1]');
  });

  it('returns 400 naming the entry that fails URL validation', async () => {
    const res = await send('POST', '/v1/schedules', { urls: [URL_A, 'ftp://93.184.216.34/file'], cron: '0 6 * * *', name: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain('urls[1]');
  });

  it('returns 400 when a URL is listed twice', async () => {
    const res = await send('POST', '/v1/schedules', { urls: [URL_A, URL_B, URL_A], cron: '0 6 * * *', name: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain('urls[2]');
  });

  it('lists a watch list with its urls', async () => {
    await send('POST', '/v1/schedules', { urls: [URL_A, URL_B], cron: '0 6 * * *', name: 'Watch list' });
    const res = await SELF.fetch('https://worker.test/v1/schedules', {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}`, 'CF-Connecting-IP': nextIp() },
    });
    const body = await res.json();
    expect(body.data[0].urls).toEqual([URL_A, URL_B]);
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/schedules/:id with urls
// ---------------------------------------------------------------------------

describe('PATCH /v1/schedules/:id -- urls', () => {
  it('replaces the list; url becomes the first new URL', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { urls: [URL_A, URL_B] });
    const res = await send('PATCH', `/v1/schedules/${TEST_SCHEDULE_ID}`, { urls: [URL_C, URL_A] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.urls).toEqual([URL_C, URL_A]);
    expect(body.url).toBe(URL_C);
    const row = await scheduleRow(TEST_SCHEDULE_ID);
    expect(row.url).toBe(URL_C);
    expect(JSON.parse(row.urls)).toEqual([URL_C, URL_A]);
  });

  it('url on a watch list makes it a single-URL schedule', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { urls: [URL_A, URL_B] });
    const res = await send('PATCH', `/v1/schedules/${TEST_SCHEDULE_ID}`, { url: URL_C });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe(URL_C);
    expect(body.urls).toEqual([URL_C]);
    expect((await scheduleRow(TEST_SCHEDULE_ID)).urls).toBeNull();
  });

  it('turns a single-URL schedule into a watch list', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { url: URL_A });
    const res = await send('PATCH', `/v1/schedules/${TEST_SCHEDULE_ID}`, { urls: [URL_A, URL_B] });
    expect(res.status).toBe(200);
    expect((await res.json()).urls).toEqual([URL_A, URL_B]);
  });

  it('a name change leaves the list alone', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { urls: [URL_A, URL_B] });
    const res = await send('PATCH', `/v1/schedules/${TEST_SCHEDULE_ID}`, { name: 'Renamed' });
    expect(res.status).toBe(200);
    expect((await res.json()).urls).toEqual([URL_A, URL_B]);
  });

  it('returns 400 when both url and urls are given', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { urls: [URL_A, URL_B] });
    const res = await send('PATCH', `/v1/schedules/${TEST_SCHEDULE_ID}`, { url: URL_C, urls: [URL_A] });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toContain("either 'url' or 'urls'");
  });
});

// ---------------------------------------------------------------------------
// Scheduler: one capture per URL
// ---------------------------------------------------------------------------

async function runScheduled(scheduledTime = Date.now()) {
  const ctx = createExecutionContext();
  await worker.scheduled({ scheduledTime, cron: '*/1 * * * *', noRetry() {} }, env, ctx);
}

async function seedUsage(tenantId, captureCount) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count)
     VALUES (?, ?, ?, 0, 0)`,
  ).bind(tenantId, computePeriod(), captureCount).run();
}

describe('scheduled handler -- watch list', () => {
  const pastTime = () => new Date(Date.now() - 5 * 60 * 1000).toISOString();

  it('creates one capture per URL, all linked to the schedule', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { urls: [URL_A, URL_B, URL_C], nextRunAt: pastTime() });
    const tickTime = Date.now();
    await runScheduled(tickTime);

    const captures = await env.DB.prepare('SELECT url, schedule_id, status FROM captures ORDER BY url').all();
    expect(captures.results.map((c) => c.url)).toEqual([URL_A, URL_B, URL_C]);
    for (const c of captures.results) {
      expect(c.schedule_id).toBe(TEST_SCHEDULE_ID);
      expect(c.status).toBe('pending');
    }

    const row = await scheduleRow(TEST_SCHEDULE_ID);
    expect(new Date(row.next_run_at).getTime()).toBeGreaterThan(tickTime);
    expect(row.last_capture_status).toBe('pending');
    const last = await env.DB.prepare('SELECT url FROM captures WHERE id = ?').bind(row.last_capture_id).first();
    expect(last.url).toBe(URL_C);
  });

  it('skips the whole run when the quota cannot cover every URL', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { urls: [URL_A, URL_B, URL_C], nextRunAt: pastTime() });
    await seedUsage('default', FREE_CAPTURE_LIMIT - 2);
    const tickTime = Date.now();
    await runScheduled(tickTime);

    const captures = await env.DB.prepare('SELECT * FROM captures').all();
    expect(captures.results.length).toBe(0);
    const row = await scheduleRow(TEST_SCHEDULE_ID);
    expect(row.last_capture_status).toBe('skipped');
    expect(new Date(row.next_run_at).getTime()).toBeGreaterThan(tickTime);
  });
});

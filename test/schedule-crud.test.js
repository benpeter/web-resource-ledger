// tva
// Integration tests for schedule CRUD endpoints.
// Uses SELF.fetch() -- all requests go through the real worker.
// D1 is real (miniflare-backed). Auth uses seedApiKey + TEST_TENANT_KEY.
//
// IMPORTANT: schedule endpoints share rate limiters with capture endpoints.
// Each describe block uses a distinct CF-Connecting-IP to avoid cross-test
// rate limit exhaustion. IP is scoped to the describe block via closure.

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TEST_TENANT_KEY,
  TEST_SCHEDULE_ID,
  seedApiKey,
  seedSchedule,
  cleanDb,
} from './fixtures.js';

// Use an IP-based URL that passes SSRF validation (bypasses hostname-based DNS check).
const VALID_SCHEDULE_URL = 'https://93.184.216.34/page';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_AUTH = `Bearer ${TEST_TENANT_KEY}`;

let ipCounter = 100;
function nextIp() {
  return `192.0.2.${ipCounter++}`;
}

function makePost(ip) {
  return (body) => SELF.fetch('https://worker.test/v1/schedules', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: TENANT_AUTH,
      'CF-Connecting-IP': ip,
    },
    body: JSON.stringify(body),
  });
}

function makeGet(ip) {
  return () => SELF.fetch('https://worker.test/v1/schedules', {
    headers: {
      Authorization: TENANT_AUTH,
      'CF-Connecting-IP': ip,
    },
  });
}

function makeGetOne(ip) {
  return (scheduleId) => SELF.fetch(`https://worker.test/v1/schedules/${scheduleId}`, {
    headers: {
      Authorization: TENANT_AUTH,
      'CF-Connecting-IP': ip,
    },
  });
}

function makeDelete(ip) {
  return (scheduleId) => SELF.fetch(`https://worker.test/v1/schedules/${scheduleId}`, {
    method: 'DELETE',
    headers: {
      Authorization: TENANT_AUTH,
      'CF-Connecting-IP': ip,
    },
  });
}

async function setup() {
  await cleanDb(env.DB);
  await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'default', scopes: ['capture', 'read'] });
}

const VALID_CREATE_BODY = {
  url: VALID_SCHEDULE_URL,
  cron: '0 * * * *',
  name: 'Test Schedule',
};

// ---------------------------------------------------------------------------
// POST /v1/schedules
// ---------------------------------------------------------------------------

describe('POST /v1/schedules', () => {
  let post;
  beforeEach(async () => {
    post = makePost(nextIp());
    await setup();
  });
  afterEach(() => cleanDb(env.DB));

  it('returns 201 with sch_ prefixed id', async () => {
    const res = await post(VALID_CREATE_BODY);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^sch_[a-f0-9]{32}$/);
  });

  it('returns url, cron, name, nextRunAt, paused=false in 201 response', async () => {
    const res = await post(VALID_CREATE_BODY);
    const body = await res.json();
    expect(body.url).toBe(VALID_SCHEDULE_URL);
    expect(body.cron).toBe('0 * * * *');
    expect(body.name).toBe('Test Schedule');
    expect(body.nextRunAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.paused).toBe(false);
  });

  it('returns 400 when url is missing', async () => {
    const res = await post({ cron: '0 * * * *', name: 'x' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('url');
  });

  it('returns 400 when cron is missing', async () => {
    const res = await post({ url: VALID_SCHEDULE_URL, name: 'x' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('cron');
  });

  it('returns 400 when name is missing', async () => {
    const res = await post({ url: VALID_SCHEDULE_URL, cron: '0 * * * *' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('name');
  });

  it('returns 400 for invalid cron expression', async () => {
    const res = await post({ url: VALID_SCHEDULE_URL, name: 'x', cron: 'not-a-cron' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for sub-hourly cron expression', async () => {
    const res = await post({ url: VALID_SCHEDULE_URL, name: 'x', cron: '*/5 * * * *' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/minute|interval|frequently/i);
  });

  it('returns 400 for unknown fields', async () => {
    const res = await post({
      url: VALID_SCHEDULE_URL,
      cron: '0 * * * *',
      name: 'x',
      description: 'should fail',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('description');
    expect(body.detail).toContain('Allowed fields');
  });

  it('returns 401 without auth', async () => {
    const res = await SELF.fetch('https://worker.test/v1/schedules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': nextIp(),
      },
      body: JSON.stringify(VALID_CREATE_BODY),
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/schedules
// ---------------------------------------------------------------------------

describe('GET /v1/schedules', () => {
  let get;
  beforeEach(async () => {
    get = makeGet(nextIp());
    await setup();
  });
  afterEach(() => cleanDb(env.DB));

  it('returns empty data array for tenant with no schedules', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  it('returns tenant-scoped schedule list', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { tenantId: 'default' });
    const res = await get();
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(TEST_SCHEDULE_ID);
  });

  it('does not return another tenants schedules', async () => {
    const otherId = 'sch_' + 'd'.repeat(32);
    await seedSchedule(env.DB, otherId, { tenantId: 'other-tenant' });

    const res = await get();
    const body = await res.json();
    const found = body.data.find(s => s.id === otherId);
    expect(found).toBeUndefined();
  });

  it('returns 401 without auth', async () => {
    const res = await SELF.fetch('https://worker.test/v1/schedules', {
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/schedules/:id
// ---------------------------------------------------------------------------

describe('GET /v1/schedules/:id', () => {
  let getOne;
  beforeEach(async () => {
    getOne = makeGetOne(nextIp());
    await setup();
  });
  afterEach(() => cleanDb(env.DB));

  it('returns 404 for non-existent schedule', async () => {
    const nonExistentId = 'sch_' + '0'.repeat(32);
    const res = await getOne(nonExistentId);
    expect(res.status).toBe(404);
  });

  it('returns 404 for another tenants schedule (IDOR protection)', async () => {
    const otherId = 'sch_' + 'e'.repeat(32);
    await seedSchedule(env.DB, otherId, { tenantId: 'other-tenant' });

    const res = await getOne(otherId);
    expect(res.status).toBe(404);
  });

  it('returns schedule object for own schedule', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, {
      tenantId: 'default',
      url: 'https://example.com',
      name: 'My Schedule',
      cron: '0 9 * * 1',
    });

    const res = await getOne(TEST_SCHEDULE_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(TEST_SCHEDULE_ID);
    expect(body.url).toBe('https://example.com');
    expect(body.name).toBe('My Schedule');
    expect(body.cron).toBe('0 9 * * 1');
    expect(typeof body.paused).toBe('boolean');
    expect(body.nextRunAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/schedules/:id
// ---------------------------------------------------------------------------

describe('DELETE /v1/schedules/:id', () => {
  let del;
  beforeEach(async () => {
    del = makeDelete(nextIp());
    await setup();
  });
  afterEach(() => cleanDb(env.DB));

  it('returns 200 with id and deleted: true', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { tenantId: 'default' });

    const res = await del(TEST_SCHEDULE_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(TEST_SCHEDULE_ID);
    expect(body.deleted).toBe(true);
  });

  it('returns 404 for non-existent schedule', async () => {
    const nonExistentId = 'sch_' + '0'.repeat(32);
    const res = await del(nonExistentId);
    expect(res.status).toBe(404);
  });

  it('returns 404 for another tenants schedule (no information disclosure)', async () => {
    const otherId = 'sch_' + 'f'.repeat(32);
    await seedSchedule(env.DB, otherId, { tenantId: 'other-tenant' });

    const res = await del(otherId);
    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    await seedSchedule(env.DB, TEST_SCHEDULE_ID, { tenantId: 'default' });
    const res = await SELF.fetch(`https://worker.test/v1/schedules/${TEST_SCHEDULE_ID}`, {
      method: 'DELETE',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(401);
  });
});

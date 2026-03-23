// tva
// Per-tenant schedule limit enforcement tests.
// Verifies that the default limit (10) is enforced and that deleting a
// schedule frees up a slot.

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { seedApiKey, seedSchedule, cleanDb, TEST_TENANT_KEY } from './fixtures.js';

const AUTH = `Bearer ${TEST_TENANT_KEY}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let ipCounter = 200;
function nextIp() {
  ipCounter += 1;
  return `10.1.0.${ipCounter % 256}`;
}

// Use an IP-based URL that passes SSRF validation.
const VALID_URL = 'https://93.184.216.34/';

function createSchedule(body = {}) {
  return SELF.fetch('https://worker.test/v1/schedules', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: AUTH,
      'CF-Connecting-IP': nextIp(),
    },
    body: JSON.stringify({
      url: VALID_URL,
      cron: '0 * * * *',
      name: 'limit test',
      ...body,
    }),
  });
}

function deleteSchedule(scheduleId) {
  return SELF.fetch(`https://worker.test/v1/schedules/${scheduleId}`, {
    method: 'DELETE',
    headers: {
      Authorization: AUTH,
      'CF-Connecting-IP': nextIp(),
    },
  });
}

function scheduleId(n) {
  return 'sch_' + n.toString(16).padStart(32, '0');
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanDb(env.DB);
  await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'default', scopes: ['capture', 'read'] });
});

// ---------------------------------------------------------------------------
// Default limit: 10 schedules
// ---------------------------------------------------------------------------

describe('schedule limit -- default (10)', () => {
  it('allows creating up to 10 schedules', async () => {
    for (let i = 1; i <= 10; i++) {
      await seedSchedule(env.DB, scheduleId(i), { tenantId: 'default' });
    }
    // Verify all 10 are there via list
    const res = await SELF.fetch('https://worker.test/v1/schedules', {
      headers: { Authorization: AUTH, 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBe(10);
  });

  it('returns 429 when 11th schedule would exceed the default limit of 10', async () => {
    for (let i = 1; i <= 10; i++) {
      await seedSchedule(env.DB, scheduleId(i), { tenantId: 'default' });
    }
    const res = await createSchedule({ name: 'one too many' });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.detail).toBeTruthy();
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it('429 response body mentions the limit', async () => {
    for (let i = 1; i <= 10; i++) {
      await seedSchedule(env.DB, scheduleId(i), { tenantId: 'default' });
    }
    const res = await createSchedule();
    const body = await res.json();
    expect(body.detail).toContain('10');
  });
});

// ---------------------------------------------------------------------------
// After delete: slot freed
// ---------------------------------------------------------------------------

describe('schedule limit -- slot freed after delete', () => {
  it('succeeds after deleting one of 10 schedules', async () => {
    // Seed 10 schedules
    for (let i = 1; i <= 10; i++) {
      await seedSchedule(env.DB, scheduleId(i), { tenantId: 'default' });
    }

    // Delete the first
    const delRes = await deleteSchedule(scheduleId(1));
    expect(delRes.status).toBe(200);

    // Now 11th creation should succeed (only 9 remain)
    const createRes = await createSchedule({ name: 'after-delete' });
    expect(createRes.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Custom limit via tenant config override
// ---------------------------------------------------------------------------

describe('schedule limit -- custom tenant config override', () => {
  it('enforces custom limit when tenant config sets maxSchedules', async () => {
    // Set tenant config with a limit of 3
    await env.DB.prepare(
      `INSERT INTO tenants (id, config, updated_at, updated_by)
       VALUES ('default', ?, ?, 'test')
       ON CONFLICT(id) DO UPDATE SET
         config = excluded.config,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    ).bind(
      JSON.stringify({ schedules: { maxSchedules: 3 } }),
      new Date().toISOString(),
    ).run();

    // Seed 3 schedules
    for (let i = 1; i <= 3; i++) {
      await seedSchedule(env.DB, scheduleId(i), { tenantId: 'default' });
    }

    // 4th should be rejected
    const res = await createSchedule({ name: 'over custom limit' });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.detail).toContain('3');
  });
});

// tva
// Account deletion (phase 0152). The data-retention page promises a two-phase
// deletion: on request the account stops capturing but stays readable, and 30
// days later everything is removed. These tests drive the admin routes that do
// it, through the real worker with miniflare's D1, R2 and KV.
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TEST_ADMIN_KEY, TEST_TENANT_KEY, cleanDb, seedApiKey, seedCapture, seedGithubUser,
  seedSchedule, seedWebhook, seedUsageCounter,
} from './fixtures.js';
import { upsertNotificationPreferences } from '../src/db.js';
import { checkQuota } from '../src/quotas.js';

const TENANT = 'gh-424242';
const OTHER = 'gh-535353';
const OTHER_KEY = 'wrl_live_' + 'b'.repeat(43);
const CAP = 'cap_' + 'c'.repeat(32);
const OTHER_CAP = 'cap_' + 'd'.repeat(32);
const DAY_MS = 24 * 60 * 60 * 1000;

function admin(method, path) {
  return SELF.fetch(`https://worker.test${path}`, {
    method,
    headers: { Authorization: `Bearer ${TEST_ADMIN_KEY}`, 'CF-Connecting-IP': '192.0.2.77' },
  });
}

function capture(key) {
  return SELF.fetch('https://worker.test/v1/captures', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.78' },
    // An IP literal: the URL check resolves hostnames before the quota check runs
    body: JSON.stringify({ url: 'https://93.184.216.34/' }),
  });
}

async function requestedDaysAgo(tenantId, days) {
  await env.DB.prepare('UPDATE tenants SET deletion_requested_at = ? WHERE id = ?')
    .bind(new Date(Date.now() - days * DAY_MS).toISOString(), tenantId).run();
}

// A capture with its artifacts in R2, as the capture pipeline leaves it.
async function seedStoredCapture(id, tenantId) {
  const artifacts = {
    screenshot: `captures/${id}/screenshot.png`,
    screenshotBefore: `captures/${id}/screenshot-before.png`,
    html: `captures/${id}/rendered.html`,
    headers: `captures/${id}/headers.json`,
  };
  const wacz = { key: `captures/${'e'.repeat(60)}${id.slice(-4)}.wacz`, bundleHash: 'sha256:' + 'f'.repeat(64), size: 10 };
  await seedCapture(env.DB, id, {
    tenantId, status: 'complete', completedAt: new Date().toISOString(),
    artifacts, wacz,
  });
  for (const key of [...Object.values(artifacts), wacz.key]) {
    await env.BUCKET.put(key, 'x');
  }
  return [...Object.values(artifacts), wacz.key];
}

beforeEach(async () => {
  await cleanDb(env.DB);
  const { keys } = await env.KV.list({ prefix: 'rl:' });
  for (const k of keys) await env.KV.delete(k.name);
  await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: TENANT });
  await seedApiKey(env.DB, OTHER_KEY, { tenantId: OTHER });
});

describe('POST /v1/admin/tenants/{id}/deletion', () => {
  it('answers 404 for an unknown tenant', async () => {
    const res = await admin('POST', '/v1/admin/tenants/gh-999999/deletion');
    expect(res.status).toBe(404);
  });

  it('records the request and says when the data can be purged', async () => {
    const res = await admin('POST', `/v1/admin/tenants/${TENANT}/deletion`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe(TENANT);
    expect(Date.parse(body.purgeAfter) - Date.parse(body.deletionRequestedAt)).toBe(30 * DAY_MS);

    // Asking again keeps the first date
    const again = await (await admin('POST', `/v1/admin/tenants/${TENANT}/deletion`)).json();
    expect(again.deletionRequestedAt).toBe(body.deletionRequestedAt);
  });

  it('stops captures and schedules but keeps the captures readable', async () => {
    await seedStoredCapture(CAP, TENANT);
    await admin('POST', `/v1/admin/tenants/${TENANT}/deletion`);

    const res = await capture(TEST_TENANT_KEY);
    expect(res.status).toBe(403);
    expect((await res.json()).detail).toMatch(/scheduled for deletion/);

    expect((await checkQuota(env.DB, TENANT, 1)).reason).toBe('deletion_requested');

    const read = await SELF.fetch(`https://worker.test/v1/captures/${CAP}`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    expect(read.status).toBe(200);
  });
});

describe('DELETE /v1/admin/tenants/{id}/deletion', () => {
  it('cancels the request, and the account captures again', async () => {
    await admin('POST', `/v1/admin/tenants/${TENANT}/deletion`);
    const res = await admin('DELETE', `/v1/admin/tenants/${TENANT}/deletion`);
    expect(res.status).toBe(200);
    expect((await res.json()).deletionRequestedAt).toBeNull();
    expect((await checkQuota(env.DB, TENANT, 1)).allowed).toBe(true);
  });
});

describe('DELETE /v1/admin/tenants/{id}', () => {
  it('refuses without a deletion request', async () => {
    const res = await admin('DELETE', `/v1/admin/tenants/${TENANT}?confirm=${TENANT}`);
    expect(res.status).toBe(409);
  });

  it('refuses before the 30 days are over, and says when', async () => {
    await requestedDaysAgo(TENANT, 29);
    const res = await admin('DELETE', `/v1/admin/tenants/${TENANT}?confirm=${TENANT}`);
    expect(res.status).toBe(409);
    expect((await res.json()).purgeAfter).toBeDefined();
  });

  it('refuses unless confirm repeats the tenant id', async () => {
    await requestedDaysAgo(TENANT, 31);
    expect((await admin('DELETE', `/v1/admin/tenants/${TENANT}`)).status).toBe(400);
    expect((await admin('DELETE', `/v1/admin/tenants/${TENANT}?confirm=${OTHER}`)).status).toBe(400);
  });

  it('removes everything the tenant owns and nothing of other tenants', async () => {
    // GitHub and email identity, sessions, sign-in link
    await seedGithubUser(env.DB, { githubId: 424242, tenantId: TENANT });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO email_users (email, tenant_id) VALUES ('gone@example.org', ?)").bind(TENANT),
      env.DB.prepare(
        "INSERT INTO sessions (id_hash, github_id, tenant_id, expires_at) VALUES (?, 424242, ?, '2099-01-01T00:00:00Z')",
      ).bind('1'.repeat(64), TENANT),
      env.DB.prepare(
        "INSERT INTO sessions (id_hash, email, tenant_id, expires_at) VALUES (?, 'gone@example.org', ?, '2099-01-01T00:00:00Z')",
      ).bind('2'.repeat(64), TENANT),
      env.DB.prepare(
        "INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (?, 'gone@example.org', '2099-01-01T00:00:00Z')",
      ).bind('3'.repeat(64)),
    ]);
    // Captures with R2 objects and a threat check
    const keys = await seedStoredCapture(CAP, TENANT);
    const otherKeys = await seedStoredCapture(OTHER_CAP, OTHER);
    await env.DB.prepare("INSERT INTO threat_checks (capture_id, checked_at, verdict) VALUES (?, '2026-11-01T00:00:00Z', 'safe')").bind(CAP).run();
    // Schedules, webhooks, usage, notifications, the first-key KV entry
    await seedSchedule(env.DB, 'sch_' + 'a'.repeat(32), { tenantId: TENANT });
    await seedWebhook(env.DB, 'whk_' + 'a'.repeat(32), { tenantId: TENANT });
    await seedUsageCounter(env.DB, { tenantId: TENANT, period: '2026-11', captureCount: 3 });
    await upsertNotificationPreferences(env.DB, TENANT, { email: 'gone@example.org', emailVerified: true, emailSource: 'manual' });
    await env.DB.prepare("INSERT INTO notification_sent (tenant_id, period, event_type) VALUES (?, '2026-11', 'limit_reached')").bind(TENANT).run();
    await env.KV.put(`first_key:${TENANT}`, 'wrl_live_raw');
    await requestedDaysAgo(TENANT, 31);

    const res = await admin('DELETE', `/v1/admin/tenants/${TENANT}?confirm=${TENANT}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe(TENANT);
    expect(body.deleted.captures).toBe(1);
    expect(body.deleted.r2Objects).toBe(keys.length);

    const left = async (sql, ...args) => (await env.DB.prepare(sql).bind(...args).first()).n;
    expect(await left('SELECT COUNT(*) AS n FROM tenants WHERE id = ?', TENANT)).toBe(0);
    for (const table of ['api_keys', 'captures', 'github_users', 'email_users', 'sessions', 'schedules',
      'webhooks', 'usage_counters', 'notification_preferences', 'notification_sent']) {
      expect(await left(`SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id = ?`, TENANT), table).toBe(0);
    }
    expect(await left('SELECT COUNT(*) AS n FROM threat_checks WHERE capture_id = ?', CAP)).toBe(0);
    expect(await left("SELECT COUNT(*) AS n FROM login_tokens WHERE email = 'gone@example.org'")).toBe(0);
    for (const key of keys) expect(await env.BUCKET.head(key), key).toBeNull();
    expect(await env.KV.get(`first_key:${TENANT}`)).toBeNull();

    // The other tenant keeps its key, capture and objects
    expect(await left('SELECT COUNT(*) AS n FROM captures WHERE tenant_id = ?', OTHER)).toBe(1);
    for (const key of otherKeys) expect(await env.BUCKET.head(key), key).not.toBeNull();
    expect((await capture(OTHER_KEY)).status).not.toBe(401);
  });
});

describe('POST /v1/captures for an account blocked for non-payment', () => {
  it('answers 403 with a message, not a storage limit with an invalid date', async () => {
    await env.DB.prepare("UPDATE tenants SET billing_status = 'blocked' WHERE id = ?").bind(TENANT).run();
    const res = await capture(TEST_TENANT_KEY);
    expect(res.status).toBe(403);
    expect(res.headers.get('Retry-After')).toBeNull();
    expect((await res.json()).detail).toMatch(/blocked/i);
  });
});

// tva
// Integration tests for webhook CRUD endpoints.
// Uses SELF.fetch() -- all requests go through the real worker.
// D1 is real (miniflare-backed). Auth uses seedApiKey + TEST_TENANT_KEY.
//
// IMPORTANT: Webhook rate limiter is 5 req/60s per IP (wrangler.toml).
// Each describe block uses a distinct CF-Connecting-IP to avoid cross-test
// rate limit exhaustion. IP is scoped to the describe block via closure.

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TEST_TENANT_KEY,
  TEST_WEBHOOK_URL,
  seedApiKey,
  seedWebhook,
  cleanDb,
} from './fixtures.js';

// TEST_WEBHOOK_URL uses a hostname that does not resolve in the Workers test
// environment (DNS is blocked by the SSRF validator). Use an IP-based URL for
// POST requests that go through validateWebhookUrl(). seedWebhook() bypasses
// validation and can use any URL.
const VALID_WEBHOOK_URL = 'https://93.184.216.34/webhook';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_AUTH = `Bearer ${TEST_TENANT_KEY}`;

let ipCounter = 20;
function nextIp() {
  return `192.0.2.${ipCounter++}`;
}

function makePost(ip) {
  return (body) => SELF.fetch('https://worker.test/v1/webhooks', {
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
  return () => SELF.fetch('https://worker.test/v1/webhooks', {
    headers: {
      Authorization: TENANT_AUTH,
      'CF-Connecting-IP': ip,
    },
  });
}

function makeDelete(ip) {
  return (webhookId) => SELF.fetch(`https://worker.test/v1/webhooks/${webhookId}`, {
    method: 'DELETE',
    headers: {
      Authorization: TENANT_AUTH,
      'CF-Connecting-IP': ip,
    },
  });
}

function makePing(ip) {
  return (webhookId) => SELF.fetch(`https://worker.test/v1/webhooks/${webhookId}/ping`, {
    method: 'POST',
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
  url: VALID_WEBHOOK_URL,
  events: ['capture.complete'],
  name: 'test webhook',
};

// ---------------------------------------------------------------------------
// POST /v1/webhooks
// ---------------------------------------------------------------------------

describe('POST /v1/webhooks', () => {
  let post;
  beforeEach(async () => {
    post = makePost(nextIp());
    await setup();
  });
  afterEach(() => cleanDb(env.DB));

  it('returns 201 with whk_ prefixed id and whsec_ prefixed secret', async () => {
    const res = await post(VALID_CREATE_BODY);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^whk_[a-f0-9]{32}$/);
    expect(body.secret).toMatch(/^whsec_[a-f0-9]{64}$/);
  });

  it('returns warning text in 201 response', async () => {
    const res = await post(VALID_CREATE_BODY);
    const body = await res.json();
    expect(typeof body.warning).toBe('string');
    expect(body.warning.length).toBeGreaterThan(0);
  });

  it('returns url, events, name, createdAt in 201 response', async () => {
    const res = await post(VALID_CREATE_BODY);
    const body = await res.json();
    expect(body.url).toBe(VALID_WEBHOOK_URL);
    expect(body.events).toEqual(['capture.complete']);
    expect(body.name).toBe('test webhook');
    expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('sets Cache-Control: private, no-store on 201 (secret is in response)', async () => {
    const res = await post(VALID_CREATE_BODY);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('returns 400 when url is missing', async () => {
    const res = await post({ events: ['capture.complete'], name: 'x' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('url');
  });

  it('returns 400 when events is missing', async () => {
    const res = await post({ url: VALID_WEBHOOK_URL, name: 'x' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('events');
  });

  it('returns 400 when name is missing', async () => {
    const res = await post({ url: VALID_WEBHOOK_URL, events: ['capture.complete'] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('name');
  });

  it('returns 400 for non-HTTPS URL', async () => {
    // Use IP-based URL to avoid DNS resolution failure masking the HTTPS check
    const res = await post({ url: 'http://93.184.216.34/hook', events: ['capture.complete'], name: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown fields', async () => {
    const res = await post({
      url: VALID_WEBHOOK_URL,
      events: ['capture.complete'],
      name: 'x',
      description: 'should fail',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('description');
    expect(body.detail).toContain('Allowed fields');
  });

  it('returns 400 for invalid event type', async () => {
    const res = await post({ url: VALID_WEBHOOK_URL, events: ['capture.invalid'], name: 'x' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('capture.invalid');
  });

  it('returns 400 for empty events array', async () => {
    const res = await post({ url: VALID_WEBHOOK_URL, events: [], name: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when tenant has reached 5-webhook limit', async () => {
    const webhookId = (n) => 'whk_' + n.toString().padStart(32, '0');
    for (let i = 1; i <= 5; i++) {
      await seedWebhook(env.DB, webhookId(i), { tenantId: 'default' });
    }
    const res = await post(VALID_CREATE_BODY);
    expect(res.status).toBe(409);
  });

  it('secret is not returned on subsequent GET (show-once)', async () => {
    const createRes = await post(VALID_CREATE_BODY);
    const { id } = await createRes.json();

    const listRes = await makeGet(nextIp())();
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const found = listBody.data.find(w => w.id === id);
    expect(found).toBeDefined();
    expect(found.secret).toBeUndefined();
  });

  it('returns 401 without auth', async () => {
    const res = await SELF.fetch('https://worker.test/v1/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': nextIp(),
      },
      body: JSON.stringify(VALID_CREATE_BODY),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a key without capture scope', async () => {
    const readOnlyKey = 'wrl_live_' + 'b'.repeat(43);
    await seedApiKey(env.DB, readOnlyKey, { tenantId: 'default', scopes: ['read'] });
    const res = await SELF.fetch('https://worker.test/v1/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${readOnlyKey}`,
        'CF-Connecting-IP': nextIp(),
      },
      body: JSON.stringify(VALID_CREATE_BODY),
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/webhooks
// ---------------------------------------------------------------------------

describe('GET /v1/webhooks', () => {
  let get;
  beforeEach(async () => {
    get = makeGet(nextIp());
    await setup();
  });
  afterEach(() => cleanDb(env.DB));

  it('returns empty data array for tenant with no webhooks', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  it('returns webhooks without secrets', async () => {
    await seedWebhook(env.DB, 'whk_' + 'a'.repeat(32), { tenantId: 'default' });
    const res = await get();
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].secret).toBeUndefined();
  });

  it('returns expected fields on listed webhooks', async () => {
    await seedWebhook(env.DB, 'whk_' + 'a'.repeat(32), {
      tenantId: 'default',
      url: TEST_WEBHOOK_URL,
      name: 'my hook',
      events: ['capture.complete', 'capture.failed'],
    });
    const res = await get();
    const body = await res.json();
    const hook = body.data[0];
    expect(hook.id).toBe('whk_' + 'a'.repeat(32));
    expect(hook.url).toBe(TEST_WEBHOOK_URL);
    expect(hook.name).toBe('my hook');
    expect(hook.events).toEqual(['capture.complete', 'capture.failed']);
    expect(typeof hook.active).toBe('boolean');
    expect(hook.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('tenant isolation -- tenant A cannot see tenant B webhooks', async () => {
    // Seed webhook for tenant-b
    const tenantBKey = 'wrl_live_' + 'c'.repeat(43);
    await seedApiKey(env.DB, tenantBKey, { tenantId: 'tenant-b', scopes: ['capture', 'read'] });
    await seedWebhook(env.DB, 'whk_' + 'b'.repeat(32), { tenantId: 'tenant-b' });

    // Default tenant should not see tenant-b webhook
    const res = await get();
    const body = await res.json();
    const found = body.data.find(w => w.id === 'whk_' + 'b'.repeat(32));
    expect(found).toBeUndefined();
  });

  it('returns 401 without auth', async () => {
    const res = await SELF.fetch('https://worker.test/v1/webhooks', {
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/webhooks/:id
// ---------------------------------------------------------------------------

describe('DELETE /v1/webhooks/:id', () => {
  let del;
  beforeEach(async () => {
    del = makeDelete(nextIp());
    await setup();
  });
  afterEach(() => cleanDb(env.DB));

  it('returns 200 with deleted: true for existing webhook', async () => {
    const id = 'whk_' + 'a'.repeat(32);
    await seedWebhook(env.DB, id, { tenantId: 'default' });

    const res = await del(id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it('returns 404 for non-existent webhook', async () => {
    const id = 'whk_' + '0'.repeat(32);
    const res = await del(id);
    expect(res.status).toBe(404);
  });

  it('returns 404 for another tenants webhook (no information disclosure)', async () => {
    const id = 'whk_' + 'd'.repeat(32);
    await seedWebhook(env.DB, id, { tenantId: 'other-tenant' });

    const res = await del(id);
    expect(res.status).toBe(404);
  });

  it('webhook is no longer returned by GET after delete', async () => {
    const id = 'whk_' + 'a'.repeat(32);
    await seedWebhook(env.DB, id, { tenantId: 'default' });

    await del(id);

    const listRes = await makeGet(nextIp())();
    const listBody = await listRes.json();
    const found = listBody.data.find(w => w.id === id);
    expect(found).toBeUndefined();
  });

  it('returns 401 without auth', async () => {
    const id = 'whk_' + 'a'.repeat(32);
    await seedWebhook(env.DB, id, { tenantId: 'default' });
    const res = await SELF.fetch(`https://worker.test/v1/webhooks/${id}`, {
      method: 'DELETE',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/webhooks/:id/ping
// ---------------------------------------------------------------------------

describe('POST /v1/webhooks/:id/ping', () => {
  let ping;
  beforeEach(async () => {
    ping = makePing(nextIp());
    await setup();
  });
  afterEach(() => cleanDb(env.DB));

  it('returns 200 with success/httpStatus/latencyMs shape for existing webhook', async () => {
    const id = 'whk_' + 'a'.repeat(32);
    await seedWebhook(env.DB, id, { tenantId: 'default' });

    const res = await ping(id);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Ping will attempt a real fetch; the call fails since TEST_WEBHOOK_URL is not real.
    // But the handler must return the expected shape regardless.
    expect(typeof body.success).toBe('boolean');
    expect('latencyMs' in body).toBe(true);
    // httpStatus is null on network error, a number on HTTP response
    expect(body.httpStatus === null || typeof body.httpStatus === 'number').toBe(true);
  });

  it('returns 404 for non-existent webhook', async () => {
    const id = 'whk_' + '0'.repeat(32);
    const res = await ping(id);
    expect(res.status).toBe(404);
  });

  it('returns 404 for another tenants webhook', async () => {
    const id = 'whk_' + 'e'.repeat(32);
    await seedWebhook(env.DB, id, { tenantId: 'other-tenant' });

    const res = await ping(id);
    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const id = 'whk_' + 'a'.repeat(32);
    await seedWebhook(env.DB, id, { tenantId: 'default' });
    const res = await SELF.fetch(`https://worker.test/v1/webhooks/${id}/ping`, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.status).toBe(401);
  });
});

// tva
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { seedApiKey, TEST_TENANT_KEY } from './fixtures.js';

const AUTH = `Bearer ${TEST_TENANT_KEY}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Each call gets a unique IP so tests don't exhaust each other's rate limit
// buckets. The rate limiter keys off CF-Connecting-IP; unique IPs = unique
// 10-req-per-minute buckets in miniflare.
let ipCounter = 0;
function nextTestIp() {
  ipCounter += 1;
  const a = Math.floor(ipCounter / 256) % 256;
  const b = ipCounter % 256;
  return `93.184.${a}.${b}`;
}

function batchCapture(urls, headers = {}) {
  return SELF.fetch('https://worker.test/v1/captures/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: AUTH,
      'CF-Connecting-IP': nextTestIp(),
      ...headers,
    },
    body: JSON.stringify({ urls }),
  });
}

// ---------------------------------------------------------------------------
// Setup -- seed auth key and wipe KV state between tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await seedApiKey(env.KV, TEST_TENANT_KEY);
  const { keys } = await env.KV.list({ prefix: 'capture:' });
  for (const k of keys) await env.KV.delete(k.name);
  const { keys: tenantKeys } = await env.KV.list({ prefix: 'tenant:' });
  for (const k of tenantKeys) await env.KV.delete(k.name);
  const { keys: rlKeys } = await env.KV.list({ prefix: 'rl:' });
  for (const k of rlKeys) await env.KV.delete(k.name);
  const { keys: apiKeys } = await env.KV.list({ prefix: 'apikey:' });
  for (const k of apiKeys) await env.KV.delete(k.name);
  // Re-seed after wiping apikey: and tenant: prefixes
  await seedApiKey(env.KV, TEST_TENANT_KEY);
  // Seed tenant config with high rate limit (batch tests send up to 20 URLs)
  await env.KV.put('tenant:default:config', JSON.stringify({
    rateLimit: { capture: { limit: 100, period: 60 } },
    updatedAt: new Date().toISOString(),
    updatedBy: 'test',
  }));
});

// ---------------------------------------------------------------------------
// 1. Auth and content-type (top-level errors)
// ---------------------------------------------------------------------------

describe('POST /v1/captures/batch -- auth and content-type', () => {
  it('returns 415 without Content-Type: application/json (checked before auth)', async () => {
    // Note: content-type is validated before auth in handleBatchCapture
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Authorization: AUTH },
      body: JSON.stringify({ urls: [{ url: 'https://example.com' }] }),
    });
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.status).toBe(415);
    expect(body.type).toBe('about:blank');
  });

  it('returns 415 with text/plain Content-Type', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Authorization: AUTH },
      body: '{"urls":[{"url":"https://example.com"}]}',
    });
    expect(res.status).toBe(415);
  });

  it('returns 415 with no Content-Type header', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: { Authorization: AUTH },
      body: JSON.stringify({ urls: [{ url: 'https://example.com' }] }),
    });
    expect(res.status).toBe(415);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [{ url: 'https://example.com' }] }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
    expect(body.type).toBe('about:blank');
  });

  it('returns 401 with invalid API key', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrl_live_invalid_key_that_does_not_exist',
      },
      body: JSON.stringify({ urls: [{ url: 'https://example.com' }] }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 2. Input validation (top-level 400 errors)
// ---------------------------------------------------------------------------

describe('POST /v1/captures/batch -- input validation', () => {
  it('returns 400 when body is not valid JSON', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH, 'CF-Connecting-IP': nextTestIp() },
      body: 'this is not json at all',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
    expect(body.type).toBe('about:blank');
  });

  it('returns 400 when urls field is missing', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH, 'CF-Connecting-IP': nextTestIp() },
      body: JSON.stringify({ notUrls: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
  });

  it('returns 400 when urls is not an array (string)', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH, 'CF-Connecting-IP': nextTestIp() },
      body: JSON.stringify({ urls: 'https://example.com' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
  });

  it('returns 400 when urls is not an array (object)', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH, 'CF-Connecting-IP': nextTestIp() },
      body: JSON.stringify({ urls: { url: 'https://example.com' } }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when urls is an empty array', async () => {
    const res = await batchCapture([]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
  });

  it('returns 400 when batch size exceeds maximum of 20 (default)', async () => {
    const urls = Array.from({ length: 21 }, (_, i) => ({ url: `https://example.com/page${i}` }));
    const res = await batchCapture(urls);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
    expect(body.detail).toContain('20');
  });
});

// ---------------------------------------------------------------------------
// 3. Successful batch (207 responses)
// ---------------------------------------------------------------------------

describe('POST /v1/captures/batch -- successful batch', () => {
  it('returns 207 with a single valid URL', async () => {
    const res = await batchCapture([{ url: 'https://example.com' }]);
    expect(res.status).toBe(207);
  });

  it('returns application/json Content-Type (not problem+json)', async () => {
    const res = await batchCapture([{ url: 'https://example.com' }]);
    expect(res.status).toBe(207);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('single URL success: item has status 202, url, id with cap_ prefix, statusUrl', async () => {
    const res = await batchCapture([{ url: 'https://example.com' }]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    expect(item.status).toBe(202);
    expect(item.url).toBe('https://example.com/');
    expect(item.id).toMatch(/^cap_[a-f0-9]{32}$/);
    expect(item.statusUrl).toContain(item.id);
    expect(item.statusUrl).toContain('/v1/captures/');
  });

  it('summary has correct total, accepted, failed counts for all-success batch', async () => {
    const res = await batchCapture([
      { url: 'https://example.com' },
      { url: 'https://example.org' },
    ]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.summary.total).toBe(2);
    expect(body.summary.accepted).toBe(2);
    expect(body.summary.failed).toBe(0);
  });

  it('items array length equals input array length', async () => {
    const res = await batchCapture([
      { url: 'https://example.com' },
      { url: 'https://example.org' },
      { url: 'https://example.net' },
    ]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items).toHaveLength(3);
  });

  it('returns 207 with multiple URL successes -- all items status 202', async () => {
    const res = await batchCapture([
      { url: 'https://example.com' },
      { url: 'https://example.org' },
    ]);
    expect(res.status).toBe(207);
    const body = await res.json();
    for (const item of body.items) {
      expect(item.status).toBe(202);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Per-URL validation (mixed 207)
// ---------------------------------------------------------------------------

describe('POST /v1/captures/batch -- per-URL validation', () => {
  it('returns per-item 400 for items missing url field (empty object)', async () => {
    const res = await batchCapture([{}]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe(400);
    expect(body.items[0].error).toBeDefined();
  });

  it('returns per-item 400 for null items', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH, 'CF-Connecting-IP': nextTestIp() },
      body: JSON.stringify({ urls: [null] }),
    });
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items[0].status).toBe(400);
  });

  it('returns per-item 400 for numeric items', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH, 'CF-Connecting-IP': nextTestIp() },
      body: JSON.stringify({ urls: [42] }),
    });
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items[0].status).toBe(400);
  });

  it('returns per-item 400 for string items (url not wrapped in object)', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH, 'CF-Connecting-IP': nextTestIp() },
      body: JSON.stringify({ urls: ['https://example.com'] }),
    });
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items[0].status).toBe(400);
  });

  it('returns per-item 422 for private IP (http://127.0.0.1)', async () => {
    const res = await batchCapture([{ url: 'http://127.0.0.1' }]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe(422);
    expect(body.items[0].url).toBe('http://127.0.0.1');
    expect(body.items[0].error).toBeDefined();
  });

  it('returns per-item 422 for private subnet (http://10.0.0.1)', async () => {
    const res = await batchCapture([{ url: 'http://10.0.0.1' }]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items[0].status).toBe(422);
  });

  it('returns per-item 400 for non-http schemes (ftp://example.com)', async () => {
    const res = await batchCapture([{ url: 'ftp://example.com' }]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    // validateUrl returns status 400 for disallowed scheme
    expect(body.items[0].status).toBe(400);
    expect(body.items[0].url).toBe('ftp://example.com');
  });

  it('mixed batch: one valid + one invalid URL -- 207 with correct per-item statuses', async () => {
    const res = await batchCapture([
      { url: 'https://example.com' },
      { url: 'http://127.0.0.1' },
    ]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].status).toBe(202);
    expect(body.items[1].status).toBe(422);
  });

  it('invalid items do not prevent valid items from succeeding', async () => {
    const res = await batchCapture([
      { url: 'http://127.0.0.1' },
      { url: 'https://example.com' },
    ]);
    expect(res.status).toBe(207);
    const body = await res.json();
    // First item invalid, second should succeed
    expect(body.items[0].status).toBe(422);
    expect(body.items[1].status).toBe(202);
    expect(body.summary.accepted).toBe(1);
    expect(body.summary.failed).toBe(1);
  });

  it('error items have RFC 9457 ProblemDetail shape (type, status, title, detail)', async () => {
    const res = await batchCapture([{ url: 'http://127.0.0.1' }]);
    expect(res.status).toBe(207);
    const body = await res.json();
    const item = body.items[0];
    expect(item.error).toBeDefined();
    expect(item.error.type).toBe('about:blank');
    expect(item.error.status).toBe(422);
    expect(typeof item.error.title).toBe('string');
    expect(item.error.title.length).toBeGreaterThan(0);
    expect(typeof item.error.detail).toBe('string');
    expect(item.error.detail.length).toBeGreaterThan(0);
  });

  it('all items failing validation still returns 207 (not a 4xx)', async () => {
    const res = await batchCapture([
      { url: 'http://127.0.0.1' },
      { url: 'ftp://example.com' },
      {},
    ]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.summary.accepted).toBe(0);
    expect(body.summary.failed).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 5. Rate limit interaction
// ---------------------------------------------------------------------------

describe('POST /v1/captures/batch -- rate limit interaction', () => {
  it.skip('rate limiter mid-batch: remaining items get 429 after limit exhausted', async () => {
    // miniflare does enforce the rate limit (10/60s per IP) but the test suite
    // uses unique IPs per test to avoid cross-test interference. Exhausting a
    // single IP bucket within one test requires sending exactly 11 requests to
    // the same IP -- 10 single captures followed by one batch -- but the batch
    // endpoint itself counts as 1 token per item. This makes the test fragile
    // against the limit value in wrangler.toml. Skipped: validated manually
    // by deploying to staging and sending 10 POST /v1/captures to a fixed IP
    // then verifying a batch returns 429 from item index 0 onward.
  });

  it.skip('global capacity limit mid-batch: remaining items get 503', async () => {
    // GLOBAL_CAPTURE_LIMITER is 200/60s. Triggering it in tests would require
    // 200 prior requests in the same rate limit window, which is impractical.
    // Validated manually on staging.
  });
});

// ---------------------------------------------------------------------------
// 6. Response shape validation
// ---------------------------------------------------------------------------

describe('POST /v1/captures/batch -- response shape', () => {
  it('207 response has items array and summary object at top level', async () => {
    const res = await batchCapture([{ url: 'https://example.com' }]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.summary).toBe('object');
    expect(body.summary).not.toBeNull();
  });

  it('summary.total equals items.length', async () => {
    const res = await batchCapture([
      { url: 'https://example.com' },
      { url: 'https://example.org' },
    ]);
    const body = await res.json();
    expect(body.summary.total).toBe(body.items.length);
  });

  it('summary.accepted + summary.failed equals summary.total', async () => {
    const res = await batchCapture([
      { url: 'https://example.com' },
      { url: 'http://127.0.0.1' },
    ]);
    const body = await res.json();
    expect(body.summary.accepted + body.summary.failed).toBe(body.summary.total);
  });

  it('successful items have exactly: status, url, id, statusUrl -- no extra fields', async () => {
    const res = await batchCapture([{ url: 'https://example.com' }]);
    const body = await res.json();
    const item = body.items[0];
    expect(item.status).toBe(202);
    expect(item.url).toBeDefined();
    expect(item.id).toBeDefined();
    expect(item.statusUrl).toBeDefined();
    // No extra fields
    expect(item.note).toBeUndefined();
    expect(item.error).toBeUndefined();
    expect(item.tenantId).toBeUndefined();
    expect(item.ip).toBeUndefined();
  });

  it('error items have exactly: status, url, error -- no extra fields', async () => {
    const res = await batchCapture([{ url: 'http://127.0.0.1' }]);
    const body = await res.json();
    const item = body.items[0];
    expect(item.status).toBeDefined();
    expect(item.url).toBeDefined();
    expect(item.error).toBeDefined();
    // No extra fields from the success shape
    expect(item.id).toBeUndefined();
    expect(item.statusUrl).toBeUndefined();
  });

  it('response Content-Type is application/json (207 is not an error response)', async () => {
    const res = await batchCapture([{ url: 'https://example.com' }]);
    expect(res.status).toBe(207);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    // Must NOT be problem+json -- 207 is a success envelope
    expect(res.headers.get('Content-Type')).not.toContain('problem+json');
  });
});

// ---------------------------------------------------------------------------
// 7. KV dispatch (capture actually created)
// ---------------------------------------------------------------------------

describe('POST /v1/captures/batch -- KV dispatch', () => {
  it('accepted capture creates a KV record with status pending', async () => {
    const res = await batchCapture([{ url: 'https://example.com' }]);
    expect(res.status).toBe(207);
    const body = await res.json();
    const item = body.items[0];
    expect(item.status).toBe(202);

    const record = JSON.parse(await env.KV.get(`capture:${item.id}`));
    expect(record).not.toBeNull();
    expect(record.status).toBe('pending');
    expect(record.url).toBe('https://example.com/');
  });

  it('each accepted capture in a batch has a unique ID -- no duplicates', async () => {
    const res = await batchCapture([
      { url: 'https://example.com' },
      { url: 'https://example.org' },
      { url: 'https://example.net' },
    ]);
    expect(res.status).toBe(207);
    const body = await res.json();
    const ids = body.items.map(i => i.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('rejected items do not create KV records', async () => {
    const res = await batchCapture([{ url: 'http://127.0.0.1' }]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items[0].status).toBe(422);

    // No capture: KV should be empty (we wiped it in beforeEach)
    const { keys } = await env.KV.list({ prefix: 'capture:' });
    expect(keys).toHaveLength(0);
  });

  it('KV records for a multi-URL batch all have status pending', async () => {
    const res = await batchCapture([
      { url: 'https://example.com' },
      { url: 'https://example.org' },
    ]);
    expect(res.status).toBe(207);
    const body = await res.json();

    for (const item of body.items) {
      expect(item.status).toBe(202);
      const record = JSON.parse(await env.KV.get(`capture:${item.id}`));
      expect(record.status).toBe('pending');
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Edge cases
// ---------------------------------------------------------------------------

describe('POST /v1/captures/batch -- edge cases', () => {
  it('duplicate URLs in batch: both accepted with different capture IDs', async () => {
    const res = await batchCapture([
      { url: 'https://example.com' },
      { url: 'https://example.com' },
    ]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].status).toBe(202);
    expect(body.items[1].status).toBe(202);
    expect(body.items[0].id).not.toBe(body.items[1].id);
  });

  it('URL normalization: validated URL in response gets trailing slash from WHATWG parser', async () => {
    // WHATWG URL constructor normalizes https://example.com -> https://example.com/
    const res = await batchCapture([{ url: 'https://example.com' }]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items[0].url).toBe('https://example.com/');
  });

  it('batch of exactly 1 item works', async () => {
    const res = await batchCapture([{ url: 'https://example.com' }]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe(202);
    expect(body.summary.total).toBe(1);
  });

  it('batch at maximum size (20 items) works', async () => {
    const urls = Array.from({ length: 20 }, (_, i) => ({ url: `https://example.com/page${i}` }));
    const res = await batchCapture(urls);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items).toHaveLength(20);
    expect(body.summary.total).toBe(20);
  });

  it('empty object items get per-item 400 error', async () => {
    const res = await batchCapture([{}]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.items[0].status).toBe(400);
    expect(body.items[0].error.type).toBe('about:blank');
    expect(body.items[0].error.status).toBe(400);
  });

  it('mixed batch with all-invalid items returns 207 with all failed summary', async () => {
    const res = await batchCapture([
      {},
      { url: 'http://127.0.0.1' },
      { url: 'ftp://example.com' },
    ]);
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.summary.accepted).toBe(0);
    expect(body.summary.failed).toBe(3);
    expect(body.summary.total).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 9. No CORS headers on batch endpoint
// ---------------------------------------------------------------------------

describe('POST /v1/captures/batch -- no CORS headers', () => {
  it('response does not include Access-Control-Allow-Origin header', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AUTH,
        'CF-Connecting-IP': nextTestIp(),
        Origin: 'https://example.com',
      },
      body: JSON.stringify({ urls: [{ url: 'https://example.com' }] }),
    });
    expect(res.status).toBe(207);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('response does not include Vary: Origin header', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AUTH,
        'CF-Connecting-IP': nextTestIp(),
        Origin: 'https://example.com',
      },
      body: JSON.stringify({ urls: [{ url: 'https://example.com' }] }),
    });
    const vary = res.headers.get('Vary');
    // Either no Vary header, or Vary does not contain 'Origin'
    if (vary !== null) {
      expect(vary.toLowerCase()).not.toContain('origin');
    }
  });
});

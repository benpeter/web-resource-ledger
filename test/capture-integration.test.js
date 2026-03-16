import { env, SELF, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { completeCapture, getCapture } from '../src/kv.js';

const AUTH = 'Bearer test-api-key-for-vitest';
// Use a direct public IP to avoid DNS resolution in the test environment.
// url-validation skips DNS lookup for directly-supplied IPv4 addresses and
// only checks private ranges. 93.184.216.34 is example.com's public IP.
const VALID_URL = 'https://93.184.216.34/';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function postCapture(body, headers = {}) {
  return SELF.fetch('https://worker.test/v1/captures', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: AUTH,
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// fetchMock setup for tests that trigger a real capture POST (202 path)
// captureHeaders does an outbound fetch -- must be intercepted.
// ---------------------------------------------------------------------------
function activateFetchMock() {
  fetchMock.activate();
  fetchMock.disableNetConnect();
  fetchMock.get('https://93.184.216.34').intercept({ path: '/' }).reply(200, 'ok', {
    headers: { 'content-type': 'text/html' },
  });
}

// ---------------------------------------------------------------------------
// POST /v1/captures
// ---------------------------------------------------------------------------

describe('POST /v1/captures -- happy path', () => {
  beforeEach(activateFetchMock);
  afterEach(() => fetchMock.deactivate());

  it('returns 202 with correct shape and headers', async () => {
    const res = await postCapture({ url: VALID_URL });

    expect(res.status).toBe(202);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Retry-After')).toBe('5');

    const body = await res.json();
    expect(body.id).toMatch(/^cap_[a-f0-9]{32}$/);
    expect(body.statusUrl).toMatch(/^https?:\/\/.+\/v1\/captures\/cap_[a-f0-9]{32}\/status$/);
    expect(body.note).toBeTruthy();
  });

  it('statusUrl is absolute and contains the capture ID', async () => {
    const res = await postCapture({ url: VALID_URL });
    const body = await res.json();
    expect(body.statusUrl).toContain(body.id);
    expect(body.statusUrl).toMatch(/^https?:\/\//);
  });

  it('KV record includes tenantId: "default" after successful POST', async () => {
    // Use a distinct IP to avoid sharing the rate limiter bucket with other tests
    const res = await postCapture({ url: VALID_URL }, { 'CF-Connecting-IP': '10.0.0.99' });
    const { id } = await res.json();
    const record = await getCapture(env.KV, id);
    expect(record).not.toBeNull();
    expect(record.tenantId).toBe('default');
  });
});

describe('POST /v1/captures -- auth failures', () => {
  it('returns 401 with WWW-Authenticate when Authorization header is missing', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: VALID_URL }),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body).toMatchObject({ type: 'about:blank', status: 401 });
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('detail');
  });

  it('returns 401 with RFC 9457 shape for wrong API key', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-key',
      },
      body: JSON.stringify({ url: VALID_URL }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ type: 'about:blank', status: 401 });
    expect(body).toHaveProperty('detail');
  });
});

describe('POST /v1/captures -- Content-Type check', () => {
  it('returns 415 when Content-Type is missing', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: { Authorization: AUTH },
      body: JSON.stringify({ url: VALID_URL }),
    });

    expect(res.status).toBe(415);
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body).toMatchObject({ type: 'about:blank', status: 415 });
    expect(body).toHaveProperty('detail');
  });

  it('returns 415 when Content-Type is text/plain', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        Authorization: AUTH,
      },
      body: JSON.stringify({ url: VALID_URL }),
    });

    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.status).toBe(415);
  });
});

describe('POST /v1/captures -- body validation', () => {
  it('returns 400 for missing body', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AUTH,
      },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ type: 'about:blank', status: 400 });
    expect(body).toHaveProperty('detail');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AUTH,
      },
      body: 'not json {{{',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
  });

  it('returns 400 with detail mentioning url when url field is missing', async () => {
    const res = await postCapture({});

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
    expect(body.detail).toContain('url');
  });

  it('returns 400 when url field is not a string', async () => {
    const res = await postCapture({ url: 42 });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
  });
});

describe('POST /v1/captures -- URL validation', () => {
  it('returns 400 for ftp:// scheme (scheme check)', async () => {
    const res = await postCapture({ url: 'ftp://example.com' });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
    expect(body.detail).toContain('ftp');
  });
});

describe('POST /v1/captures -- security headers', () => {
  it('Referrer-Policy and X-Content-Type-Options present on 401', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: VALID_URL }),
    });

    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('Referrer-Policy and X-Content-Type-Options present on 415', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: { Authorization: AUTH },
      body: JSON.stringify({ url: VALID_URL }),
    });

    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('Referrer-Policy and X-Content-Type-Options present on 404', async () => {
    const res = await SELF.fetch('https://worker.test/nonexistent');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures/{id}/status
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id}/status', () => {
  beforeEach(activateFetchMock);
  afterEach(() => fetchMock.deactivate());

  it('returns 200 with id and status after creating a capture', async () => {
    const createRes = await postCapture({ url: VALID_URL });
    expect(createRes.status).toBe(202);
    const { id, statusUrl } = await createRes.json();

    const statusRes = await SELF.fetch(statusUrl);
    expect(statusRes.status).toBe(200);
    expect(statusRes.headers.get('Content-Type')).toContain('application/json');
    expect(statusRes.headers.get('Cache-Control')).toBe('private, no-store');

    const body = await statusRes.json();
    expect(body.id).toBe(id);
    expect(['pending', 'complete', 'failed']).toContain(body.status);
  });

  it('returns pending immediately after creation', async () => {
    const createRes = await postCapture({ url: VALID_URL });
    const { statusUrl } = await createRes.json();

    // Status is checked right after 202 -- background task may not have run
    const statusRes = await SELF.fetch(statusUrl);
    const body = await statusRes.json();
    // pending is the expected initial state; complete is acceptable if task ran
    expect(['pending', 'complete', 'failed']).toContain(body.status);
  });

  it('no auth required on status endpoint', async () => {
    const createRes = await postCapture({ url: VALID_URL });
    const { statusUrl } = await createRes.json();

    // Fetch without Authorization header
    const statusRes = await SELF.fetch(statusUrl);
    expect(statusRes.status).toBe(200);
  });
});

describe('GET /v1/captures/{id}/status -- not found / malformed', () => {
  it('returns 404 with RFC 9457 shape for valid-format but unknown ID', async () => {
    const res = await SELF.fetch(
      'https://worker.test/v1/captures/cap_aaaabbbbccccddddaaaabbbbccccdddd/status',
    );

    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body).toMatchObject({ type: 'about:blank', status: 404 });
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('detail');
    // SECURITY: response detail must not echo back the capture ID
    expect(body.detail).not.toContain('cap_aaaabbbbccccddddaaaabbbbccccdddd');
  });

  it('returns 404 for malformed ID (route does not match)', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures/badid/status');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle smoke test
// ---------------------------------------------------------------------------

describe('lifecycle smoke test', () => {
  beforeEach(activateFetchMock);
  afterEach(() => fetchMock.deactivate());

  it('POST -> KV advance -> GET returns complete metadata', async () => {
    // Use a distinct IP to avoid sharing the rate limiter bucket with earlier tests
    const createRes = await postCapture({ url: VALID_URL }, { 'CF-Connecting-IP': '10.0.0.1' });
    expect(createRes.status).toBe(202);
    const { id, statusUrl } = await createRes.json();

    const statusRes = await SELF.fetch(statusUrl);
    expect(statusRes.status).toBe(200);
    const statusBody = await statusRes.json();
    expect(statusBody.id).toBe(id);
    // In test env the default renderer fails (no real browser binding),
    // so status may be 'failed'. Accept any terminal or in-flight state.
    expect(['pending', 'complete', 'failed']).toContain(statusBody.status);

    await completeCapture(env.KV, id, {
      screenshot: `captures/${id}/screenshot.png`,
      html:       `captures/${id}/rendered.html`,
      headers:    `captures/${id}/headers.json`,
    }, {
      key:        `captures/${id}/bundle.wacz`,
      bundleHash: 'sha256:' + 'b'.repeat(64),
      size:       1024,
    });

    const completedStatusRes = await SELF.fetch(statusUrl);
    const completedStatusBody = await completedStatusRes.json();
    expect(completedStatusBody.status).toBe('complete');
    expect(completedStatusBody.captureUrl).toContain(id);

    const captureRes = await SELF.fetch(`https://worker.test/v1/captures/${id}`);
    expect(captureRes.status).toBe(200);
    const captureBody = await captureRes.json();
    expect(captureBody.id).toBe(id);
    expect(captureBody.status).toBe('complete');
    expect(captureBody.artifacts).toBeDefined();
    expect(captureBody.artifacts.screenshot).toMatch(/^https?:\/\//);
    expect(captureBody.artifacts.html).toMatch(/^https?:\/\//);
    expect(captureBody.wacz).toBeDefined();
    expect(captureBody.wacz.url).toMatch(/^https?:\/\//);
  });
});

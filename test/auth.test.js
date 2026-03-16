import { verifyApiKey } from '../src/auth.js';
import { describe, it, expect } from 'vitest';

const TEST_KEY = 'test-key-abc123';

function makeEnv(key = TEST_KEY) {
  return { CAPTURE_API_KEY: key };
}

function makeRequest(authHeader) {
  const headers = {};
  if (authHeader !== undefined) headers['Authorization'] = authHeader;
  return new Request('https://example.com/v1/captures', {
    method: 'POST',
    headers,
  });
}

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

describe('verifyApiKey -- success', () => {
  it('returns { ok: true } for correct key', async () => {
    const result = await verifyApiKey(
      makeRequest(`Bearer ${TEST_KEY}`),
      makeEnv(),
    );
    expect(result.ok).toBe(true);
    expect(result.response).toBeUndefined();
  });

  it('returns tenantId: "default" on success', async () => {
    const result = await verifyApiKey(
      makeRequest(`Bearer ${TEST_KEY}`),
      makeEnv(),
    );
    expect(result.ok).toBe(true);
    expect(result.tenantId).toBe('default');
  });

  it('error results do not include tenantId', async () => {
    const result = await verifyApiKey(
      makeRequest('Bearer wrong-key'),
      makeEnv(),
    );
    expect(result.ok).toBe(false);
    expect(result.tenantId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Wrong or malformed key
// ---------------------------------------------------------------------------

describe('verifyApiKey -- wrong or malformed key', () => {
  it('returns 401 for wrong key', async () => {
    const result = await verifyApiKey(
      makeRequest('Bearer wrong-key-value'),
      makeEnv(),
    );
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('returns 401 for empty token ("Bearer ")', async () => {
    const result = await verifyApiKey(
      makeRequest('Bearer '),
      makeEnv(),
    );
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('returns 401 for non-Bearer scheme ("Basic abc")', async () => {
    const result = await verifyApiKey(
      makeRequest('Basic abc'),
      makeEnv(),
    );
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });
});

// ---------------------------------------------------------------------------
// Missing Authorization header
// ---------------------------------------------------------------------------

describe('verifyApiKey -- missing Authorization header', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const result = await verifyApiKey(
      makeRequest(undefined),
      makeEnv(),
    );
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });
});

// ---------------------------------------------------------------------------
// Misconfigured environment
// ---------------------------------------------------------------------------

describe('verifyApiKey -- misconfigured environment', () => {
  it('returns 503 when CAPTURE_API_KEY is not set', async () => {
    const result = await verifyApiKey(
      makeRequest(`Bearer ${TEST_KEY}`),
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// RFC 9457 response shape
// ---------------------------------------------------------------------------

describe('verifyApiKey -- RFC 9457 response shape', () => {
  it('error responses have type, status, title, detail fields', async () => {
    const result = await verifyApiKey(makeRequest(undefined), makeEnv());
    expect(result.ok).toBe(false);
    const body = await result.response.json();
    expect(body.type).toBe('about:blank');
    expect(body.status).toBe(401);
    expect(typeof body.title).toBe('string');
    expect(typeof body.detail).toBe('string');
  });

  it('503 response has RFC 9457 shape', async () => {
    const result = await verifyApiKey(makeRequest(`Bearer ${TEST_KEY}`), {});
    expect(result.ok).toBe(false);
    const body = await result.response.json();
    expect(body.type).toBe('about:blank');
    expect(body.status).toBe(503);
    expect(body.title).toBe('Service Unavailable');
    expect(typeof body.detail).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Security: key never echoed in error responses
// ---------------------------------------------------------------------------

describe('verifyApiKey -- key not leaked in responses', () => {
  it('wrong key response does not contain the provided key value', async () => {
    const result = await verifyApiKey(
      makeRequest(`Bearer ${TEST_KEY}`),
      { CAPTURE_API_KEY: 'different-key-xyz' },
    );
    expect(result.ok).toBe(false);
    const body = await result.response.text();
    expect(body).not.toContain(TEST_KEY);
  });

  it('correct key response does not echo the key', async () => {
    const result = await verifyApiKey(
      makeRequest(`Bearer ${TEST_KEY}`),
      makeEnv(),
    );
    // ok: true means no response body, just verify the shape
    expect(result.ok).toBe(true);
    expect(result.response).toBeUndefined();
  });
});

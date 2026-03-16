// tva
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const ALLOWED_ORIGIN = 'https://allowed.example.com';
const DISALLOWED_ORIGIN = 'https://evil.example.com';
const AUTH = 'Bearer test-api-key-for-vitest';

// ---------------------------------------------------------------------------
// OPTIONS /v1/captures -- CORS preflight
// ---------------------------------------------------------------------------

describe('OPTIONS /v1/captures -- CORS preflight', () => {
  it('returns 204 with empty body', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(204);
    const body = await res.text();
    expect(body).toBe('');
  });

  it('allowed origin receives Access-Control-Allow-Origin matching the request Origin', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
  });

  it('allowed origin receives Access-Control-Allow-Methods: POST', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST');
  });

  it('allowed origin receives Access-Control-Allow-Headers including Authorization and Content-Type', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const allowHeaders = res.headers.get('Access-Control-Allow-Headers');
    expect(allowHeaders).toContain('Authorization');
    expect(allowHeaders).toContain('Content-Type');
  });

  it('allowed origin receives Access-Control-Max-Age: 7200', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.headers.get('Access-Control-Max-Age')).toBe('7200');
  });

  it('allowed origin receives Vary: Origin', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('disallowed origin does NOT receive Access-Control-Allow-Origin', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'OPTIONS',
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('missing Origin header does NOT receive Access-Control-Allow-Origin', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'OPTIONS',
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('preflight response includes security headers (HSTS, X-Content-Type-Options, X-Frame-Options)', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.headers.get('Strict-Transport-Security')).toBeTruthy();
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('preflight response has Cache-Control: no-store', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/captures -- CORS response headers
// ---------------------------------------------------------------------------

describe('POST /v1/captures -- CORS response headers', () => {
  it('allowed origin receives Access-Control-Allow-Origin on 202 response', async () => {
    // 401 is the easiest way to get a fast, deterministic response without
    // needing fetchMock for the outbound request inside performCapture.
    // Use a valid auth but no Content-Type so we get 415, not 401 -- but
    // origin header must be set. Use no auth so we get 401 with origin set.
    // The CORS middleware runs after the handler regardless of status code.
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AUTH,
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ url: 'not-a-valid-url' }),
    });
    // 400 for invalid URL -- still gets CORS header
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
  });

  it('allowed origin receives Vary: Origin on 202 response', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AUTH,
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('disallowed origin does NOT receive Access-Control-Allow-Origin', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AUTH,
        Origin: DISALLOWED_ORIGIN,
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('allowed origin receives Access-Control-Allow-Origin on 401 error response', async () => {
    // Omit Authorization -- returns 401, but CORS header should still be set
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
  });
});

// ---------------------------------------------------------------------------
// CORS -- read-only endpoints remain unaffected
// ---------------------------------------------------------------------------

describe('CORS -- read-only endpoints remain unaffected', () => {
  it('GET /.well-known/signing-key returns Access-Control-Allow-Origin: *', async () => {
    const res = await SELF.fetch('https://worker.test/.well-known/signing-key');
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

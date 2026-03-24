// tva
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function expectSecurityHeaders(response) {
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  const hsts = response.headers.get('Strict-Transport-Security');
  expect(hsts).toBeTruthy();
  expect(hsts).toContain('max-age=');
  expect(hsts).toContain('includeSubDomains');
  expect(hsts).toContain('preload');
  const link = response.headers.get('Link');
  expect(link).toBeTruthy();
  expect(link).toContain('rel="terms-of-service"');
}

describe('Security headers -- present on all routes', () => {
  it('GET /health -- baseline 200 response has security headers', async () => {
    const res = await SELF.fetch('https://worker.test/health');
    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
  });

  it('POST /v1/captures without auth -- 401 error response has security headers', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.status).toBe(401);
    expectSecurityHeaders(res);
  });

  it('GET /v1/captures/{id} unauthenticated -- 404 response has security headers (public endpoint, #169)', async () => {
    // Individual capture endpoints are now public. Non-existent capture returns 404.
    const res = await SELF.fetch('https://worker.test/v1/captures/cap_00000000000000000000000000000000');
    expect(res.status).toBe(404);
    expectSecurityHeaders(res);
  });

  it('GET /.well-known/signing-key -- 200 response has security headers', async () => {
    const res = await SELF.fetch('https://worker.test/.well-known/signing-key');
    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
  });

  it('GET /nonexistent -- catch-all 404 has security headers', async () => {
    const res = await SELF.fetch('https://worker.test/nonexistent');
    expect(res.status).toBe(404);
    expectSecurityHeaders(res);
  });
});

describe('Security headers -- specific value checks', () => {
  it('HSTS meets preload requirements (max-age >= 63072000, preload directive present)', async () => {
    const res = await SELF.fetch('https://worker.test/health');
    const hsts = res.headers.get('Strict-Transport-Security');
    const match = hsts.match(/max-age=(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(63072000);
    expect(hsts).toContain('preload');
  });

  it('X-Frame-Options is exactly DENY', async () => {
    const res = await SELF.fetch('https://worker.test/health');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });
});

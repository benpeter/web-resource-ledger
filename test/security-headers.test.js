// tva
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function expectGlobalHeaders(response) {
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
    expectGlobalHeaders(res);
  });

  it('POST /v1/captures without auth -- 401 error response has security headers', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.status).toBe(401);
    expectGlobalHeaders(res);
  });

  it('GET /v1/captures/{id} unauthenticated -- 404 response has security headers (public endpoint, #169)', async () => {
    // Individual capture endpoints are now public. Non-existent capture returns 404.
    const res = await SELF.fetch('https://worker.test/v1/captures/cap_00000000000000000000000000000000');
    expect(res.status).toBe(404);
    expectGlobalHeaders(res);
  });

  it('GET /.well-known/signing-key -- 200 response has security headers', async () => {
    const res = await SELF.fetch('https://worker.test/.well-known/signing-key');
    expect(res.status).toBe(200);
    expectGlobalHeaders(res);
  });

  it('GET /nonexistent -- catch-all 404 has security headers', async () => {
    const res = await SELF.fetch('https://worker.test/nonexistent');
    expect(res.status).toBe(404);
    expectGlobalHeaders(res);
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

describe('WRL-API-Version -- version consistency', () => {
  it('package.json version matches semver format', async () => {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    expect(pkg.default.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('WRL-API-Version header absent in test env (BUILD_VERSION undefined)', async () => {
    const res = await SELF.fetch('https://worker.test/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('WRL-API-Version')).toBeNull();
  });
});

describe('Deprecation headers -- absent on non-deprecated routes', () => {
  it('GET /health has no Deprecation or Sunset headers', async () => {
    const res = await SELF.fetch('https://worker.test/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Deprecation')).toBeNull();
    expect(res.headers.get('Sunset')).toBeNull();
  });

  it('POST /v1/captures (401) has no Deprecation or Sunset headers', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('Deprecation')).toBeNull();
    expect(res.headers.get('Sunset')).toBeNull();
  });
});

describe('Deprecation config -- v1.0.0 baseline', () => {
  it('DEPRECATIONS registry is empty at v1.0.0', async () => {
    const { DEPRECATIONS } = await import('../src/deprecations.js');
    expect(Object.keys(DEPRECATIONS)).toHaveLength(0);
  });
});

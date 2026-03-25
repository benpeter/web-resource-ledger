import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

// Paths that must be allowed on verify.* hostnames
const ALLOWED_PATHS = [
  '/health',
  '/favicon.ico',
  '/.well-known/signing-key',
  '/.well-known/signing-keys',
  '/v1/verify/cap_' + 'a'.repeat(32),
  '/v1/captures/cap_' + 'a'.repeat(32) + '/artifacts/screenshot',
  '/v1/captures/cap_' + 'a'.repeat(32) + '/artifacts/screenshot-before',
  '/v1/captures/cap_' + 'a'.repeat(32) + '/artifacts/html',
  '/v1/captures/cap_' + 'a'.repeat(32) + '/artifacts/headers',
  '/v1/captures/cap_' + 'a'.repeat(32) + '/artifacts/wacz',
];

// Paths that must be blocked (404) on verify.* hostnames
const BLOCKED_PATHS = [
  '/v1/captures',
  '/v1/captures/cap_' + 'a'.repeat(32),
  '/v1/captures/cap_' + 'a'.repeat(32) + '/status',
  '/v1/captures/cap_' + 'a'.repeat(32) + '/certificate',
  '/v1/admin/keys',
  '/v1/admin/usage',
  '/v1/account/keys',
  '/v1/account/usage',
  '/v1/billing/checkout',
  '/v1/billing/portal',
  '/v1/webhooks',
  '/v1/schedules',
  '/auth/login',
  '/ui',
  '/mcp',
];

describe('Verify subdomain -- allowed paths pass through', () => {
  for (const path of ALLOWED_PATHS) {
    it(`GET ${path} does NOT return 404 from host restriction`, async () => {
      const res = await SELF.fetch(`https://verify.webresourceledger.com${path}`);
      // The host restriction must not block these. They may still 404/500 for other
      // reasons (e.g. missing capture record), but the blocking message must not appear.
      if (res.status === 404) {
        const body = await res.json().catch(() => ({}));
        expect(body.detail ?? '').not.toContain('verification subdomain');
      }
    });
  }
});

describe('Verify subdomain -- blocked paths return 404', () => {
  for (const path of BLOCKED_PATHS) {
    it(`GET ${path} returns 404 with subdomain message`, async () => {
      const res = await SELF.fetch(`https://verify.webresourceledger.com${path}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.detail).toContain('verification subdomain');
    });
  }
});

describe('API subdomain -- all paths continue to work normally', () => {
  it('GET /v1/captures on api.* does NOT get subdomain 404', async () => {
    // This will 401 (no auth) -- that proves host restriction did not fire.
    const res = await SELF.fetch('https://api.webresourceledger.com/v1/captures');
    expect(res.status).not.toBe(404);
  });

  it('GET /health on api.* returns 200', async () => {
    const res = await SELF.fetch('https://api.webresourceledger.com/health');
    expect(res.status).toBe(200);
  });

  it('GET /v1/admin/keys on api.* does NOT get subdomain 404', async () => {
    // Will 401 -- that proves the route reached auth logic, not host restriction.
    const res = await SELF.fetch('https://api.webresourceledger.com/v1/admin/keys');
    expect(res.status).not.toBe(404);
  });
});

describe('Verify-staging subdomain -- blocked paths return 404', () => {
  it('GET /v1/captures on verify-staging.* returns 404 with subdomain message', async () => {
    const res = await SELF.fetch('https://verify-staging.webresourceledger.com/v1/captures');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toContain('verification subdomain');
  });

  it('GET /health on verify-staging.* is allowed', async () => {
    const res = await SELF.fetch('https://verify-staging.webresourceledger.com/health');
    if (res.status === 404) {
      const body = await res.json().catch(() => ({}));
      expect(body.detail ?? '').not.toContain('verification subdomain');
    }
  });
});

// tva
// /.well-known/security.txt (RFC 9116) lives on the landing site; the API
// and verify hosts redirect to it, so security researchers who probe the
// host they test find the reporting channel.
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const CANONICAL = 'https://webresourceledger.com/.well-known/security.txt';

describe('GET /.well-known/security.txt', () => {
  it('redirects the API host to the landing site', async () => {
    const response = await SELF.fetch('https://api.webresourceledger.com/.well-known/security.txt', { redirect: 'manual' });
    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe(CANONICAL);
  });

  it('redirects a verify host to the landing site', async () => {
    const response = await SELF.fetch('https://verify.webresourceledger.com/.well-known/security.txt', { redirect: 'manual' });
    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe(CANONICAL);
  });
});

describe('HEAD /.well-known/security.txt', () => {
  it('answers like GET, without a body', async () => {
    const response = await SELF.fetch('https://api.webresourceledger.com/.well-known/security.txt', { method: 'HEAD', redirect: 'manual' });
    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe(CANONICAL);
    expect(await response.text()).toBe('');
  });
});

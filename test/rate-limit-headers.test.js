// tva
// X-RateLimit-Limit on the sign-in, account, billing, unsubscribe and
// verify-email routes said 20 or 30 a minute, while AUTH_RATE_LIMITER, which all
// of them share, allows 10 a minute per IP.
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

let ipCounter = 1; // Distinct range from other test files
function nextIp() {
  return `10.0.6.${ipCounter++}`;
}

describe('X-RateLimit-Limit on routes behind AUTH_RATE_LIMITER', () => {
  it.each([
    ['GET', '/auth/session'],
    ['GET', '/v1/account/settings'],
    ['GET', '/v1/account/usage'],
    ['POST', '/v1/billing/portal'],
    ['GET', '/v1/notifications/unsubscribe'],
  ])('%s %s says 10', async (method, path) => {
    const res = await SELF.fetch(`https://worker.test${path}`, {
      method,
      headers: { 'CF-Connecting-IP': nextIp() },
    });
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
  });
});

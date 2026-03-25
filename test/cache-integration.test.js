// Integration tests for CDN cache behavior.
// Validates Server-Timing headers, Cache-Control headers, and cache key normalization.
// NOTE: Workers Cache API (caches.default) is functional in workerd test runtime
// but cache state may not persist across SELF.fetch() calls in test mode.

import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Server-Timing header -- signing-key', () => {
  it('includes cache status descriptor', async () => {
    const res = await SELF.fetch('https://worker.test/.well-known/signing-key');
    expect(res.status).toBe(200);
    const st = res.headers.get('Server-Timing');
    expect(st).toBeTruthy();
    expect(st).toMatch(/cache;desc="(HIT|MISS|BYPASS)"/);
  });

  it('includes total duration metric', async () => {
    const res = await SELF.fetch('https://worker.test/.well-known/signing-key');
    const st = res.headers.get('Server-Timing');
    expect(st).toMatch(/total;dur=\d+/);
  });
});

describe('Server-Timing header -- signing-keys', () => {
  it('includes cache status descriptor', async () => {
    const res = await SELF.fetch('https://worker.test/.well-known/signing-keys');
    expect(res.status).toBe(200);
    const st = res.headers.get('Server-Timing');
    expect(st).toBeTruthy();
    expect(st).toMatch(/cache;desc="(HIT|MISS|BYPASS)"/);
  });

  it('includes total duration metric', async () => {
    const res = await SELF.fetch('https://worker.test/.well-known/signing-keys');
    const st = res.headers.get('Server-Timing');
    expect(st).toMatch(/total;dur=\d+/);
  });
});

describe('Cache-Control headers -- verification endpoints', () => {
  it('signing-key: public, max-age=3600, stale-while-revalidate=300', async () => {
    const res = await SELF.fetch('https://worker.test/.well-known/signing-key');
    const cc = res.headers.get('Cache-Control');
    expect(cc).toContain('public');
    expect(cc).toContain('max-age=3600');
    expect(cc).toContain('stale-while-revalidate=300');
  });

  it('signing-keys: public, max-age=3600, stale-while-revalidate=300', async () => {
    const res = await SELF.fetch('https://worker.test/.well-known/signing-keys');
    const cc = res.headers.get('Cache-Control');
    expect(cc).toContain('public');
    expect(cc).toContain('max-age=3600');
    expect(cc).toContain('stale-while-revalidate=300');
  });
});

describe('Cache-Control headers -- error responses', () => {
  it('404 responses include no-store', async () => {
    const res = await SELF.fetch('https://worker.test/v1/verify/cap_00000000000000000000000000000000');
    // 404 for nonexistent capture
    expect(res.status).toBe(404);
    const cc = res.headers.get('Cache-Control');
    expect(cc).toContain('no-store');
  });
});

describe('CORS headers on cached endpoints', () => {
  it('signing-key includes Access-Control-Allow-Origin: *', async () => {
    const res = await SELF.fetch('https://worker.test/.well-known/signing-key');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('signing-keys includes Access-Control-Allow-Origin: *', async () => {
    const res = await SELF.fetch('https://worker.test/.well-known/signing-keys');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

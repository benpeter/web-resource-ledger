import { describe, it, expect } from 'vitest';
import { buildCacheKey, buildSimpleCacheKey } from '../src/cache.js';

describe('buildCacheKey', () => {
  it('appends _fmt=json for JSON Accept header', () => {
    const req = new Request('https://example.com/v1/verify/cap_abc123', {
      headers: { Accept: 'application/json' },
    });
    const key = buildCacheKey(req);
    expect(key.url).toBe('https://example.com/v1/verify/cap_abc123?_fmt=json');
    expect(key.method).toBe('GET');
  });

  it('appends _fmt=html for text/html Accept header', () => {
    const req = new Request('https://example.com/v1/verify/cap_abc123', {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    const key = buildCacheKey(req);
    expect(key.url).toBe('https://example.com/v1/verify/cap_abc123?_fmt=html');
  });

  it('defaults to _fmt=json when no Accept header', () => {
    const req = new Request('https://example.com/v1/verify/cap_abc123');
    const key = buildCacheKey(req);
    expect(key.url).toBe('https://example.com/v1/verify/cap_abc123?_fmt=json');
  });

  it('preserves existing query parameters', () => {
    const req = new Request('https://example.com/path?existing=1', {
      headers: { Accept: 'application/json' },
    });
    const key = buildCacheKey(req);
    const url = new URL(key.url);
    expect(url.searchParams.get('existing')).toBe('1');
    expect(url.searchParams.get('_fmt')).toBe('json');
  });

  it('always uses GET method regardless of original method', () => {
    const req = new Request('https://example.com/path', { method: 'POST' });
    const key = buildCacheKey(req);
    expect(key.method).toBe('GET');
  });
});

describe('buildSimpleCacheKey', () => {
  it('uses the request URL directly', () => {
    const req = new Request('https://example.com/.well-known/signing-key');
    const key = buildSimpleCacheKey(req);
    expect(key.url).toBe('https://example.com/.well-known/signing-key');
    expect(key.method).toBe('GET');
  });

  it('always uses GET method', () => {
    const req = new Request('https://example.com/path', { method: 'DELETE' });
    const key = buildSimpleCacheKey(req);
    expect(key.method).toBe('GET');
  });
});

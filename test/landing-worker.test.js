/**
 * Landing Worker (landing/src/index.js): HTTPS enforcement and security headers.
 *
 * Phase 0124: the landing site sent no Strict-Transport-Security header, while
 * docs and the API did, and the www redirect kept the request's scheme, so
 * http://www.webresourceledger.com led to plain-HTTP http://webresourceledger.com.
 */
import { describe, it, expect } from 'vitest';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import landing from '../landing/src/index.js';

function envWithAsset(body = '<!doctype html><title>WRL</title>', contentType = 'text/html; charset=utf-8') {
  return {
    ASSETS: { fetch: async () => new Response(body, { status: 200, headers: { 'Content-Type': contentType } }) },
  };
}

async function get(url, env = envWithAsset()) {
  const ctx = createExecutionContext();
  const res = await landing.fetch(new Request(url), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('landing Worker -- HTTPS', () => {
  it('sends Strict-Transport-Security on pages, matching the docs site', async () => {
    const res = await get('https://webresourceledger.com/');
    expect(res.status).toBe(200);
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('sends Strict-Transport-Security on assets too', async () => {
    const res = await get('https://webresourceledger.com/css/landing.css', envWithAsset('body{}', 'text/css'));
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('redirects www to the HTTPS apex even when the request came over HTTP', async () => {
    const res = await get('http://www.webresourceledger.com/pricing?x=1');
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://webresourceledger.com/pricing?x=1');
  });

  it('keeps the existing security headers', async () => {
    const res = await get('https://webresourceledger.com/');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  });
});

describe('E2E webhook echo target (phase 0127)', () => {
  // The staging E2E suite registers webhooks pointing here instead of httpbin.org.
  async function send(url, init) {
    const ctx = createExecutionContext();
    let assetsCalled = false;
    const env = { ASSETS: { fetch: async () => { assetsCalled = true; return new Response('asset'); } } };
    const res = await landing.fetch(new Request(url, init), env, ctx);
    await waitOnExecutionContext(ctx);
    return { res, assetsCalled };
  }

  it('answers a POST to /__e2e/echo with 200 and does not touch the static assets', async () => {
    const { res, assetsCalled } = await send('https://webresourceledger.com/__e2e/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'ping' }),
    });
    expect(res.status).toBe(200);
    expect(assetsCalled).toBe(false);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.bytes).toBe(16);
  });

  it('does not reflect the request body or headers back', async () => {
    const { res } = await send('https://webresourceledger.com/__e2e/echo', {
      method: 'POST',
      headers: { 'X-WRL-Signature': 'sig-value' },
      body: '<script>alert(1)</script>',
    });
    const text = await res.text();
    expect(text).not.toContain('script');
    expect(text).not.toContain('sig-value');
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('answers /__e2e/status/503 with 503 for the delivery-failure test', async () => {
    const { res } = await send('https://webresourceledger.com/__e2e/status/503', { method: 'POST', body: '{}' });
    expect(res.status).toBe(503);
  });

  it('only allows status codes 200 to 599 and is not indexed', async () => {
    expect((await send('https://webresourceledger.com/__e2e/status/42', { method: 'POST' })).res.status).toBe(400);
    expect((await send('https://webresourceledger.com/__e2e/status/abc', { method: 'POST' })).res.status).toBe(404);
    const { res } = await send('https://webresourceledger.com/__e2e/echo', { method: 'POST' });
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('rejects GET on the echo path, so it is not a page', async () => {
    const { res } = await send('https://webresourceledger.com/__e2e/echo', { method: 'GET' });
    expect(res.status).toBe(405);
  });
});

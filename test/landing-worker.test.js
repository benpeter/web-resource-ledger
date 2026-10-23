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

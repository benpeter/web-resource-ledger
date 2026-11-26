/**
 * Landing Worker (landing/src/index.js): HTTPS enforcement and security headers.
 *
 * Phase 0124: the landing site sent no Strict-Transport-Security header, while
 * docs and the API did, and the www redirect kept the request's scheme, so
 * http://www.webresourceledger.com led to plain-HTTP http://webresourceledger.com.
 */
import { describe, it, expect, vi } from 'vitest';
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

// Ben decided on 2026-11-25 to submit webresourceledger.com to the browsers'
// HSTS preload list (backlog #72); hstspreload.org requires the apex to send
// max-age of at least a year, includeSubDomains and preload.
const PRELOAD_HSTS = 'max-age=31536000; includeSubDomains; preload';

describe('landing Worker -- HTTPS', () => {
  it('sends Strict-Transport-Security with preload on pages', async () => {
    const res = await get('https://webresourceledger.com/');
    expect(res.status).toBe(200);
    expect(res.headers.get('Strict-Transport-Security')).toBe(PRELOAD_HSTS);
  });

  it('sends Strict-Transport-Security on assets too', async () => {
    const res = await get('https://webresourceledger.com/css/landing.css', envWithAsset('body{}', 'text/css'));
    expect(res.headers.get('Strict-Transport-Security')).toBe(PRELOAD_HSTS);
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

describe('landing Worker -- static asset failure', () => {
  it('answers 500 and logs the error when the assets binding throws', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    try {
      const env = {
        CORALOGIX_ENDPOINT: 'https://ingress.test.coralogix.com/logs/v1/singles',
        CORALOGIX_SEND_KEY: 'test-send-key',
        ASSETS: { fetch: async () => { throw new Error('assets unavailable'); } },
      };
      const res = await get('https://webresourceledger.com/pricing', env);
      expect(res.status).toBe(500);
      const logCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('coralogix'));
      expect(logCall, 'a Coralogix log request').toBeTruthy();
      const [entry] = JSON.parse(logCall[1].body);
      expect(entry.severity).toBe(5);
      expect(JSON.parse(entry.text)).toMatchObject({
        event: 'landing.assets_fail',
        path: '/pricing',
        errorMessage: 'assets unavailable',
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

// Phase 0211 (backlog #56): the Link Rot Checker and its endpoints live in the
// API Worker, which has the URL safety checks, rate limits and a staging
// environment. The landing Worker passes /tools/ requests to it over the API
// service binding, so the tool's address is webresourceledger.com.
describe('landing Worker -- tools forwarded to the API Worker (phase 0211)', () => {
  const PAGE_CSP = "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'";

  function envWithApi() {
    const seen = [];
    return {
      seen,
      ASSETS: { fetch: async () => { throw new Error('assets must not be used for /tools/'); } },
      API: {
        fetch: async (request) => {
          seen.push({ method: request.method, url: request.url, ip: request.headers.get('CF-Connecting-IP') });
          return new Response('<!doctype html><title>Link Rot Checker</title>', {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP },
          });
        },
      },
    };
  }

  it('forwards the page with the visitor IP and keeps the page CSP and HSTS', async () => {
    const env = envWithApi();
    const ctx = createExecutionContext();
    const res = await landing.fetch(new Request('https://webresourceledger.com/tools/link-rot-checker?run=abcdefabcdef0001', {
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(env.seen).toEqual([{ method: 'GET', url: 'https://webresourceledger.com/tools/link-rot-checker?run=abcdefabcdef0001', ip: '203.0.113.7' }]);
    expect(res.headers.get('Content-Security-Policy')).toBe(PAGE_CSP);
    expect(res.headers.get('Strict-Transport-Security')).toBe(PRELOAD_HSTS);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('forwards the check requests', async () => {
    const env = envWithApi();
    const ctx = createExecutionContext();
    await landing.fetch(new Request('https://webresourceledger.com/tools/link-check', { method: 'POST', body: '{}' }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(env.seen.map((s) => `${s.method} ${new URL(s.url).pathname}`)).toEqual(['POST /tools/link-check']);
  });

  it('keeps serving other pages from the static assets', async () => {
    const res = await get('https://webresourceledger.com/');
    expect(res.headers.get('Content-Security-Policy')).toContain("script-src 'none'");
  });
});

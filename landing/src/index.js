// tva
import { trackHit, isPageView } from '../../src/pirsch.js';
import { log } from '../../src/log.js';

/**
 * Security headers for the landing site.
 * script-src 'none' is correct -- the landing page has zero JavaScript.
 * JSON-LD in <script type="application/ld+json"> is not executed by browsers
 * and is unaffected by script-src.
 */
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'none'; script-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // Same value as the docs site (site/src/index.js). No preload: that is hard to undo.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// Webhook target for the staging E2E suite (test/e2e/webhook-lifecycle.spec.js),
// so it doesn't depend on httpbin.org. Answers without reflecting anything back.
const E2E_PREFIX = '/__e2e/';

function e2eResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      ...SECURITY_HEADERS,
    },
  });
}

async function handleE2e(request, url) {
  if (request.method !== 'POST') {
    return e2eResponse(405, { ok: false, error: 'POST only' });
  }
  const rest = url.pathname.slice(E2E_PREFIX.length);
  if (rest === 'echo') {
    const bytes = (await request.arrayBuffer()).byteLength;
    return e2eResponse(200, { ok: true, bytes });
  }
  const m = rest.match(/^status\/(\d+)$/);
  if (!m) return e2eResponse(404, { ok: false, error: 'unknown path' });
  const code = Number(m[1]);
  if (code < 200 || code > 599) return e2eResponse(400, { ok: false, error: 'status must be 200-599' });
  return e2eResponse(code, { ok: code < 400, status: code });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(E2E_PREFIX)) {
      return handleE2e(request, url);
    }
    if (url.hostname === 'www.webresourceledger.com') {
      url.hostname = 'webresourceledger.com';
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    let response;
    try {
      response = await env.ASSETS.fetch(request);
    } catch {
      return new Response('Internal Server Error', { status: 500 });
    }

    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(key, value);
    }
    if (response.headers.get('content-type')?.startsWith('text/html')) {
      headers.set('Cache-Control', 'private');
    }

    // Count page views only: HTML pages, not assets, robots.txt or redirects.
    if (isPageView(request, response)) {
      ctx.waitUntil(trackHit(request, env, { property: 'landing' }) ?? Promise.resolve());
    }

    ctx.waitUntil(log(env, 3, 'pageview', {
      event: 'pageview',
      subdomain: 'landing',
      path: url.pathname,
      status: response.status,
    }) ?? Promise.resolve());

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

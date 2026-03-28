// tva
import { trackHit } from '../../src/pirsch.js';
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
};

export default {
  async fetch(request, env, ctx) {
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

    if (response.status < 400) {
      ctx.waitUntil(trackHit(request, env, { property: 'landing' }) ?? Promise.resolve());
    }

    const { pathname } = new URL(request.url);
    ctx.waitUntil(log(env, 3, 'pageview', {
      event: 'pageview',
      subdomain: 'landing',
      path: pathname,
      status: response.status,
    }) ?? Promise.resolve());

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

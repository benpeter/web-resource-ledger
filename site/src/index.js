// tva
import { trackHit } from '../../src/pirsch.js';
import { log } from '../../src/log.js';

/**
 * Security headers for the docs site.
 * script-src 'self' needed for js/clipboard.js.
 * Replaces site/_headers which is no longer applied with run_worker_first = true.
 */
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
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

    ctx.waitUntil(trackHit(request, env, { property: 'docs' }) ?? Promise.resolve());

    const { pathname } = new URL(request.url);
    ctx.waitUntil(log(env, 3, 'pageview', {
      event: 'pageview',
      subdomain: 'docs',
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

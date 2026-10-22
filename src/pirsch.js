// tva

import { log } from './log.js';

const HIT_ENDPOINT = 'https://api.pirsch.io/api/v1/hit';
const EVENT_ENDPOINT = 'https://api.pirsch.io/api/v1/event';

// Server-side events (captures, payments) happen without a browser request.
// Pirsch requires url, ip and user_agent on every event and drops non-browser
// user agents as bots, so these events carry a WRL URL, the submitter's ip and
// user agent when known (otherwise the values below) and disable_bot_filter.
const API_ORIGIN = 'https://api.webresourceledger.com';
export const SERVER_USER_AGENT = 'WRL-Server/1.0 (+https://webresourceledger.com)';
const NO_CLIENT_IP = '192.0.2.1'; // RFC 5737 documentation address

/**
 * Internal send helper. Fire-and-forget. Returns the fetch Promise so callers
 * can pass it to ctx.waitUntil(). Returns undefined if PIRSCH_ACCESS_KEY is absent.
 *
 * @param {object} env
 * @param {string} endpoint
 * @param {object} body
 * @returns {Promise<void>|undefined}
 */
function _send(env, endpoint, body) {
  if (!env.PIRSCH_ACCESS_KEY) return;
  try {
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.PIRSCH_ACCESS_KEY}`,
      },
      body: JSON.stringify(body),
    }).then((res) => {
      // Pirsch returns 200 even when it later drops a hit as bot traffic, so a 2xx
      // is "accepted" and we stay silent (a bot-drop is not actionable). A non-2xx
      // is a real failure -- 401 = invalid/rotated access key, 400 = validation,
      // 429 = rate limit -- which would otherwise silently halt all analytics with
      // no trace. Fail loudly so a dead key surfaces in Coralogix, not weeks later
      // via a "no traffic" email.
      if (!res.ok) {
        // Pirsch's error body names the problem (e.g. a missing field); keep a
        // short prefix so a rejection can be diagnosed from the log alone.
        return res.text().catch(() => '').then((text) => {
          log(env, 4, 'pirsch', { event: 'pirsch.send_rejected', endpoint, status: res.status, detail: String(text).slice(0, 200) });
        });
      }
    }).catch((err) => {
      log(env, 4, 'pirsch', { event: 'pirsch.send_fail', endpoint, errorMessage: String(err?.message ?? '').slice(0, 128) });
    });
  } catch (err) {
    log(env, 4, 'pirsch', { event: 'pirsch.send_fail', endpoint, errorMessage: String(err?.message ?? '').slice(0, 128) });
    return;
  }
}

/**
 * Extract visitor fields from a Request, omitting any that are absent.
 *
 * @param {Request} request
 * @returns {object}
 */
function _fromRequest(request) {
  const h = (name) => request.headers.get(name) || undefined;
  const fields = {
    url: request.url,
    ip: h('CF-Connecting-IP'),
    user_agent: h('User-Agent'),
    accept_language: h('Accept-Language'),
    referrer: h('Referer'),
    sec_ch_ua: h('Sec-CH-UA'),
    sec_ch_ua_mobile: h('Sec-CH-UA-Mobile'),
    sec_ch_ua_platform: h('Sec-CH-UA-Platform'),
    sec_ch_ua_platform_version: h('Sec-CH-UA-Platform-Version'),
    sec_ch_width: h('Sec-CH-Width'),
    sec_ch_viewport_width: h('Sec-CH-Viewport-Width'),
  };
  // Drop undefined values
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
}

/**
 * Track a page view. Extracts visitor data from the request.
 *
 * @param {Request} request
 * @param {object} env Must contain PIRSCH_ACCESS_KEY
 * @param {object} [tags] Key-value pairs (e.g. { property: 'landing' })
 * @returns {Promise<void>|undefined}
 */
export function trackHit(request, env, tags) {
  // Pirsch rejects a hit without a user agent (400), and a request without one
  // is never a countable visitor.
  if (!request.headers.get('User-Agent')) return undefined;
  const body = { ..._fromRequest(request) };
  if (tags && Object.keys(tags).length > 0) body.tags = tags;
  return _send(env, HIT_ENDPOINT, body);
}

/**
 * Track a named event with request context.
 *
 * @param {Request} request
 * @param {object} env
 * @param {string} eventName
 * @param {object} [meta] String key-value pairs for event_meta
 * @param {object} [tags] Key-value pairs for tags
 * @returns {Promise<void>|undefined}
 */
export function trackEvent(request, env, eventName, meta, tags) {
  const body = { ..._fromRequest(request), event_name: eventName };
  if (meta && Object.keys(meta).length > 0) body.event_meta = meta;
  if (tags && Object.keys(tags).length > 0) body.tags = tags;
  return _send(env, EVENT_ENDPOINT, body);
}

/**
 * Track a server-side event (queue consumers, webhooks, API actions).
 *
 * @param {object} env
 * @param {string} eventName
 * @param {{ path: string, ip?: string|null, userAgent?: string|null, meta?: object }} fields
 *   path: WRL API path the event is reported under; ip/userAgent: the person's,
 *   when the event traces back to their request
 * @returns {Promise<void>|undefined}
 */
export function trackServerEvent(env, eventName, { path, ip, userAgent, meta } = {}) {
  const body = {
    event_name: eventName,
    url: `${API_ORIGIN}${path || '/'}`,
    ip: ip || NO_CLIENT_IP,
    user_agent: userAgent || SERVER_USER_AGENT,
    non_interactive: true,
    disable_bot_filter: true,
    tags: { property: 'api' },
  };
  if (meta && Object.keys(meta).length > 0) body.event_meta = meta;
  return _send(env, EVENT_ENDPOINT, body);
}

/**
 * Whether a landing or docs response is a page view worth counting: a GET for
 * an HTML page that succeeded (200), or a browser revalidating one (304).
 * Assets, robots.txt, the sitemap, redirects, errors and requests without a
 * user agent are not page views.
 *
 * @param {Request} request
 * @param {Response} response
 * @returns {boolean}
 */
export function isPageView(request, response) {
  if (request.method !== 'GET' || !request.headers.get('User-Agent')) return false;
  if (response.status === 200) {
    return (response.headers.get('Content-Type') || '').startsWith('text/html');
  }
  if (response.status === 304) {
    return request.headers.get('Sec-Fetch-Dest') === 'document' ||
      (request.headers.get('Accept') || '').includes('text/html');
  }
  return false;
}

// tva

import { log } from './log.js';

const HIT_ENDPOINT = 'https://api.pirsch.io/api/v1/hit';
const EVENT_ENDPOINT = 'https://api.pirsch.io/api/v1/event';

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
 * Track a named event without a Request object (queue consumers, webhooks).
 *
 * @param {object} env
 * @param {string} eventName
 * @param {object} fields { url?, ip?, userAgent?, referrer? }
 * @param {object} [meta]
 * @param {object} [tags]
 * @returns {Promise<void>|undefined}
 */
export function trackEventRaw(env, eventName, fields, meta, tags) {
  const { url, ip, userAgent, referrer } = fields ?? {};
  const raw = { url, ip, user_agent: userAgent, referrer };
  // Drop undefined values
  const base = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined));
  const body = { ...base, event_name: eventName };
  if (meta && Object.keys(meta).length > 0) body.event_meta = meta;
  if (tags && Object.keys(tags).length > 0) body.tags = tags;
  return _send(env, EVENT_ENDPOINT, body);
}

/*
 * coralogix-webhook.js -- Coralogix alert webhook handler
 *
 * Receives alert webhooks from Coralogix and dispatches repository_dispatch
 * events to GitHub Actions for automated investigation.
 *
 * Endpoint: POST /v1/webhooks/coralogix
 *
 * Authentication: Bearer token (CORALOGIX_WEBHOOK_SECRET), timing-safe.
 * The endpoint is public but auth-verified internally -- no session required.
 *
 * Dedup: KV key cx_alert:{alertSlug}:{hourBucket}, TTL 7200s.
 * Circuit breaker: max 10 dispatches/day via KV key cx_dispatch_count:{date}.
 *
 * Resolve actions: acknowledged with 200 but not dispatched (future phase).
 *
 * Tests: test/coralogix-webhook.test.js
 */ // tva

import { jsonResponse, problemResponse } from './responses.js';
import { log } from './log.js';

// ---------------------------------------------------------------------------
// Alert allowlist -- only these alerts trigger GitHub dispatch
// ---------------------------------------------------------------------------

const DISPATCH_ALLOWLIST = new Set([
  '[WRL] Capture Failures',
  '[WRL] Qualified TSA Failures',
  '[WRL] Auth Failure Spike',
  '[WRL] Worker Errors (5xx)',
  '[WRL] Threat Check API Failures',
  '[WRL] Email Delivery Failures',
]);

const DAILY_DISPATCH_LIMIT = 10;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a Bearer token from the Authorization header.
 * Returns { ok: true, token } or { ok: false, response }.
 *
 * @param {Request} request
 * @returns {{ ok: true, token: string } | { ok: false, response: Response }}
 */
function extractBearerToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return {
      ok: false,
      response: problemResponse(401, 'Authorization header is required', { 'WWW-Authenticate': 'Bearer' }),
    };
  }
  if (!authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      response: problemResponse(401, 'Authorization header must use Bearer scheme', { 'WWW-Authenticate': 'Bearer' }),
    };
  }
  const token = authHeader.slice('Bearer '.length);
  if (!token) {
    return {
      ok: false,
      response: problemResponse(401, 'Authorization header must use Bearer scheme', { 'WWW-Authenticate': 'Bearer' }),
    };
  }
  return { ok: true, token };
}

/**
 * Timing-safe string comparison. Returns true if equal.
 *
 * @param {string} a
 * @param {string} b
 * @returns {Promise<boolean>}
 */
async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

/**
 * Normalize an alert name to a slug for use in KV keys.
 * Lowercase, non-alphanumeric replaced with hyphens, collapse runs.
 *
 * @param {string} name
 * @returns {string}
 */
function alertSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Return the current UTC hour bucket in YYYYMMDDHH format.
 *
 * @returns {string}
 */
function hourBucket() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}`;
}

/**
 * Return today's UTC date in YYYY-MM-DD format for the circuit-breaker key.
 *
 * @returns {string}
 */
function todayDate() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Dispatch a repository_dispatch event to GitHub Actions.
 * Errors are caught and logged -- never allowed to propagate to the caller.
 *
 * @param {object} env
 * @param {object} dispatchPayload
 * @returns {Promise<void>}
 */
async function dispatchToGitHub(env, dispatchPayload) {
  const res = await fetch(
    'https://api.github.com/repos/benpeter/web-resource-ledger/dispatches',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'User-Agent': 'wrl-alert-receiver/1.0',
      },
      body: JSON.stringify({
        event_type: 'coralogix-alert',
        client_payload: dispatchPayload,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub dispatch failed: ${res.status} ${text.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// POST /v1/webhooks/coralogix
// ---------------------------------------------------------------------------

/**
 * Coralogix alert webhook handler.
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response>}
 */
export async function handleCoralogixWebhook(request, env, ctx) {
  // Misconfiguration guard
  if (!env.CORALOGIX_WEBHOOK_SECRET) {
    return problemResponse(503, 'Webhook endpoint is not configured');
  }

  // Auth: Bearer token, timing-safe
  const extracted = extractBearerToken(request);
  if (!extracted.ok) {
    ctx.waitUntil(log(env, 5, 'alert', {
      event: 'alert.webhook_auth_fail',
      reason: 'missing_or_invalid_header',
      responseStatus: 401,
    }) ?? Promise.resolve());
    return extracted.response;
  }

  const match = await timingSafeEqual(extracted.token, env.CORALOGIX_WEBHOOK_SECRET);
  if (!match) {
    ctx.waitUntil(log(env, 5, 'alert', {
      event: 'alert.webhook_auth_fail',
      reason: 'invalid_token',
      responseStatus: 401,
    }) ?? Promise.resolve());
    return problemResponse(401, 'Invalid webhook secret', { 'WWW-Authenticate': 'Bearer' });
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON');
  }

  // Required field validation
  const missing = ['alert_id', 'alert_name', 'alert_action'].filter(f => !body[f]);
  if (missing.length > 0) {
    return problemResponse(400, `Missing required fields: ${missing.join(', ')}`);
  }

  // Normalize alert_action -- Coralogix sends 'trigger'/'resolve' (no -d suffix).
  // We normalize to 'triggered'/'resolved' for internal consistency.
  const ACTION_MAP = { trigger: 'triggered', resolve: 'resolved', triggered: 'triggered', resolved: 'resolved' };
  const normalizedAction = ACTION_MAP[body.alert_action];
  if (!normalizedAction) {
    return problemResponse(400, `alert_action must be 'triggered' or 'resolved'; got '${body.alert_action}'`);
  }
  body.alert_action = normalizedAction;

  // Log receipt on every valid webhook
  ctx.waitUntil(log(env, 3, 'alert', {
    event: 'alert.webhook_received',
    alertId: body.alert_id,
    alertName: body.alert_name,
    alertAction: body.alert_action,
  }) ?? Promise.resolve());

  // Resolve: acknowledge without dispatching (future phase)
  if (body.alert_action === 'resolved') {
    ctx.waitUntil(log(env, 3, 'alert', {
      event: 'alert.dispatch_skipped',
      alertId: body.alert_id,
      alertName: body.alert_name,
      reason: 'resolve',
    }) ?? Promise.resolve());
    return jsonResponse({ received: true, dispatched: false, reason: 'resolve' });
  }

  // Alert allowlist filter
  if (!DISPATCH_ALLOWLIST.has(body.alert_name)) {
    ctx.waitUntil(log(env, 3, 'alert', {
      event: 'alert.dispatch_skipped',
      alertId: body.alert_id,
      alertName: body.alert_name,
      reason: 'filtered',
    }) ?? Promise.resolve());
    return jsonResponse({ received: true, dispatched: false, reason: 'filtered' });
  }

  // Build dedup key
  const slug = alertSlug(body.alert_name);
  const bucket = hourBucket();
  const dedupKey = `cx_alert:${slug}:${bucket}`;

  // KV dedup check
  const existing = await env.KV.get(dedupKey);
  if (existing !== null) {
    ctx.waitUntil(log(env, 3, 'alert', {
      event: 'alert.dispatch_skipped',
      alertId: body.alert_id,
      alertName: body.alert_name,
      reason: 'deduplicated',
      dedupKey,
    }) ?? Promise.resolve());
    return jsonResponse({ received: true, dispatched: false, reason: 'deduplicated' });
  }

  // Daily circuit breaker
  const today = todayDate();
  const countKey = `cx_dispatch_count:${today}`;
  const countStr = await env.KV.get(countKey);
  const currentCount = countStr ? parseInt(countStr, 10) : 0;
  if (currentCount >= DAILY_DISPATCH_LIMIT) {
    ctx.waitUntil(log(env, 3, 'alert', {
      event: 'alert.dispatch_skipped',
      alertId: body.alert_id,
      alertName: body.alert_name,
      reason: 'daily_limit',
      dailyCount: currentCount,
    }) ?? Promise.resolve());
    return jsonResponse({ received: true, dispatched: false, reason: 'daily_limit' });
  }

  // Sanitized dispatch payload -- never forward raw log/alert body text
  const dispatchPayload = {
    alert_id: body.alert_id,
    alert_name: body.alert_name,
    alert_action: body.alert_action,
    alert_url: body.alert_url || '',
    hit_count: String(body.hit_count ?? ''),
    application_name: body.application_name || 'wrl',
    subsystem_name: body.subsystem_name || '',
    event_severity: body.event_severity || '',
    timestamp: new Date().toISOString(),
    dedup_key: dedupKey,
  };

  // Mark dedup key and increment daily counter before dispatching.
  // KV writes are best-effort: failure here would allow a retry to re-dispatch,
  // which is acceptable -- the dedup window is advisory, not a hard guarantee.
  await Promise.all([
    env.KV.put(dedupKey, '1', { expirationTtl: 7200 }),
    env.KV.put(countKey, String(currentCount + 1), { expirationTtl: 86400 }),
  ]);

  // Fire-and-forget GitHub dispatch -- always return 200 to Coralogix
  ctx.waitUntil(
    dispatchToGitHub(env, dispatchPayload)
      .then(() => log(env, 3, 'alert', {
        event: 'alert.dispatch_sent',
        alertId: body.alert_id,
        alertName: body.alert_name,
        dedupKey,
      }) ?? Promise.resolve())
      .catch(err => log(env, 4, 'alert', {
        event: 'alert.dispatch_error',
        alertId: body.alert_id,
        alertName: body.alert_name,
        error: String(err?.message ?? '').slice(0, 256),
      }) ?? Promise.resolve()),
  );

  return jsonResponse({ received: true, dispatched: true });
}

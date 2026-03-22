/*
 * webhooks.js -- CRUD HTTP handlers for WRL outbound webhook registrations
 *
 * Endpoints:
 *   POST   /v1/webhooks                              -- register a webhook
 *   GET    /v1/webhooks                              -- list webhooks for tenant
 *   DELETE /v1/webhooks/:webhookId                   -- delete a webhook
 *   POST   /v1/webhooks/:webhookId/ping              -- send a test event
 *
 * Auth: all routes use verifyApiKey with 'capture' scope.
 *
 * Security invariants:
 *   - Secret is NEVER returned after the 201 creation response.
 *   - Full webhook URL is NEVER logged -- targetHost (hostname only) is used instead.
 *   - SSRF protection delegated to validateWebhookUrl() which wraps validateUrl().
 *   - Ping uses the same signing path as real delivery.
 *   - Cache-Control: private, no-store on 201 (contains secret).
 */ // tva

import { jsonResponse, problemResponse } from './responses.js';
import { verifyApiKey } from './auth.js';
import { validateUrl } from './url-validation.js';
import { createWebhook, getWebhook, listWebhooks, deleteWebhook, countWebhooks } from './db.js';
import { log } from './log.js';
import { signWebhookPayload, SIGNATURE_HEADER, TIMESTAMP_HEADER } from './webhook-signing.js';

const NAME_RE = /^[a-zA-Z0-9 _.:-]{1,128}$/;
const VALID_EVENTS = ['capture.complete', 'capture.failed'];
const ALLOWED_CREATE_FIELDS = new Set(['url', 'events', 'name']);
const WEBHOOK_CACHE = { 'Cache-Control': 'private, no-store' };

// ---------------------------------------------------------------------------
// URL validation wrapper
// ---------------------------------------------------------------------------

/**
 * Validates a webhook target URL.
 *
 * Thin wrapper around validateUrl() that additionally enforces HTTPS-only.
 * validateUrl() provides full SSRF protection (DNS resolution, private IP
 * blocklisting, double-encoding checks, credential rejection). This wrapper
 * adds the HTTPS-only constraint required for webhook targets without
 * restricting ports beyond that (YAGNI per margo+lucy advisory).
 *
 * Do NOT modify validateUrl() directly -- SSRF logic lives there.
 *
 * @param {string} rawUrl
 * @returns {Promise<{ ok: true, url: string, ip: string } | { ok: false, status: number, detail: string }>}
 */
export async function validateWebhookUrl(rawUrl) {
  const result = await validateUrl(rawUrl);
  if (!result.ok) return result;

  // HTTPS-only enforcement: validateUrl() allows http and https; webhooks require https.
  const parsed = new URL(result.url);
  if (parsed.protocol !== 'https:') {
    return { ok: false, status: 400, detail: "Webhook URL must use HTTPS" };
  }

  return result;
}

// ---------------------------------------------------------------------------
// POST /v1/webhooks -- create webhook registration
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match
 */
export async function handleCreateWebhook(request, env, ctx, _match) {
  const auth = await verifyApiKey(request, env, { requiredScope: 'capture' });
  if (!auth.ok) return auth.response;

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON');
  }

  // Reject unknown fields
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const unknown = Object.keys(body).filter(k => !ALLOWED_CREATE_FIELDS.has(k));
    if (unknown.length > 0) {
      return problemResponse(400, `Unknown field(s): ${unknown.map(f => `'${f}'`).join(', ')}. Allowed fields: url, events, name`);
    }
  }

  // Validate url
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'url')) {
    return problemResponse(400, "Field 'url' is required");
  }
  if (typeof body.url !== 'string') {
    return problemResponse(400, "Field 'url' must be a string");
  }
  const urlCheck = await validateWebhookUrl(body.url);
  if (!urlCheck.ok) {
    return problemResponse(urlCheck.status, urlCheck.detail);
  }

  // Validate events
  if (!Object.prototype.hasOwnProperty.call(body, 'events')) {
    return problemResponse(400, "Field 'events' is required");
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return problemResponse(400, "Field 'events' must be a non-empty array");
  }
  for (const evt of body.events) {
    if (!VALID_EVENTS.includes(evt)) {
      return problemResponse(400, `Field 'events' contains invalid value '${evt}'; must be one of: capture.complete, capture.failed`);
    }
  }

  // Validate name
  if (!Object.prototype.hasOwnProperty.call(body, 'name')) {
    return problemResponse(400, "Field 'name' is required");
  }
  if (typeof body.name !== 'string') {
    return problemResponse(400, "Field 'name' must be a string");
  }
  if (!NAME_RE.test(body.name)) {
    return problemResponse(400, "Field 'name' must be 1-128 characters using letters, digits, spaces, and _ . : -");
  }

  // Count check: max 5 webhooks per tenant
  const count = await countWebhooks(env.DB, auth.tenantId);
  if (count >= 5) {
    return problemResponse(409, `Tenant '${auth.tenantId}' has reached the maximum of 5 webhook registrations. Delete an existing webhook before creating a new one.`);
  }

  // Generate ID and secret
  const webhookId = 'whk_' + crypto.randomUUID().replace(/-/g, '');
  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const secretHex = Array.from(secretBytes, b => b.toString(16).padStart(2, '0')).join('');
  const secret = 'whsec_' + secretHex;

  const record = await createWebhook(env.DB, {
    id: webhookId,
    tenantId: auth.tenantId,
    url: urlCheck.url,
    name: body.name,
    secret,
    events: body.events,
  });

  const targetHost = new URL(urlCheck.url).hostname;

  ctx.waitUntil(log(env, 3, 'webhook', {
    event: 'webhook.create',
    webhookId,
    tenantId: auth.tenantId,
    targetHost,
    events: body.events,
    keyHashPrefix: auth.keyHashPrefix,
    authMethod: auth.authMethod,
    responseStatus: 201,
  }) ?? Promise.resolve());

  return jsonResponse({
    id: record.webhookId,
    url: record.url,
    events: record.events,
    name: record.name,
    secret: record.secret,
    createdAt: record.createdAt,
    warning: 'Store this secret now. It cannot be retrieved after this response.',
  }, 201, WEBHOOK_CACHE);
}

// ---------------------------------------------------------------------------
// GET /v1/webhooks -- list webhook registrations
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match
 */
export async function handleListWebhooks(request, env, ctx, _match) {
  const auth = await verifyApiKey(request, env, { requiredScope: 'capture' });
  if (!auth.ok) return auth.response;

  const records = await listWebhooks(env.DB, auth.tenantId);

  // Secret is never returned in list
  const data = records.map(r => ({
    id: r.webhookId,
    url: r.url,
    events: r.events,
    name: r.name,
    active: r.active,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  ctx.waitUntil(log(env, 3, 'webhook', {
    event: 'webhook.list',
    tenantId: auth.tenantId,
    count: data.length,
    keyHashPrefix: auth.keyHashPrefix,
    authMethod: auth.authMethod,
    responseStatus: 200,
  }) ?? Promise.resolve());

  return jsonResponse({ data });
}

// ---------------------------------------------------------------------------
// DELETE /v1/webhooks/:webhookId -- delete webhook registration
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} match  match[1] = webhookId (validated by route regex)
 */
export async function handleDeleteWebhook(request, env, ctx, match) {
  const auth = await verifyApiKey(request, env, { requiredScope: 'capture' });
  if (!auth.ok) return auth.response;

  const webhookId = match[1];

  const result = await deleteWebhook(env.DB, webhookId, auth.tenantId);

  if (!result) {
    // Same 404 for nonexistent AND another tenant's webhook -- no information disclosure
    ctx.waitUntil(log(env, 3, 'webhook', {
      event: 'webhook.delete',
      webhookId,
      tenantId: auth.tenantId,
      found: false,
      keyHashPrefix: auth.keyHashPrefix,
      authMethod: auth.authMethod,
      responseStatus: 404,
    }) ?? Promise.resolve());
    return problemResponse(404, `Webhook '${webhookId}' not found.`);
  }

  ctx.waitUntil(log(env, 3, 'webhook', {
    event: 'webhook.delete',
    webhookId,
    tenantId: auth.tenantId,
    found: true,
    keyHashPrefix: auth.keyHashPrefix,
    authMethod: auth.authMethod,
    responseStatus: 200,
  }) ?? Promise.resolve());

  return jsonResponse({ id: webhookId, deleted: true });
}

// ---------------------------------------------------------------------------
// POST /v1/webhooks/:webhookId/ping -- send a synchronous test event
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} match  match[1] = webhookId (validated by route regex)
 */
export async function handlePingWebhook(request, env, ctx, match) {
  const auth = await verifyApiKey(request, env, { requiredScope: 'capture' });
  if (!auth.ok) return auth.response;

  const webhookId = match[1];

  const webhook = await getWebhook(env.DB, webhookId, auth.tenantId, { includeSecret: true });
  if (!webhook) {
    return problemResponse(404, `Webhook '${webhookId}' not found.`);
  }

  const targetHost = new URL(webhook.url).hostname;
  const timestamp = Math.floor(Date.now() / 1000);
  const pingPayload = JSON.stringify({
    id: 'evt_00000000000000000000000000000000',
    type: 'ping',
    createdAt: new Date().toISOString(),
    data: { webhookId },
  });

  const signature = await signWebhookPayload(webhook.secret, timestamp, pingPayload);

  const start = Date.now();
  let httpStatus = null;
  let success = false;
  let detail = null;

  try {
    const resp = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WRL-Webhook/1.0',
        'X-WRL-Event': 'ping',
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: `t=${timestamp},v1=${signature}`,
      },
      body: pingPayload,
      signal: AbortSignal.timeout(5000),
    });
    httpStatus = resp.status;
    success = resp.ok;
  } catch (err) {
    detail = classifyPingError(err);
  }

  const latencyMs = Date.now() - start;

  ctx.waitUntil(log(env, 3, 'webhook', {
    event: 'webhook.ping',
    webhookId,
    tenantId: auth.tenantId,
    targetHost,
    httpStatus,
    durationMs: latencyMs,
    success,
    keyHashPrefix: auth.keyHashPrefix,
    authMethod: auth.authMethod,
    responseStatus: 200,
  }) ?? Promise.resolve());

  if (detail !== null) {
    return jsonResponse({ success: false, httpStatus: null, latencyMs, detail });
  }
  return jsonResponse({ success, httpStatus, latencyMs });
}

/**
 * Classify a network-level error from a ping attempt to a safe category string.
 * Does NOT expose raw error messages (network topology leak risk).
 *
 * @param {Error} err
 * @returns {string} category
 */
function classifyPingError(err) {
  const msg = String(err?.message ?? '');
  if (err?.name === 'TimeoutError' || msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo') || msg.includes('DNS')) return 'dns';
  if (msg.includes('certificate') || msg.includes('TLS') || msg.includes('SSL') || msg.includes('CERT')) return 'tls';
  if (msg.includes('ECONNREFUSED') || msg.includes('Connection refused')) return 'connection';
  if (msg.includes('ECONNRESET') || msg.includes('socket') || msg.includes('network')) return 'connection';
  return 'connection';
}

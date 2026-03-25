/*
 * admin.js -- Admin API endpoint handlers for API key management
 *
 * Endpoints:
 *   POST   /v1/admin/keys          -- create new API key
 *   GET    /v1/admin/keys          -- list API keys
 *   DELETE /v1/admin/keys/:keyHash -- revoke API key
 *
 * Auth: all routes use verifyAdminKey (infrastructure secret), NOT verifyApiKey.
 * Rate limit: ADMIN_RATE_LIMITER, 5 req/60s per IP.
 *
 * Security invariants:
 *   - Raw key is NEVER logged; only returned in the 201 response body.
 *   - keyHash in path is validated by route regex before reaching handler.
 *   - All responses set Cache-Control: private, no-store.
 *   - keyName is INVARIANT-safe: validated by NAME_RE at key creation.
 */ // tva

import { jsonResponse, problemResponse } from './responses.js';
import { hashApiKey } from './auth.js';
import { createApiKeyRecord, getApiKeyRecord, listApiKeyRecords, revokeApiKeyRecord, TENANT_ID_RE, getUsage, computePeriod, tenantExists } from './db.js';
import { log } from './log.js';
import { computeCip } from './ip-hash.js';
const NAME_RE = /^[a-zA-Z0-9 _.:-]{1,128}$/;
const VALID_SCOPES = ['capture', 'read', 'admin'];
const ALLOWED_CREATE_FIELDS = new Set(['tenantId', 'scopes', 'name']);

const ADMIN_CACHE = { 'Cache-Control': 'private, no-store' };

/**
 * Encode a Uint8Array to base64url without padding.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toBase64url(bytes) {
  const b64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * POST /v1/admin/keys -- create a new API key
 */
export async function handleAdminCreateKey(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Content-Type check
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  // Parse body
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
      return problemResponse(400, `Unknown field(s): ${unknown.map(f => `'${f}'`).join(', ')}. Allowed fields: tenantId, scopes, name`);
    }
  }

  // Validate tenantId
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'tenantId')) {
    return problemResponse(400, "Field 'tenantId' is required");
  }
  if (typeof body.tenantId !== 'string') {
    return problemResponse(400, "Field 'tenantId' must be a string");
  }
  if (!TENANT_ID_RE.test(body.tenantId)) {
    return problemResponse(400, "Field 'tenantId' must match /^[a-z0-9_-]{1,64}$/");
  }

  // Validate scopes
  if (!Object.prototype.hasOwnProperty.call(body, 'scopes')) {
    return problemResponse(400, "Field 'scopes' is required");
  }
  if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
    return problemResponse(400, "Field 'scopes' must be a non-empty array");
  }
  for (const scope of body.scopes) {
    if (!VALID_SCOPES.includes(scope)) {
      return problemResponse(400, `Field 'scopes' contains invalid value '${scope}'; must be one of: capture, read, admin`);
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

  // Generate key
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawKey = 'wrl_live_' + toBase64url(randomBytes);

  // Hash key
  const keyHash = await hashApiKey(rawKey);

  // Build record
  const createdAt = new Date().toISOString();
  const record = {
    tenantId: body.tenantId,
    scopes: body.scopes,
    name: body.name,
    createdAt,
    createdBy: 'admin',
    revoked: false,
    revokedAt: null,
  };

  // Store in KV
  const result = await createApiKeyRecord(env.DB, keyHash, record);
  if (!result.created) {
    // Hash collision is astronomically rare; treat as internal error
    ctx.waitUntil(log(env, 5, 'admin', { event: 'admin.key_create_fail', reason: result.reason, authMethod: 'admin_key', responseStatus: 500, cip }) ?? Promise.resolve());
    return problemResponse(500, 'Key generation failed. Please retry.');
  }

  // Log (never log rawKey)
  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.key_create',
    keyHashPrefix: keyHash.slice(0, 8),
    tenantId: body.tenantId,
    scopes: body.scopes,
    name: body.name,
    authMethod: 'admin_key',
    responseStatus: 201,
    cip,
  }) ?? Promise.resolve());

  return jsonResponse({
    key: rawKey,
    keyHash,
    tenantId: body.tenantId,
    scopes: body.scopes,
    name: body.name,
    createdAt,
    warning: 'Store this key now. It cannot be retrieved after this response.',
  }, 201, ADMIN_CACHE);
}

/**
 * GET /v1/admin/keys -- list API keys
 */
export async function handleAdminListKeys(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  const params = new URL(request.url).searchParams;
  const tenantFilter = params.get('tenant') || undefined;
  const includeRevoked = params.get('include') === 'revoked';

  const records = await listApiKeyRecords(env.DB, { tenantId: tenantFilter, includeRevoked });

  // Project to API response shape
  const data = records.map(r => {
    const entry = {
      keyHash: r.keyHash,
      tenantId: r.tenantId,
      scopes: r.scopes,
      name: r.name,
      createdAt: r.createdAt,
      createdBy: r.createdBy,
    };
    if (r.revoked) {
      entry.revoked = true;
      entry.revokedAt = r.revokedAt;
    }
    return entry;
  });

  // INVARIANT: tenantFilter is raw query input -- validate before logging
  const safeTenantFilter = (tenantFilter && TENANT_ID_RE.test(tenantFilter)) ? tenantFilter : null;

  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.key_list',
    count: data.length,
    tenantFilter: safeTenantFilter,
    includeRevoked,
    authMethod: 'admin_key',
    responseStatus: 200,
    cip,
  }) ?? Promise.resolve());

  return jsonResponse({ data }, 200, ADMIN_CACHE);
}

/**
 * DELETE /v1/admin/keys/:keyHash -- revoke API key
 * match[1] is the keyHash captured by the route regex (64 hex chars)
 */
export async function handleAdminRevokeKey(request, env, ctx, match) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  const keyHash = match[1];

  // TODO: Self-revocation guard (#42). When admin auth moves from ADMIN_KEY
  // (env var) to KV-stored admin-scoped keys, prevent a caller from revoking
  // their own keyHash. Requires the auth result to include the caller's
  // keyHash, which it currently does not (ADMIN_KEY has no hash).

  // Pre-flight read
  const record = await getApiKeyRecord(env.DB, keyHash);

  if (!record) {
    ctx.waitUntil(log(env, 4, 'admin', {
      event: 'admin.key_revoke_fail',
      keyHashPrefix: keyHash.slice(0, 8),
      tenantId: null,
      reason: 'not_found',
      authMethod: 'admin_key',
      responseStatus: 404,
      cip,
    }) ?? Promise.resolve());
    return problemResponse(404, 'API key not found.', ADMIN_CACHE);
  }

  // Idempotent: already revoked -- return 200 without writing again
  if (record.revoked === true) {
    ctx.waitUntil(log(env, 3, 'admin', {
      event: 'admin.key_revoke',
      keyHashPrefix: keyHash.slice(0, 8),
      tenantId: record.tenantId,
      keyName: record.name,
      scopes: record.scopes,
      idempotent: true,
      authMethod: 'admin_key',
      responseStatus: 200,
      cip,
    }) ?? Promise.resolve());
    return jsonResponse({
      keyHash,
      tenantId: record.tenantId,
      scopes: record.scopes,
      name: record.name,
      createdAt: record.createdAt,
      revoked: true,
      revokedAt: record.revokedAt,
    }, 200, ADMIN_CACHE);
  }

  // Last-admin-key guard: only applies when the target key carries the 'admin' scope
  if (record.scopes.includes('admin')) {
    // KNOWN LIMITATION: This check is not atomic with the subsequent
    // revocation. Concurrent requests may both pass the check. Acceptable
    // because ADMIN_KEY (env var) prevents lockout. Revisit when admin
    // auth moves to per-tenant KV keys.
    const activeKeys = await listApiKeyRecords(env.DB, { tenantId: record.tenantId, includeRevoked: false });
    const otherAdminCount = activeKeys.filter(r => r.scopes.includes('admin') && r.keyHash !== keyHash).length;
    if (otherAdminCount === 0) {
      ctx.waitUntil(log(env, 3, 'admin', {
        event: 'admin.key_revoke_blocked',
        keyHashPrefix: keyHash.slice(0, 8),
        tenantId: record.tenantId,
        keyName: record.name,
        authMethod: 'admin_key',
        responseStatus: 409,
        cip,
      }) ?? Promise.resolve());
      return problemResponse(409, `Cannot revoke the last admin-scoped key for tenant '${record.tenantId}'. Create a replacement key first.`, ADMIN_CACHE);
    }
  }

  const result = await revokeApiKeyRecord(env.DB, keyHash);

  // Defensive: concurrent DELETE could remove the record between pre-flight read and here
  if (!result.revoked) {
    return problemResponse(404, 'API key not found.', ADMIN_CACHE);
  }

  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.key_revoke',
    keyHashPrefix: keyHash.slice(0, 8),
    tenantId: result.record.tenantId,
    keyName: result.record.name,
    scopes: result.record.scopes,
    idempotent: false,
    authMethod: 'admin_key',
    responseStatus: 200,
    cip,
  }) ?? Promise.resolve());

  return jsonResponse({
    keyHash,
    tenantId: result.record.tenantId,
    scopes: result.record.scopes,
    name: result.record.name,
    createdAt: result.record.createdAt,
    revoked: true,
    revokedAt: result.record.revokedAt,
  }, 200, ADMIN_CACHE);
}

/**
 * GET /v1/admin/usage -- query per-tenant usage counters
 * Query params:
 *   tenant (required) -- tenant ID to query
 *   period (optional) -- billing period in YYYY-MM format (defaults to current)
 */
export async function handleAdminGetUsage(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  const params = new URL(request.url).searchParams;
  const tenantParam = params.get('tenant');
  const periodParam = params.get('period');

  // Validate tenant (required)
  if (!tenantParam) {
    return problemResponse(400, "Query parameter 'tenant' is required");
  }
  if (!TENANT_ID_RE.test(tenantParam)) {
    return problemResponse(400, "Query parameter 'tenant' must match /^[a-z0-9_-]{1,64}$/");
  }

  // Validate period format (optional, defaults to current)
  let period;
  if (periodParam) {
    if (!/^\d{4}-\d{2}$/.test(periodParam)) {
      return problemResponse(400, "Query parameter 'period' must be in YYYY-MM format");
    }
    period = periodParam;
  } else {
    period = computePeriod();
  }

  // Verify tenant exists via centralised DAL (not raw env.DB.prepare)
  const exists = await tenantExists(env.DB, tenantParam);

  if (!exists) {
    ctx.waitUntil(log(env, 4, 'admin', {
      event: 'admin.usage_query_fail',
      tenantId: tenantParam,
      reason: 'tenant_not_found',
      authMethod: 'admin_key',
      responseStatus: 404,
      cip,
    }) ?? Promise.resolve());
    return problemResponse(404, `Tenant '${tenantParam}' not found`, ADMIN_CACHE);
  }

  const usage = await getUsage(env.DB, tenantParam, period);

  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.usage_query',
    tenantId: tenantParam,
    period,
    authMethod: 'admin_key',
    responseStatus: 200,
    cip,
  }) ?? Promise.resolve());

  return jsonResponse({
    tenantId: usage.tenantId,
    period: usage.period,
    captureCount: usage.captureCount,
    storageBytes: usage.storageBytes,
    apiCallCount: usage.apiCallCount,
    updatedAt: usage.updatedAt,
  }, 200, ADMIN_CACHE);
}

/**
 * POST /v1/admin/cache/purge -- purge CDN cache by URL
 *
 * Body: { "targets": ["signing-keys"] }                    -- purge both signing key endpoints
 * or:   { "targets": ["capture:cap_abc123def456..."] }     -- purge a specific capture's verify URLs
 * or:   { "targets": ["all"] }                             -- purge everything (nuclear)
 *
 * Uses Cloudflare zone-level purge-by-URL (works on all plans).
 * Requires CLOUDFLARE_ZONE_ID and CLOUDFLARE_CACHE_PURGE_TOKEN env vars.
 */
const TARGET_RE = /^(signing-keys|all|capture:cap_[a-f0-9]{32})$/;

/** Derive the verify origin from the admin request host. */
function resolveVerifyOrigin(request) {
  const host = request.headers.get('Host') || '';
  if (host.startsWith('staging.')) return 'https://verify-staging.webresourceledger.com';
  if (host.startsWith('api.')) return 'https://verify.webresourceledger.com';
  // Fallback: same origin (tests, local dev)
  return new URL(request.url).origin;
}

/** Expand semantic targets into a CF purge API body. */
function buildPurgePayload(targets, verifyOrigin) {
  for (const t of targets) {
    if (t === 'all') return { purge_everything: true };
  }
  const files = [];
  for (const t of targets) {
    if (t === 'signing-keys') {
      files.push(`${verifyOrigin}/.well-known/signing-key`);
      files.push(`${verifyOrigin}/.well-known/signing-keys`);
    } else if (t.startsWith('capture:')) {
      const captureId = t.slice('capture:'.length);
      files.push(`${verifyOrigin}/v1/verify/${captureId}?_fmt=json`);
      files.push(`${verifyOrigin}/v1/verify/${captureId}?_fmt=html`);
    }
  }
  return { files };
}

export async function handleAdminCachePurge(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Invalid JSON body');
  }

  if (!body.targets || !Array.isArray(body.targets) || body.targets.length === 0) {
    return problemResponse(400, 'Request body must include a non-empty "targets" array');
  }

  if (body.targets.length > 30) {
    return problemResponse(400, 'Maximum 30 targets per purge request');
  }

  const invalid = body.targets.filter(t => typeof t !== 'string' || !TARGET_RE.test(t));
  if (invalid.length > 0) {
    return problemResponse(400, `Invalid purge targets: ${invalid.join(', ')}. Allowed: signing-keys, capture:cap_{id}, all`);
  }

  if (!env.CLOUDFLARE_ZONE_ID || !env.CLOUDFLARE_CACHE_PURGE_TOKEN) {
    ctx.waitUntil(log(env, 5, 'admin', { event: 'admin.cache_purge', error: 'missing_config', cip }) ?? Promise.resolve());
    return problemResponse(503, 'Cache purge is not configured. Set CLOUDFLARE_ZONE_ID and CLOUDFLARE_CACHE_PURGE_TOKEN.');
  }

  const verifyOrigin = resolveVerifyOrigin(request);
  const purgePayload = buildPurgePayload(body.targets, verifyOrigin);

  const purgeResp = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_CACHE_PURGE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(purgePayload),
    },
  );

  const purgeBody = await purgeResp.json().catch(() => ({}));

  if (!purgeResp.ok || !purgeBody.success) {
    ctx.waitUntil(log(env, 5, 'admin', {
      event: 'admin.cache_purge',
      status: 'error',
      httpStatus: purgeResp.status,
      cfErrors: purgeBody.errors,
      targets: body.targets,
      cip,
    }) ?? Promise.resolve());
    return problemResponse(502, 'Cache purge failed. Check Cloudflare API credentials and zone ID.');
  }

  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.cache_purge',
    status: 'success',
    targets: body.targets,
    purgedUrls: purgePayload.files || null,
    purgeEverything: !!purgePayload.purge_everything,
    purgeId: purgeBody.result?.id,
    cip,
  }) ?? Promise.resolve());

  return jsonResponse({
    purged: true,
    targets: body.targets,
    urls: purgePayload.files || null,
    purgeId: purgeBody.result?.id,
  }, 200, ADMIN_CACHE);
}

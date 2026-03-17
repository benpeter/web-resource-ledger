/*
 * admin.js -- API key management handlers for the Web Resource Ledger Worker
 *
 * Endpoints:
 *   POST   /v1/admin/keys           -- create a new API key (handleAdminCreateKey)
 *   GET    /v1/admin/keys           -- list API keys for a tenant (handleAdminListKeys)
 *   DELETE /v1/admin/keys/:keyHash  -- revoke an API key (handleAdminRevokeKey)
 *
 * Auth: All endpoints require the 'admin' scope.
 * Rate limit: ADMIN_RATE_LIMITER applied before auth (prevents auth oracle abuse).
 */ // tva

import { problemResponse, jsonResponse } from './responses.js';
import { verifyApiKey, requireScope, hashKey, TENANT_ID_RE } from './auth.js';
import { log } from './log.js';
import { computeCip } from './ip-hash.js';

const VALID_SCOPES = ['capture', 'read', 'admin'];
const NAME_RE = /^[a-zA-Z0-9 _.:-]{1,128}$/;

function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `wrl_live_${b64}`;
}

/**
 * POST /v1/admin/keys
 * Creates a new API key for a tenant.
 */
export async function handleAdminCreateKey(request, env, ctx, match) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Rate limit BEFORE auth (prevents auth oracle / brute-force)
  if (env.ADMIN_RATE_LIMITER) {
    const { success } = await env.ADMIN_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'admin', cip }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  // Step 2: Content-Type check
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  // Step 3: Auth
  const auth = await verifyApiKey(request, env);
  if (!auth.ok) {
    ctx.waitUntil(log(env, 5, 'security', {
      event: 'security.auth_fail',
      status: auth.response.status,
      reason: auth.reason,
      ...(auth.keyName ? { keyName: auth.keyName } : {}),
      cip,
    }) ?? Promise.resolve());
    return auth.response;
  }

  const scopeFail = requireScope(auth, 'admin');
  if (scopeFail) {
    ctx.waitUntil(log(env, 5, 'security', {
      event: 'security.auth_fail',
      reason: 'scope_violation',
      requiredScope: 'admin',
      grantedScopes: auth.scopes,
      tenantId: auth.tenantId,
      keyName: auth.keyName,
      cip,
    }) ?? Promise.resolve());
    return scopeFail;
  }

  // Step 4: Parse JSON body
  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON');
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return problemResponse(400, 'Request body must be a JSON object');
  }

  // Step 5: Reject unknown fields
  const ALLOWED_FIELDS = new Set(['name', 'scopes', 'tenantId']);
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) {
      return problemResponse(400, `Unknown field '${key}'. Allowed fields: name, scopes, tenantId`);
    }
  }

  // Validate name
  if (!Object.prototype.hasOwnProperty.call(body, 'name') || body.name === undefined || body.name === null) {
    return problemResponse(400, "Field 'name' is required.");
  }
  if (typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 128 || !NAME_RE.test(body.name)) {
    return problemResponse(400, "Field 'name' must be a string of 1-128 characters matching pattern [a-zA-Z0-9 _.:-].");
  }
  const name = body.name;

  // Validate scopes
  if (!Object.prototype.hasOwnProperty.call(body, 'scopes') || body.scopes === undefined || body.scopes === null) {
    return problemResponse(400, "Field 'scopes' is required.");
  }
  if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
    return problemResponse(400, "Field 'scopes' must be a non-empty array.");
  }
  for (const scope of body.scopes) {
    if (!VALID_SCOPES.includes(scope)) {
      return problemResponse(400, `Unknown scope '${scope}'. Valid scopes: capture, read, admin`);
    }
  }
  const scopes = body.scopes;

  // Validate tenantId
  let tenantId;
  if (auth.authMethod === 'env-admin') {
    if (!Object.prototype.hasOwnProperty.call(body, 'tenantId') || body.tenantId === undefined || body.tenantId === null) {
      return problemResponse(400, "Field 'tenantId' is required.");
    }
    if (!TENANT_ID_RE.test(body.tenantId)) {
      return problemResponse(400, "Field 'tenantId' must match pattern [a-z0-9_-]{1,64}.");
    }
    tenantId = body.tenantId;
  } else {
    tenantId = auth.tenantId;
    if (Object.prototype.hasOwnProperty.call(body, 'tenantId') && body.tenantId !== tenantId) {
      return problemResponse(403, 'Cannot create keys for another tenant');
    }
  }

  // Step 6: Generate key, compute hash, write to KV
  const rawKey = generateApiKey();
  const keyHash = await hashKey(rawKey);
  const createdAt = new Date().toISOString();
  const createdBy = auth.authMethod === 'env-admin' ? 'ADMIN_KEY' : auth.keyName;

  await env.KV.put(`apikey:${keyHash}`, JSON.stringify({
    tenantId,
    scopes,
    name,
    createdAt,
    createdBy,
    revoked: false,
  }));

  // Update tenant key index
  let tenantKeys = [];
  try {
    const existing = await env.KV.get(`tenant-keys:${tenantId}`, 'json');
    if (Array.isArray(existing)) tenantKeys = existing;
  } catch {
    // Start fresh if read fails -- key will still be written
  }
  tenantKeys.push(keyHash);
  await env.KV.put(`tenant-keys:${tenantId}`, JSON.stringify(tenantKeys));

  // Step 7: Log
  ctx.waitUntil(log(env, 4, 'admin', {
    event: 'admin.key_create',
    tenantId,
    keyName: name,
    scopes,
    keyHash: keyHash.slice(0, 16),
    cip,
  }) ?? Promise.resolve());

  // Step 8: Return 201
  return jsonResponse({ key: rawKey, keyHash, tenantId, scopes, name, createdAt }, 201, {
    'Cache-Control': 'private, no-store',
  });
}

/**
 * GET /v1/admin/keys
 * Lists API keys for a tenant.
 */
export async function handleAdminListKeys(request, env, ctx, match) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Rate limit
  if (env.ADMIN_RATE_LIMITER) {
    const { success } = await env.ADMIN_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'admin', cip }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  // Step 2: Auth
  const auth = await verifyApiKey(request, env);
  if (!auth.ok) {
    ctx.waitUntil(log(env, 5, 'security', {
      event: 'security.auth_fail',
      status: auth.response.status,
      reason: auth.reason,
      ...(auth.keyName ? { keyName: auth.keyName } : {}),
      cip,
    }) ?? Promise.resolve());
    return auth.response;
  }

  const scopeFail = requireScope(auth, 'admin');
  if (scopeFail) {
    ctx.waitUntil(log(env, 5, 'security', {
      event: 'security.auth_fail',
      reason: 'scope_violation',
      requiredScope: 'admin',
      grantedScopes: auth.scopes,
      tenantId: auth.tenantId,
      keyName: auth.keyName,
      cip,
    }) ?? Promise.resolve());
    return scopeFail;
  }

  // Step 3: Determine tenant
  let tenantId;
  if (auth.authMethod === 'env-admin') {
    tenantId = new URL(request.url).searchParams.get('tenantId');
    if (!tenantId) {
      return problemResponse(400, "Query parameter 'tenantId' is required");
    }
    if (!TENANT_ID_RE.test(tenantId)) {
      return problemResponse(400, "Query parameter 'tenantId' must match pattern [a-z0-9_-]{1,64}.");
    }
  } else {
    // IDOR prevention: ignore query param for tenant-scoped keys
    tenantId = auth.tenantId;
  }

  // Step 4: Read tenant key index
  let hashes = [];
  try {
    const existing = await env.KV.get(`tenant-keys:${tenantId}`, 'json');
    if (Array.isArray(existing)) hashes = existing;
  } catch {
    // Return empty list on read error
  }

  // Step 5: Fetch each key record
  const entries = [];
  for (const hash of hashes) {
    try {
      const record = await env.KV.get(`apikey:${hash}`, 'json');
      if (record !== null) {
        entries.push({ keyHash: hash, ...record });
      }
    } catch {
      // Skip records that fail to read
    }
  }

  // Step 6: Log
  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.key_list',
    tenantId,
    keyCount: entries.length,
    cip,
  }) ?? Promise.resolve());

  // Step 7: Return 200 -- never include raw keys
  return jsonResponse({ data: entries }, 200, {
    'Cache-Control': 'private, no-store',
  });
}

/**
 * DELETE /v1/admin/keys/:keyHash
 * Revokes an API key. match[1] is the 64-char hex keyHash.
 */
export async function handleAdminRevokeKey(request, env, ctx, match) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Rate limit
  if (env.ADMIN_RATE_LIMITER) {
    const { success } = await env.ADMIN_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'admin', cip }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  // Step 2: Auth
  const auth = await verifyApiKey(request, env);
  if (!auth.ok) {
    ctx.waitUntil(log(env, 5, 'security', {
      event: 'security.auth_fail',
      status: auth.response.status,
      reason: auth.reason,
      ...(auth.keyName ? { keyName: auth.keyName } : {}),
      cip,
    }) ?? Promise.resolve());
    return auth.response;
  }

  const scopeFail = requireScope(auth, 'admin');
  if (scopeFail) {
    ctx.waitUntil(log(env, 5, 'security', {
      event: 'security.auth_fail',
      reason: 'scope_violation',
      requiredScope: 'admin',
      grantedScopes: auth.scopes,
      tenantId: auth.tenantId,
      keyName: auth.keyName,
      cip,
    }) ?? Promise.resolve());
    return scopeFail;
  }

  // Step 3: Extract keyHash from URL
  const keyHash = match[1];

  // Step 4: Self-revocation guard
  if (keyHash === auth.keyHash) {
    return problemResponse(409, 'Cannot revoke the key used to authenticate this request');
  }

  // Step 5: Read the key record
  let record;
  try {
    record = await env.KV.get(`apikey:${keyHash}`, 'json');
  } catch (err) {
    return problemResponse(500, 'Could not read API key record');
  }

  if (record === null) {
    return problemResponse(404, 'API key not found');
  }

  // Step 6: Tenant scope enforcement (return 404 to prevent enumeration)
  if (auth.authMethod !== 'env-admin' && record.tenantId !== auth.tenantId) {
    return problemResponse(404, 'API key not found');
  }

  // Step 7: Already revoked -- idempotent success
  if (record.revoked === true) {
    return jsonResponse({ keyHash, name: record.name, revoked: true, revokedAt: record.revokedAt }, 200, {
      'Cache-Control': 'private, no-store',
    });
  }

  // Step 8: Last-admin-key guard
  if (record.scopes && record.scopes.includes('admin')) {
    let hashes = [];
    try {
      const existing = await env.KV.get(`tenant-keys:${record.tenantId}`, 'json');
      if (Array.isArray(existing)) hashes = existing;
    } catch {
      // Proceed -- guard is best-effort if index is unreadable
    }

    let activeAdminCount = 0;
    for (const h of hashes) {
      if (h === keyHash) continue; // skip the key being revoked
      try {
        const r = await env.KV.get(`apikey:${h}`, 'json');
        if (r && !r.revoked && r.scopes && r.scopes.includes('admin')) {
          activeAdminCount++;
        }
      } catch {
        // Skip unreadable records
      }
    }

    if (activeAdminCount === 0) {
      return problemResponse(409, 'Cannot revoke the last admin key for this tenant');
    }
  }

  // Step 9: Write revocation
  const revokedAt = new Date().toISOString();
  const revokedBy = auth.authMethod === 'env-admin' ? 'ADMIN_KEY' : auth.keyName;
  await env.KV.put(`apikey:${keyHash}`, JSON.stringify({
    ...record,
    revoked: true,
    revokedAt,
    revokedBy,
  }));

  // Step 10: Log
  ctx.waitUntil(log(env, 4, 'admin', {
    event: 'admin.key_revoke',
    keyHash: keyHash.slice(0, 16),
    tenantId: record.tenantId,
    keyName: record.name,
    cip,
  }) ?? Promise.resolve());

  // Step 11: Return 200
  return jsonResponse({ keyHash, name: record.name, revoked: true, revokedAt }, 200, {
    'Cache-Control': 'private, no-store',
  });
}

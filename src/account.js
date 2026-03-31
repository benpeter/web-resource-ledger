/*
 * account.js -- Self-serve account API handlers for API key management
 *
 * Endpoints:
 *   GET    /v1/account/keys          -- list API keys for the authenticated tenant
 *   POST   /v1/account/keys          -- create a new API key (max 5 per tenant)
 *   DELETE /v1/account/keys/:keyHash -- revoke an API key
 *   POST   /v1/account/tos           -- record ToS acceptance
 *
 * Auth: all routes require a valid session cookie (__Host-wrl_session).
 * The router verifies the session and attaches it to env._session before
 * calling these handlers. Handlers read tenantId from env._session.tenantId.
 *
 * Security invariants:
 *   - Raw key is NEVER logged; only returned in the 201 response body (once).
 *   - tenantId is ALWAYS from env._session -- never from the request body.
 *   - 'admin' scope is forbidden in self-serve key creation (403).
 *   - Cross-tenant access is silently 404 (not 403) to avoid oracle.
 *   - Last-key guard prevents tenants from locking themselves out.
 *   - All responses set Cache-Control: private, no-store.
 *   - CSRF header check on POST/DELETE (defense in depth -- router also checks).
 *   - keyName validated by NAME_RE at creation time (invariant-safe for logging).
 */ // tva

import { jsonResponse, problemResponse } from './responses.js';
import { hashApiKey } from './auth.js';
import { createApiKeyRecord, getApiKeyRecord, listApiKeyRecords, revokeApiKeyRecord, acceptTos, computePeriod, getEidasQualified, setEidasQualified } from './db.js';
import { log } from './log.js';
import { computeCip } from './ip-hash.js';
import { checkQuota, getEffectiveQuota, computeQuotaReset } from './quotas.js';
import { calculateCharges, INVOICE_THRESHOLD_EUR } from './pricing.js';

const NAME_RE = /^[a-zA-Z0-9 _.:-]{1,128}$/;

// Scopes a self-serve user may request. 'admin' is explicitly excluded.
const ALLOWED_SELF_SERVE_SCOPES = ['capture', 'read'];
const MAX_KEYS_PER_TENANT = 5;

const ACCOUNT_CACHE = { 'Cache-Control': 'private, no-store' };

/**
 * Encode a Uint8Array to base64url without padding.
 * Mirrors the same helper in admin.js and oauth.js.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toBase64url(bytes) {
  const b64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * CSRF check shared by all mutating handlers (POST, DELETE).
 * Returns a 403 Response if the header is absent, otherwise null.
 *
 * The router also checks this, but defense in depth means handlers enforce
 * it independently so they remain safe if routing logic changes.
 *
 * @param {Request} request
 * @returns {Response|null}
 */
function checkCsrf(request) {
  if (!request.headers.has('X-WRL-CSRF')) {
    return problemResponse(403, 'X-WRL-CSRF header is required', ACCOUNT_CACHE);
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /v1/account/keys
// ---------------------------------------------------------------------------

/**
 * List API keys for the authenticated tenant.
 * Returns only active (non-revoked) keys with masked fields (no raw key).
 *
 * @param {Request} request
 * @param {object} env  env._session is set by the router (verified session)
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match  unused (no capture groups on this route)
 * @returns {Promise<Response>}
 */
export async function handleAccountListKeys(request, env, ctx, _match) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  const { tenantId } = env._session;

  const records = await listApiKeyRecords(env.DB, { tenantId, includeRevoked: false });

  const data = records.map(r => ({
    keyHash: r.keyHash,
    name: r.name,
    scopes: r.scopes,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
  }));

  ctx.waitUntil(log(env, 3, 'oauth', {
    event: 'oauth.key_list',
    cip,
    tenantId,
    count: data.length,
    authMethod: 'session',
    responseStatus: 200,
  }) ?? Promise.resolve());

  return jsonResponse({ data }, 200, ACCOUNT_CACHE);
}

// ---------------------------------------------------------------------------
// POST /v1/account/keys
// ---------------------------------------------------------------------------

/**
 * Create a new API key for the authenticated tenant.
 *
 * Rules:
 *   - Allowed scopes: 'capture', 'read', or both. 'admin' is forbidden (403).
 *   - Max 5 active keys per tenant (409 if at limit).
 *   - Raw key returned once in 201 response, never stored or logged.
 *
 * @param {Request} request
 * @param {object} env  env._session is set by the router
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handleAccountCreateKey(request, env, ctx, _match) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // CSRF defense in depth
  const csrfError = checkCsrf(request);
  if (csrfError) return csrfError;

  // Content-Type check
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json', ACCOUNT_CACHE);
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON', ACCOUNT_CACHE);
  }

  // Reject unknown fields
  const ALLOWED_FIELDS = new Set(['name', 'scopes']);
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const unknown = Object.keys(body).filter(k => !ALLOWED_FIELDS.has(k));
    if (unknown.length > 0) {
      return problemResponse(400, `Unknown field(s): ${unknown.map(f => `'${f}'`).join(', ')}. Allowed fields: name, scopes`, ACCOUNT_CACHE);
    }
  }

  // Validate name
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'name')) {
    return problemResponse(400, "Field 'name' is required", ACCOUNT_CACHE);
  }
  if (typeof body.name !== 'string') {
    return problemResponse(400, "Field 'name' must be a string", ACCOUNT_CACHE);
  }
  if (!NAME_RE.test(body.name)) {
    return problemResponse(400, "Field 'name' must be 1-128 characters using letters, digits, spaces, and _ . : -", ACCOUNT_CACHE);
  }

  // Validate scopes
  if (!Object.prototype.hasOwnProperty.call(body, 'scopes')) {
    return problemResponse(400, "Field 'scopes' is required", ACCOUNT_CACHE);
  }
  if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
    return problemResponse(400, "Field 'scopes' must be a non-empty array", ACCOUNT_CACHE);
  }

  // 'admin' scope is forbidden in self-serve key creation
  if (body.scopes.includes('admin')) {
    return problemResponse(403, "Scope 'admin' cannot be assigned via the self-serve API", ACCOUNT_CACHE);
  }

  for (const scope of body.scopes) {
    if (!ALLOWED_SELF_SERVE_SCOPES.includes(scope)) {
      return problemResponse(400, `Field 'scopes' contains invalid value '${scope}'; must be one of: capture, read`, ACCOUNT_CACHE);
    }
  }

  const { tenantId, githubId } = env._session;

  // Key count guard: list active keys and compare against max
  const existing = await listApiKeyRecords(env.DB, { tenantId, includeRevoked: false });
  if (existing.length >= MAX_KEYS_PER_TENANT) {
    ctx.waitUntil(log(env, 4, 'oauth', {
      event: 'oauth.key_limit_reached',
      cip,
      tenantId,
      count: existing.length,
      limit: MAX_KEYS_PER_TENANT,
      authMethod: 'session',
      responseStatus: 409,
    }) ?? Promise.resolve());
    return problemResponse(409, `API key limit reached. A tenant may have at most ${MAX_KEYS_PER_TENANT} active keys. Revoke an existing key before creating a new one.`, ACCOUNT_CACHE);
  }

  // Generate key (same pattern as admin.js and oauth.js)
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawKey = 'wrl_live_' + toBase64url(randomBytes);

  // Hash key (SHA-256 hex)
  const keyHash = await hashApiKey(rawKey);

  // Build record
  const createdAt = new Date().toISOString();
  const record = {
    tenantId,
    scopes: body.scopes,
    name: body.name,
    createdAt,
    createdBy: `github:${githubId}`,
    revoked: false,
    revokedAt: null,
  };

  // Store in D1
  const result = await createApiKeyRecord(env.DB, keyHash, record);
  if (!result.created) {
    // Hash collision is astronomically rare; treat as internal error
    ctx.waitUntil(log(env, 5, 'oauth', {
      event: 'oauth.key_create_fail',
      cip,
      tenantId,
      reason: result.reason,
      authMethod: 'session',
      responseStatus: 500,
    }) ?? Promise.resolve());
    return problemResponse(500, 'Key generation failed. Please retry.', ACCOUNT_CACHE);
  }

  // Log (never log rawKey)
  ctx.waitUntil(log(env, 3, 'oauth', {
    event: 'oauth.key_create',
    cip,
    tenantId,
    keyHashPrefix: keyHash.slice(0, 8),
    scopes: body.scopes,
    name: body.name,
    authMethod: 'session',
    responseStatus: 201,
  }) ?? Promise.resolve());

  return jsonResponse({
    key: rawKey,
    keyHash,
    tenantId,
    scopes: body.scopes,
    name: body.name,
    createdAt,
    warning: 'Store this key now. It cannot be retrieved after this response.',
  }, 201, ACCOUNT_CACHE);
}

// ---------------------------------------------------------------------------
// DELETE /v1/account/keys/:keyHash
// ---------------------------------------------------------------------------

/**
 * Revoke an API key belonging to the authenticated tenant.
 *
 * Returns 404 (not 403) when the key does not exist OR belongs to a different
 * tenant -- avoids leaking which keys exist for other tenants.
 *
 * Prevents revoking the tenant's only remaining active key (409).
 *
 * @param {Request} request
 * @param {object} env  env._session is set by the router
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} match  match[1] is the keyHash (64 hex chars)
 * @returns {Promise<Response>}
 */
export async function handleAccountRevokeKey(request, env, ctx, match) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // CSRF defense in depth
  const csrfError = checkCsrf(request);
  if (csrfError) return csrfError;

  const keyHash = match[1];
  const { tenantId } = env._session;

  // Pre-flight read: verify key exists and belongs to this tenant
  const record = await getApiKeyRecord(env.DB, keyHash);

  if (!record || record.tenantId !== tenantId) {
    ctx.waitUntil(log(env, 4, 'oauth', {
      event: 'oauth.key_revoke_fail',
      cip,
      tenantId,
      keyHashPrefix: keyHash.slice(0, 8),
      reason: !record ? 'not_found' : 'tenant_mismatch',
      authMethod: 'session',
      responseStatus: 404,
    }) ?? Promise.resolve());
    return problemResponse(404, 'API key not found.', ACCOUNT_CACHE);
  }

  // Idempotent: already revoked -- return 200 without writing again
  if (record.revoked === true) {
    ctx.waitUntil(log(env, 3, 'oauth', {
      event: 'oauth.key_revoke',
      cip,
      tenantId,
      keyHashPrefix: keyHash.slice(0, 8),
      keyName: record.name,
      scopes: record.scopes,
      idempotent: true,
      authMethod: 'session',
      responseStatus: 200,
    }) ?? Promise.resolve());
    return jsonResponse({
      keyHash,
      tenantId,
      scopes: record.scopes,
      name: record.name,
      createdAt: record.createdAt,
      revoked: true,
      revokedAt: record.revokedAt,
    }, 200, ACCOUNT_CACHE);
  }

  // Last-key guard: prevent tenants from locking themselves out.
  // KNOWN LIMITATION: not atomic with the revocation below -- concurrent
  // requests may both pass this check. Acceptable at self-serve scale;
  // the impact is an empty key list, not data loss.
  const activeKeys = await listApiKeyRecords(env.DB, { tenantId, includeRevoked: false });
  if (activeKeys.length <= 1) {
    ctx.waitUntil(log(env, 3, 'oauth', {
      event: 'oauth.key_revoke_blocked',
      cip,
      tenantId,
      keyHashPrefix: keyHash.slice(0, 8),
      keyName: record.name,
      authMethod: 'session',
      responseStatus: 409,
    }) ?? Promise.resolve());
    return problemResponse(409, "Cannot revoke your only API key. Create a replacement key first.", ACCOUNT_CACHE);
  }

  const result = await revokeApiKeyRecord(env.DB, keyHash);

  // Defensive: concurrent DELETE could have removed the record between pre-flight and here
  if (!result.revoked) {
    return problemResponse(404, 'API key not found.', ACCOUNT_CACHE);
  }

  ctx.waitUntil(log(env, 3, 'oauth', {
    event: 'oauth.key_revoke',
    cip,
    tenantId,
    keyHashPrefix: keyHash.slice(0, 8),
    keyName: result.record.name,
    scopes: result.record.scopes,
    idempotent: false,
    authMethod: 'session',
    responseStatus: 200,
  }) ?? Promise.resolve());

  return jsonResponse({
    keyHash,
    tenantId: result.record.tenantId,
    scopes: result.record.scopes,
    name: result.record.name,
    createdAt: result.record.createdAt,
    revoked: true,
    revokedAt: result.record.revokedAt,
  }, 200, ACCOUNT_CACHE);
}

// ---------------------------------------------------------------------------
// POST /v1/account/tos
// ---------------------------------------------------------------------------

/**
 * Record ToS acceptance for the authenticated user.
 *
 * Idempotent: the underlying acceptTos() only writes when tos_accepted_at IS NULL,
 * so repeated calls with the same version are safe.
 *
 * @param {Request} request
 * @param {object} env  env._session is set by the router
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handleAccountAcceptTos(request, env, ctx, _match) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // CSRF defense in depth
  const csrfError = checkCsrf(request);
  if (csrfError) return csrfError;

  // Content-Type check
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json', ACCOUNT_CACHE);
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON', ACCOUNT_CACHE);
  }

  // Validate tosVersion
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'tosVersion')) {
    return problemResponse(400, "Field 'tosVersion' is required", ACCOUNT_CACHE);
  }
  if (typeof body.tosVersion !== 'string' || !body.tosVersion.trim()) {
    return problemResponse(400, "Field 'tosVersion' must be a non-empty string", ACCOUNT_CACHE);
  }

  const { githubId, tenantId } = env._session;
  const tosAcceptedAt = new Date().toISOString();

  await acceptTos(env.DB, githubId, body.tosVersion);

  // tosVersion is not logged -- it is not validated against a restrictive regex
  // and the log invariant requires injection-safe values only.
  ctx.waitUntil(log(env, 3, 'oauth', {
    event: 'oauth.tos_accept',
    cip,
    tenantId,
    authMethod: 'session',
    responseStatus: 200,
  }) ?? Promise.resolve());

  return jsonResponse({ ok: true, tosAcceptedAt }, 200, ACCOUNT_CACHE);
}

// ---------------------------------------------------------------------------
// GET /v1/account/usage
// ---------------------------------------------------------------------------

/**
 * Return current-period quota usage for the authenticated tenant.
 *
 * Reuses checkQuota(db, tenantId, 0) as the primary data source to avoid
 * duplicating the D1 batch query. count=0 means the capture check fires only
 * if captureCount > quota (already over), not on the normal path.
 *
 * Edge case: when the tenant is already over their capture or storage limit,
 * checkQuota returns a limited shape (missing tier, quota, or the other usage
 * counter). In that case a single fallback read fills in the missing fields.
 * This endpoint is not on the hot capture path, so the extra read is fine.
 *
 * @param {Request} request
 * @param {object} env  env._session is set by the router (verified session)
 * @param {ExecutionContext} ctx
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handleAccountGetUsage(request, env, ctx, _match) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);
  const { tenantId } = env._session;

  const result = await checkQuota(env.DB, tenantId, 0);

  if (!result.allowed && result.reason === 'tenant_not_found') {
    return jsonResponse({ error: 'tenant_not_found' }, 404, ACCOUNT_CACHE);
  }

  let hasPaymentMethod, billingStatus, gracePeriodEnd, quota, captureCount, storageBytes, period;
  let invoiceCacheCents = null;
  let invoiceCacheCurrency = null;

  if (result.allowed) {
    // Common case: under both limits, checkQuota returns full data.
    hasPaymentMethod = result.hasPaymentMethod;
    billingStatus    = result.billingStatus;
    gracePeriodEnd   = null; // populated below for grace_period status
    quota            = result.quota;
    captureCount     = result.captureCount;
    storageBytes     = result.storageBytes;
    period           = result.period;

    // Read invoice cache for paid tenants
    if (hasPaymentMethod) {
      const cacheRow = await env.DB.prepare(
        'SELECT stripe_invoice_amount_cents, stripe_invoice_currency FROM tenants WHERE id = ?',
      ).bind(tenantId).first();
      invoiceCacheCents    = cacheRow?.stripe_invoice_amount_cents ?? null;
      invoiceCacheCurrency = cacheRow?.stripe_invoice_currency ?? null;
    }
  } else {
    // Already over a limit or billing blocked. checkQuota returns a limited shape.
    // Read the tenant + usage rows directly to build a complete response.
    period = result.period ?? computePeriod();
    const [tenantRow, usageRow] = await env.DB.batch([
      env.DB.prepare(
        `SELECT config, payment_method_added_at, billing_status, grace_period_end,
                stripe_invoice_amount_cents, stripe_invoice_currency
         FROM tenants WHERE id = ?`,
      ).bind(tenantId),
      env.DB.prepare(
        'SELECT capture_count, storage_bytes FROM usage_counters WHERE tenant_id = ? AND period = ?',
      ).bind(tenantId, period),
    ]);
    const tenantData     = tenantRow.results?.[0];
    const config         = tenantData?.config ? JSON.parse(tenantData.config) : null;
    hasPaymentMethod     = tenantData?.payment_method_added_at != null;
    billingStatus        = tenantData?.billing_status ?? 'active';
    gracePeriodEnd       = tenantData?.grace_period_end ?? null;
    invoiceCacheCents    = tenantData?.stripe_invoice_amount_cents ?? null;
    invoiceCacheCurrency = tenantData?.stripe_invoice_currency ?? null;
    quota                = getEffectiveQuota(hasPaymentMethod, config);
    const usageData      = usageRow.results?.[0];
    captureCount         = usageData?.capture_count ?? 0;
    storageBytes         = usageData?.storage_bytes ?? 0;
  }

  // Derive the public-facing billingStatus.
  // 'free' is a derived state: billing_status='active' with no payment method.
  const publicBillingStatus = (billingStatus === 'active' && !hasPaymentMethod)
    ? 'free'
    : billingStatus;

  // Quota-response headers: omit limit/remaining for paid tenants (unlimited).
  const captureLimit = (quota?.capturesPerMonth === Infinity || hasPaymentMethod)
    ? null
    : (quota?.capturesPerMonth ?? null);

  const charges = calculateCharges(captureCount);

  // Use Stripe-authoritative amount for paid tenants when cache is available
  const useStripeCache = hasPaymentMethod && invoiceCacheCents !== null;
  const chargeAmount   = useStripeCache ? invoiceCacheCents / 100 : charges.amount;
  const chargeCurrency = useStripeCache ? (invoiceCacheCurrency ?? 'eur').toUpperCase() : charges.currency;
  const chargeSource   = useStripeCache ? 'stripe' : 'local';

  const billing = {
    currentCharges: {
      amount:   chargeAmount,
      currency: chargeCurrency,
      source:   chargeSource,
    },
    tier:  charges.currentTier,
    tiers: charges.tiers,
    invoiceThreshold: {
      amount:   INVOICE_THRESHOLD_EUR,
      currency: 'EUR',
      met:      chargeAmount >= INVOICE_THRESHOLD_EUR,
    },
  };

  ctx.waitUntil(log(env, 3, 'oauth', {
    event: 'oauth.usage_view',
    cip,
    tenantId,
    authMethod: 'session',
    responseStatus: 200,
  }) ?? Promise.resolve());

  return jsonResponse({
    tenantId,
    period,
    billingStatus:    publicBillingStatus,
    hasPaymentMethod: Boolean(hasPaymentMethod),
    gracePeriodEnd:   billingStatus === 'grace_period' ? gracePeriodEnd : null,
    captures: {
      used:      captureCount,
      limit:     captureLimit,
      remaining: captureLimit !== null ? Math.max(0, captureLimit - captureCount) : null,
    },
    storageBytes: {
      used:      storageBytes,
      limit:     quota?.storageBytes === Infinity ? null : (quota?.storageBytes ?? null),
      remaining: quota?.storageBytes === Infinity
        ? null
        : Math.max(0, (quota?.storageBytes ?? 0) - storageBytes),
    },
    resetsAt: computeQuotaReset(),
    billing,
  }, 200, ACCOUNT_CACHE);
}

// ---------------------------------------------------------------------------
// GET /v1/account/settings
// ---------------------------------------------------------------------------

/**
 * Return eIDAS/qualified timestamp settings for the authenticated tenant.
 *
 * @param {Request} request
 * @param {object} env  env._session is set by the router (verified session)
 * @param {ExecutionContext} _ctx  unused
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handleGetSettings(request, env, _ctx, _match) {
  const { tenantId } = env._session;

  const row = await env.DB.prepare(
    'SELECT eidas_qualified, updated_at FROM tenants WHERE id = ?',
  ).bind(tenantId).first();

  const qualifiedTimestamps = Boolean(row?.eidas_qualified);
  const updatedAt = row?.updated_at ?? null;

  return jsonResponse({ qualifiedTimestamps, updatedAt }, 200, ACCOUNT_CACHE);
}

// ---------------------------------------------------------------------------
// PATCH /v1/account/settings
// ---------------------------------------------------------------------------

/**
 * Update eIDAS/qualified timestamp settings for the authenticated tenant.
 *
 * Allowlisted fields: qualifiedTimestamps (boolean).
 * Enabling qualified timestamps requires a payment method on file (402).
 * Payment method check and current eIDAS state are fetched in a single query
 * to avoid TOCTOU between the two reads.
 *
 * @param {Request} request
 * @param {object} env  env._session is set by the router (verified session)
 * @param {ExecutionContext} _ctx  unused
 * @param {RegExpMatchArray} _match  unused
 * @returns {Promise<Response>}
 */
export async function handleUpdateSettings(request, env, _ctx, _match) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // CSRF defense in depth (PATCH is a mutation)
  const csrfError = checkCsrf(request);
  if (csrfError) return csrfError;

  // Content-Type check
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json', ACCOUNT_CACHE);
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON', ACCOUNT_CACHE);
  }

  // Reject empty body
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
    return problemResponse(400, 'Request body must not be empty', ACCOUNT_CACHE);
  }

  // Field allowlist: only qualifiedTimestamps is accepted
  const ALLOWED_FIELDS = new Set(['qualifiedTimestamps']);
  const unknown = Object.keys(body).filter(k => !ALLOWED_FIELDS.has(k));
  if (unknown.length > 0) {
    const field = unknown[0];
    return problemResponse(400, `Unknown settings field: '${field}'. Allowed fields: qualifiedTimestamps`, ACCOUNT_CACHE);
  }

  // Type validation
  if (typeof body.qualifiedTimestamps !== 'boolean') {
    return problemResponse(400, "Field 'qualifiedTimestamps' must be a boolean", ACCOUNT_CACHE);
  }

  const { tenantId } = env._session;

  // Single query: fetch current eIDAS state + payment method to avoid TOCTOU
  const row = await env.DB.prepare(
    'SELECT eidas_qualified, payment_method_added_at, updated_at FROM tenants WHERE id = ?',
  ).bind(tenantId).first();

  const previousValue = Boolean(row?.eidas_qualified);
  const hasPaymentMethod = row?.payment_method_added_at != null;

  // eIDAS is available to all tenants -- first 50 qualified timestamps/month are
  // free (no payment method required). Billing enforcement happens at capture time
  // via the metering pipeline, same as regular captures.

  // Write the new setting
  await setEidasQualified(env.DB, tenantId, body.qualifiedTimestamps);

  // Log the change
  await log(env, 3, 'admin', {
    event: 'tenant.settings_change',
    tenantId,
    cip,
    setting: 'eidas_qualified',
    oldValue: previousValue,
    newValue: body.qualifiedTimestamps,
  });

  // Read back the updated row for updatedAt timestamp
  const updated = await env.DB.prepare(
    'SELECT updated_at FROM tenants WHERE id = ?',
  ).bind(tenantId).first();

  return jsonResponse({
    qualifiedTimestamps: body.qualifiedTimestamps,
    updatedAt: updated?.updated_at ?? new Date().toISOString(),
  }, 200, ACCOUNT_CACHE);
}

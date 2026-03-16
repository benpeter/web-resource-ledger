/*
 * kv.js -- KV access layer for capture status tracking
 *
 * Data model: one record per capture, stored as JSON under key `capture:{captureId}`.
 * Secondary index keys: `tenant:{tenantId}:ts:{createdAt}:{captureId}` with value ''
 * for tenant-scoped listing.
 *
 * Lifecycle:
 *   pending  -- written by createCapture() before 202 is returned; expires in 24h
 *               (self-cleaning for captures that never complete)
 *   complete -- written by completeCapture(); no TTL, persists indefinitely
 *   failed   -- written by failCapture(); no TTL, persists for debugging
 *
 * All KV access is centralised here. No raw kv.put()/kv.get() calls should
 * exist outside this module.
 *
 * Record shape:
 *   { status, url, ip, captureId, tenantId, createdAt }          -- pending
 *   { ...pending, status: 'complete', completedAt, artifacts }    -- complete
 *   { ...pending, status: 'failed', failedAt, error, retryable }  -- failed
 *
 * Tests: test/kv.test.js
 */ // tva

const KEY_PREFIX = 'capture:';
const PENDING_TTL = 86400; // 24 hours

/** Regex for valid tenant IDs -- mirrors the contract in auth.js */
const TENANT_ID_RE = /^[a-z0-9_-]{1,64}$/;

/**
 * Returns the KV key prefix for a given tenant.
 * Validates tenantId and throws if invalid (fail closed -- defense-in-depth
 * against any bypass of auth-layer validation).
 *
 * @param {string} tenantId
 * @returns {string} e.g. 'tenant:default:'
 */
export function tenantPrefix(tenantId) {
  if (!TENANT_ID_RE.test(tenantId)) {
    throw new Error(`Invalid tenantId: ${tenantId}`);
  }
  return `tenant:${tenantId}:`;
}

/**
 * Write initial pending record and secondary index key. Called BEFORE returning 202.
 * Uses expirationTtl: 86400 (24h) as self-cleaning for stuck captures.
 *
 * @param {KVNamespace} kv
 * @param {string} captureId
 * @param {string} url
 * @param {string} ip
 * @param {string} tenantId
 */
export async function createCapture(kv, captureId, url, ip, tenantId) {
  const createdAt = new Date().toISOString();
  const value = {
    status: 'pending',
    url,
    ip,
    captureId,
    tenantId,
    createdAt,
  };
  await kv.put(`${KEY_PREFIX}${captureId}`, JSON.stringify(value), {
    expirationTtl: PENDING_TTL,
  });

  // Write secondary index key for tenant-scoped listing.
  // Failure is non-fatal: primary record exists and capture is functional.
  try {
    const prefix = tenantPrefix(tenantId);
    await kv.put(`${prefix}ts:${createdAt}:${captureId}`, '', {
      expirationTtl: PENDING_TTL,
    });
  } catch (err) {
    console.warn('createCapture: index write failed (non-fatal)', err?.message);
  }
}

/**
 * Update status to complete. Removes TTL (completed records persist).
 * Re-writes the secondary index key without TTL so completed captures
 * remain visible in tenant listings.
 *
 * @param {KVNamespace} kv
 * @param {string} captureId
 * @param {{ screenshot: string, html: string, headers: string }} artifacts
 * @param {{ key: string, bundleHash: string, size: number } | null} [wacz=null]
 */
export async function completeCapture(kv, captureId, artifacts, wacz = null) {
  const existing = await kv.get(`${KEY_PREFIX}${captureId}`, 'json');
  if (!existing) return; // Expired or missing -- nothing to update
  const value = {
    ...existing,
    status: 'complete',
    completedAt: new Date().toISOString(),
    artifacts,
    ...(wacz ? { wacz } : {}),
  };
  await kv.put(`${KEY_PREFIX}${captureId}`, JSON.stringify(value));
  // No expirationTtl -- completed records persist

  // Re-write index key without TTL so it persists along with the primary record.
  // Pre-R8 records have no tenantId -- skip index update for those.
  if (existing.tenantId && existing.createdAt) {
    try {
      const prefix = tenantPrefix(existing.tenantId);
      await kv.put(`${prefix}ts:${existing.createdAt}:${captureId}`, '');
    } catch (err) {
      console.warn('completeCapture: index re-write failed (non-fatal)', err?.message);
    }
  }
}

/**
 * Update status to failed. Removes TTL (failed records persist for debugging).
 * Re-writes the secondary index key without TTL so failed captures remain
 * visible in tenant listings.
 *
 * @param {KVNamespace} kv
 * @param {string} captureId
 * @param {string} error Human-readable error message
 * @param {boolean} [retryable=false]
 */
export async function failCapture(kv, captureId, error, retryable = false) {
  const existing = await kv.get(`${KEY_PREFIX}${captureId}`, 'json');
  if (!existing) return; // Expired or missing -- nothing to update
  const value = {
    ...existing,
    status: 'failed',
    failedAt: new Date().toISOString(),
    error,
    retryable,
  };
  await kv.put(`${KEY_PREFIX}${captureId}`, JSON.stringify(value));

  // Re-write index key without TTL so it persists along with the primary record.
  // Pre-R8 records have no tenantId -- skip index update for those.
  if (existing.tenantId && existing.createdAt) {
    try {
      const prefix = tenantPrefix(existing.tenantId);
      await kv.put(`${prefix}ts:${existing.createdAt}:${captureId}`, '');
    } catch (err) {
      console.warn('failCapture: index re-write failed (non-fatal)', err?.message);
    }
  }
}

/**
 * Read capture record. Returns parsed JSON or null for missing keys.
 *
 * @param {KVNamespace} kv
 * @param {string} captureId
 * @returns {Promise<object|null>}
 */
export async function getCapture(kv, captureId) {
  return kv.get(`${KEY_PREFIX}${captureId}`, 'json');
}

/**
 * List captures for a tenant, in ascending chronological order.
 * Uses the secondary index keys `tenant:{tenantId}:ts:{ISO}:{captureId}`.
 *
 * Cursor is an opaque base64url-encoded JSON string wrapping the KV native cursor.
 * Returns `{ error: 'invalid_cursor' }` when cursor decode/parse fails so the
 * caller can return a 400 without throwing.
 *
 * @param {KVNamespace} kv
 * @param {string} tenantId
 * @param {{ cursor?: string, limit?: number, status?: string }} [opts]
 * @returns {Promise<{ data: object[], pagination: { cursor: string|null, hasMore: boolean, limit: number } } | { error: string }>}
 */
export async function listCaptures(kv, tenantId, { cursor, limit = 20, status } = {}) {
  const prefix = `${tenantPrefix(tenantId)}ts:`;

  // Decode cursor: base64url -> JSON -> extract kv field
  let kvCursor;
  if (cursor) {
    try {
      // Restore standard base64 padding before decoding
      const b64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const decoded = JSON.parse(atob(padded));
      if (!decoded || typeof decoded.kv !== 'string') return { error: 'invalid_cursor' };
      kvCursor = decoded.kv;
    } catch {
      return { error: 'invalid_cursor' };
    }
  }

  // Single-pass over-fetch: if filtering by status, fetch limit*3 keys to
  // improve the chance of filling the page after filtering. No loop per KISS.
  const fetchLimit = status ? limit * 3 : limit;

  const listResult = await kv.list({
    prefix,
    limit: fetchLimit,
    ...(kvCursor ? { cursor: kvCursor } : {}),
  });

  // Extract captureId from the key suffix: tenant:{id}:ts:{ISO}:{captureId}
  const captureIds = listResult.keys.map(k => k.name.slice(k.name.lastIndexOf(':') + 1));

  // Fetch all records in parallel, filter nulls (expired/orphaned index keys)
  const records = (await Promise.all(captureIds.map(id => getCapture(kv, id))))
    .filter(r => r !== null);

  // Apply status filter in memory
  const filtered = status ? records.filter(r => r.status === status) : records;

  // Take up to limit items
  const page = filtered.slice(0, limit);

  // Build next cursor:
  // Emit a cursor when either KV has more pages (list_complete === false)
  // OR the filtered result had more items than the page size.
  const hasKvMore = listResult.list_complete === false;
  const hasFilterMore = filtered.length > limit;
  const needsCursor = hasKvMore || hasFilterMore;

  let cursorStr = null;
  if (needsCursor && listResult.cursor) {
    const raw = btoa(JSON.stringify({ kv: listResult.cursor }));
    cursorStr = raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  return {
    data: page,
    pagination: { cursor: cursorStr, hasMore: !!cursorStr, limit },
  };
}

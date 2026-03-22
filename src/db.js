/*
 * db.js -- D1 (SQLite) data access layer for all WRL metadata operations
 *
 * Replaces the KV-based metadata layer (kv.js) for captures, tenants, API keys,
 * and signing keys. Rate limit counters remain in kv.js using env.KV.
 *
 * Schema (four tables, defined in migrations/0001_initial.sql):
 *   tenants      -- tenant records with optional config JSON
 *   captures     -- capture lifecycle with JSON artifact columns
 *   api_keys     -- hashed API key records with scopes JSON
 *   signing_keys -- archived Ed25519 public keys (private keys live in Wrangler secrets)
 *
 * All DB access is centralised here. No raw env.DB.prepare() calls should
 * exist outside this module.
 *
 * Record shapes returned by getCapture / listCaptures:
 *   { captureId, status, url, ip, tenantId, createdAt, completedAt,
 *     artifacts, wacz, renderQuality, render, captureSettings,
 *     failedAt, error, retryable }
 *
 * Tests: test/db.test.js
 */ // tva

/** Regex for valid tenant IDs -- single source of truth, also exported from kv.js */
export const TENANT_ID_RE = /^[a-z0-9_-]{1,64}$/;

const SHA256HEX_RE = /^[a-f0-9]{64}$/;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Transform a D1 captures row into the canonical camelCase shape used
 * throughout the application. Handles null JSON columns safely.
 *
 * @param {object} row
 * @returns {object}
 */
function rowToCapture(row) {
  return {
    captureId: row.id,
    status: row.status,
    url: row.url,
    ip: row.ip,
    tenantId: row.tenant_id,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null,
    artifacts: row.artifacts ? JSON.parse(row.artifacts) : null,
    wacz: row.wacz ? JSON.parse(row.wacz) : null,
    renderQuality: row.render_quality ?? null,
    render: row.render ? JSON.parse(row.render) : null,
    captureSettings: row.capture_settings ? JSON.parse(row.capture_settings) : null,
    failedAt: row.failed_at ?? null,
    error: row.error ?? null,
    retryable: row.retryable != null ? Boolean(row.retryable) : false,
  };
}

// ---------------------------------------------------------------------------
// Capture operations
// ---------------------------------------------------------------------------

/**
 * Insert a new pending capture record and ensure the tenant row exists.
 * Both statements run atomically via db.batch().
 *
 * @param {D1Database} db
 * @param {string} captureId
 * @param {string} url
 * @param {string} ip
 * @param {string} tenantId
 */
export async function createCapture(db, captureId, url, ip, tenantId) {
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(
      'INSERT INTO captures (id, tenant_id, url, ip, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(captureId, tenantId, url, ip, 'pending', createdAt),
  ]);
}

/**
 * Update a capture to complete status.
 * Returns early (no-op) if the capture does not exist.
 *
 * @param {D1Database} db
 * @param {string} captureId
 * @param {{ screenshot: string, screenshotBefore?: string, html: string, headers: string }} artifacts
 * @param {{ key: string, bundleHash: string, size: number } | null} [wacz=null]
 * @param {string | null} [renderQuality=null]
 * @param {object | null} [render=null]
 * @param {object | null} [captureSettings=null]
 */
export async function completeCapture(db, captureId, artifacts, wacz = null, renderQuality = null, render = null, captureSettings = null) {
  const result = await db.prepare(
    `UPDATE captures
     SET status = 'complete',
         completed_at = ?,
         artifacts = ?,
         wacz = ?,
         render_quality = ?,
         render = ?,
         capture_settings = ?
     WHERE id = ?`,
  ).bind(
    new Date().toISOString(),
    artifacts ? JSON.stringify(artifacts) : null,
    wacz ? JSON.stringify(wacz) : null,
    renderQuality,
    render ? JSON.stringify(render) : null,
    captureSettings ? JSON.stringify(captureSettings) : null,
    captureId,
  ).run();

  if (result.meta.changes === 0) return; // Capture not found -- nothing to update
}

/**
 * Update a capture to failed status.
 * Returns early (no-op) if the capture does not exist.
 *
 * @param {D1Database} db
 * @param {string} captureId
 * @param {string} error Human-readable error message
 * @param {boolean} [retryable=false]
 */
export async function failCapture(db, captureId, error, retryable = false) {
  const result = await db.prepare(
    `UPDATE captures
     SET status = 'failed',
         failed_at = ?,
         error = ?,
         retryable = ?
     WHERE id = ?`,
  ).bind(
    new Date().toISOString(),
    error,
    retryable ? 1 : 0,
    captureId,
  ).run();

  if (result.meta.changes === 0) return; // Capture not found -- nothing to update
}

/**
 * Read a single capture record by ID.
 *
 * @param {D1Database} db
 * @param {string} captureId
 * @returns {Promise<object|null>}
 */
export async function getCapture(db, captureId) {
  const row = await db.prepare('SELECT * FROM captures WHERE id = ?').bind(captureId).first();
  if (!row) return null;
  return rowToCapture(row);
}

/**
 * List captures for a tenant with optional filtering, sorting, and offset pagination.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {{
 *   offset?: number,
 *   limit?: number,
 *   status?: string,
 *   url?: string,
 *   created_after?: string,
 *   created_before?: string,
 *   sort?: string
 * }} [opts]
 * @returns {Promise<{ data: object[], pagination: { total: number, offset: number, limit: number, hasMore: boolean } }>}
 */
export async function listCaptures(db, tenantId, {
  offset = 0,
  limit = 20,
  status,
  url,
  created_after,
  created_before,
  sort = '-created_at',
} = {}) {
  const conditions = ['tenant_id = ?'];
  const params = [tenantId];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (url) {
    // Escape _ in the url value (SQLite LIKE wildcard) before appending %
    const escaped = url.replace(/_/g, '\\_');
    conditions.push("url LIKE ? || '%' ESCAPE '\\'");
    params.push(escaped);
  }

  if (created_after) {
    conditions.push('created_at >= ?');
    params.push(created_after);
  }

  if (created_before) {
    conditions.push('created_at < ?');
    params.push(created_before);
  }

  const where = 'WHERE ' + conditions.join(' AND ');
  if (sort && sort !== 'created_at' && sort !== '-created_at') {
    throw new Error(`Invalid sort value: ${sort}`);
  }
  const order = sort === 'created_at' ? 'ORDER BY created_at ASC' : 'ORDER BY created_at DESC';

  const dataQuery = db.prepare(
    `SELECT * FROM captures ${where} ${order} LIMIT ? OFFSET ?`,
  ).bind(...params, limit, offset);

  const countQuery = db.prepare(
    `SELECT COUNT(*) AS total FROM captures ${where}`,
  ).bind(...params);

  const [dataResult, countResult] = await db.batch([dataQuery, countQuery]);

  const data = (dataResult.results ?? []).map(rowToCapture);
  const total = countResult.results[0]?.total ?? 0;
  const hasMore = offset + data.length < total;

  return {
    data,
    pagination: { total, offset, limit, hasMore },
  };
}

// ---------------------------------------------------------------------------
// Tenant configuration
// ---------------------------------------------------------------------------

/**
 * Read tenant configuration. Returns null if no config exists or tenant has no config set.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @returns {Promise<object|null>}
 */
export async function getTenantConfig(db, tenantId) {
  if (!TENANT_ID_RE.test(tenantId)) {
    throw new Error(`Invalid tenantId: ${tenantId}`);
  }
  const row = await db.prepare('SELECT config FROM tenants WHERE id = ?').bind(tenantId).first();
  if (!row || row.config == null) return null;
  return JSON.parse(row.config);
}

/**
 * Write tenant configuration (UPSERT -- creates tenant if not present).
 * Validates rate limit values before writing.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {object} config
 * @param {string} updatedBy
 * @returns {Promise<object>} The saved record with updatedAt
 */
export async function setTenantConfig(db, tenantId, config, updatedBy) {
  if (!TENANT_ID_RE.test(tenantId)) {
    throw new Error(`Invalid tenantId: ${tenantId}`);
  }

  // Validate rate limit overrides if present
  if (config.rateLimit) {
    for (const [group, limits] of Object.entries(config.rateLimit)) {
      if (typeof limits.limit !== 'number' || limits.limit < 1 || !Number.isInteger(limits.limit)) {
        throw new Error(`rateLimit.${group}.limit must be a positive integer`);
      }
      if (limits.period !== undefined && limits.period !== 10 && limits.period !== 60) {
        throw new Error(`rateLimit.${group}.period must be 10 or 60 (Cloudflare constraint)`);
      }
    }
  }

  const updatedAt = new Date().toISOString();
  const record = {
    ...config,
    updatedAt,
    updatedBy,
  };

  await db.prepare(
    `INSERT INTO tenants (id, config, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       config = excluded.config,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).bind(tenantId, JSON.stringify(record), updatedAt, updatedBy).run();

  return record;
}

// ---------------------------------------------------------------------------
// API key operations
// ---------------------------------------------------------------------------

/**
 * Write a new API key record.
 * Guards against hash collisions with existing non-revoked keys.
 * Ensures the tenant row exists before inserting.
 *
 * @param {D1Database} db
 * @param {string} sha256hex  64 lowercase hex chars
 * @param {object} record  Full key record (tenantId, scopes, name, createdAt, createdBy, revoked, revokedAt)
 * @returns {Promise<{ created: true } | { created: false, reason: 'hash_collision' }>}
 */
export async function createApiKeyRecord(db, sha256hex, record) {
  if (!SHA256HEX_RE.test(sha256hex)) {
    throw new Error(`Invalid sha256hex: expected 64 lowercase hex chars, got "${sha256hex}"`);
  }

  // Check for existing non-revoked key with this hash
  const existing = await db.prepare(
    'SELECT revoked FROM api_keys WHERE key_hash = ?',
  ).bind(sha256hex).first();

  if (existing && !existing.revoked) {
    return { created: false, reason: 'hash_collision' };
  }

  // INSERT OR REPLACE handles the case where a revoked record with this hash already exists.
  // Non-revoked duplicates are blocked above so REPLACE only fires for revoked overwrites.
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(record.tenantId),
    db.prepare(
      `INSERT OR REPLACE INTO api_keys (key_hash, tenant_id, scopes, name, created_at, created_by, revoked, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      sha256hex,
      record.tenantId,
      JSON.stringify(record.scopes),
      record.name,
      record.createdAt,
      record.createdBy,
      record.revoked ? 1 : 0,
      record.revokedAt ?? null,
    ),
  ]);

  return { created: true };
}

/**
 * Read an API key record by its SHA-256 hex fingerprint.
 *
 * @param {D1Database} db
 * @param {string} sha256hex  64 lowercase hex chars
 * @returns {Promise<object|null>}
 */
export async function getApiKeyRecord(db, sha256hex) {
  if (!SHA256HEX_RE.test(sha256hex)) {
    throw new Error(`Invalid sha256hex: expected 64 lowercase hex chars, got "${sha256hex}"`);
  }
  const row = await db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').bind(sha256hex).first();
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    scopes: JSON.parse(row.scopes),
    name: row.name,
    createdAt: row.created_at,
    createdBy: row.created_by,
    revoked: Boolean(row.revoked),
    revokedAt: row.revoked_at ?? null,
  };
}

/**
 * Revoke an API key record.
 * Returns not_found for missing keys, already-revoked check for idempotency.
 *
 * @param {D1Database} db
 * @param {string} sha256hex  64 lowercase hex chars
 * @returns {Promise<
 *   { revoked: false, reason: 'not_found' } |
 *   { revoked: true, record: object }
 * >}
 */
export async function revokeApiKeyRecord(db, sha256hex) {
  if (!SHA256HEX_RE.test(sha256hex)) {
    throw new Error(`Invalid sha256hex: expected 64 lowercase hex chars, got "${sha256hex}"`);
  }

  const existing = await getApiKeyRecord(db, sha256hex);
  if (!existing) {
    return { revoked: false, reason: 'not_found' };
  }
  if (existing.revoked) {
    return { revoked: true, record: existing };
  }

  const revokedAt = new Date().toISOString();
  await db.prepare(
    'UPDATE api_keys SET revoked = 1, revoked_at = ? WHERE key_hash = ?',
  ).bind(revokedAt, sha256hex).run();

  const updated = { ...existing, revoked: true, revokedAt };
  return { revoked: true, record: updated };
}

/**
 * List API key records with optional tenant and revocation filters.
 * Returns sorted by created_at ascending.
 *
 * @param {D1Database} db
 * @param {{ tenantId?: string, includeRevoked?: boolean }} [opts]
 * @returns {Promise<Array<{ keyHash: string, tenantId: string, scopes: string[], name: string, createdAt: string, createdBy: string, revoked: boolean, revokedAt: string|null }>>}
 */
export async function listApiKeyRecords(db, { tenantId, includeRevoked = false } = {}) {
  const conditions = [];
  const params = [];

  if (tenantId !== undefined) {
    conditions.push('tenant_id = ?');
    params.push(tenantId);
  }

  if (!includeRevoked) {
    conditions.push('revoked = 0');
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const rows = await db.prepare(
    `SELECT * FROM api_keys ${where} ORDER BY created_at ASC`,
  ).bind(...params).all();

  return (rows.results ?? []).map(row => ({
    keyHash: row.key_hash,
    tenantId: row.tenant_id,
    scopes: JSON.parse(row.scopes),
    name: row.name,
    createdAt: row.created_at,
    createdBy: row.created_by,
    revoked: Boolean(row.revoked),
    revokedAt: row.revoked_at ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Signing key archive
// ---------------------------------------------------------------------------

/**
 * Archive an Ed25519 public key. Idempotent -- INSERT OR IGNORE skips duplicates.
 * Only public keys are stored here; private key material lives in Wrangler secrets.
 *
 * @param {D1Database} db
 * @param {string} keyId  8-char hex fingerprint
 * @param {string} publicKeyBase64  Base64-encoded raw 32-byte public key
 */
export async function archiveSigningKey(db, keyId, publicKeyBase64) {
  // Validate key decodes to exactly 32 bytes (Ed25519 public key length)
  const decoded = atob(publicKeyBase64);
  if (decoded.length !== 32) {
    throw new Error(`Expected 32-byte public key, got ${decoded.length}`);
  }
  const archivedAt = new Date().toISOString();
  await db.prepare(
    'INSERT OR IGNORE INTO signing_keys (id, public_key, algorithm, archived_at) VALUES (?, ?, ?, ?)',
  ).bind(keyId, publicKeyBase64, 'Ed25519', archivedAt).run();
}

/**
 * Retrieve an archived signing key by keyId.
 *
 * @param {D1Database} db
 * @param {string} keyId  8-char hex fingerprint
 * @returns {Promise<{ algorithm: string, publicKey: string, archivedAt: string } | null>}
 */
export async function getArchivedSigningKey(db, keyId) {
  const row = await db.prepare('SELECT * FROM signing_keys WHERE id = ?').bind(keyId).first();
  if (!row) return null;
  return {
    algorithm: row.algorithm,
    publicKey: row.public_key,
    archivedAt: row.archived_at,
  };
}

/**
 * List all archived signing keys.
 *
 * @param {D1Database} db
 * @returns {Promise<Array<{ keyId: string, algorithm: string, publicKey: string, archivedAt: string }>>}
 */
export async function listArchivedSigningKeys(db) {
  const rows = await db.prepare('SELECT * FROM signing_keys ORDER BY archived_at ASC').all();
  return (rows.results ?? []).map(row => ({
    keyId: row.id,
    algorithm: row.algorithm,
    publicKey: row.public_key,
    archivedAt: row.archived_at,
  }));
}

// ---------------------------------------------------------------------------
// Usage counters
// ---------------------------------------------------------------------------

/**
 * Derive the billing period string ('YYYY-MM') from a Date.
 * Defaults to current UTC time. Exported for testing.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function computePeriod(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

/**
 * Increment usage counters for a tenant in the current billing period.
 * Uses UPSERT: creates the row on first write, increments on subsequent.
 * Caller should pass this to ctx.waitUntil() for non-blocking execution.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {{ captures?: number, storageBytes?: number, apiCalls?: number }} deltas
 * @returns {Promise<void>}
 */
export async function incrementUsage(db, tenantId, deltas) {
  const period = computePeriod();
  const captures = deltas.captures ?? 0;
  const storageBytes = deltas.storageBytes ?? 0;
  const apiCalls = deltas.apiCalls ?? 0;

  if (captures === 0 && storageBytes === 0 && apiCalls === 0) return;

  await db.prepare(
    `INSERT INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, period) DO UPDATE SET
       capture_count = capture_count + excluded.capture_count,
       storage_bytes = storage_bytes + excluded.storage_bytes,
       api_call_count = api_call_count + excluded.api_call_count,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).bind(tenantId, period, captures, storageBytes, apiCalls).run();
}

/**
 * Read usage counters for a tenant in a specific billing period.
 * Returns zeroed counters if no row exists (tenant had no activity).
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {string} period  'YYYY-MM' format
 * @returns {Promise<{ tenantId: string, period: string, captureCount: number,
 *   storageBytes: number, apiCallCount: number, updatedAt: string|null }>}
 */
export async function getUsage(db, tenantId, period) {
  const row = await db.prepare(
    'SELECT * FROM usage_counters WHERE tenant_id = ? AND period = ?',
  ).bind(tenantId, period).first();

  if (!row) {
    return {
      tenantId,
      period,
      captureCount: 0,
      storageBytes: 0,
      apiCallCount: 0,
      updatedAt: null,
    };
  }

  return {
    tenantId: row.tenant_id,
    period: row.period,
    captureCount: row.capture_count,
    storageBytes: row.storage_bytes,
    apiCallCount: row.api_call_count,
    updatedAt: row.updated_at ?? null,
  };
}

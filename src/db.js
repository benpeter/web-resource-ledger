/*
 * db.js -- D1 (SQLite) data access layer for all WRL metadata operations
 *
 * Replaces the KV-based metadata layer (kv.js) for captures, tenants, API keys,
 * and signing keys. Rate limit counters remain in kv.js using env.KV.
 *
 * Schema (tables defined in migrations/):
 *   tenants         -- tenant records with optional config JSON
 *   captures        -- capture lifecycle with JSON artifact columns
 *   api_keys        -- hashed API key records with scopes JSON
 *   signing_keys    -- archived Ed25519 public keys (private keys live in Wrangler secrets)
 *   usage_counters  -- per-tenant monthly billing counters (capture count, storage bytes, API calls)
 *   webhooks        -- outbound webhook registrations per tenant
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

/** Allowed tier values. Application-layer validation (D1 ALTER TABLE has no CHECK support). */
export const VALID_TIERS = ['free', 'pro'];

/** Allowed billing status values. Application-layer validation (D1 ALTER TABLE has no CHECK support). */
export const VALID_BILLING_STATUSES = ['active', 'grace_period', 'blocked'];

/** Regex for valid webhook IDs: whk_ + 32 lowercase hex chars (total 36 chars) */
export const WEBHOOK_ID_RE = /^whk_[a-f0-9]{32}$/;

/** Regex for valid schedule IDs: sch_ + 32 lowercase hex chars (total 36 chars) */
export const SCHEDULE_ID_RE = /^sch_[a-f0-9]{32}$/;

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
    // Quarantined captures remain status='complete' in the DB; map to 'quarantined' in responses.
    status: row.quarantined ? 'quarantined' : row.status,
    url: row.url,
    ip: row.ip,
    tenantId: row.tenant_id,
    scheduleId: row.schedule_id ?? null,
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
    quarantined: Boolean(row.quarantined),
    quarantineReason: row.quarantine_reason ?? null,
    quarantinedAt: row.quarantined_at ?? null,
    lastThreatCheckAt: row.last_threat_check_at ?? null,
    threatCheck: row.threat_check ?? null,
    changeSummary: row.change_summary ? JSON.parse(row.change_summary) : null,
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
 * @param {string|null} [scheduleId]  Optional originating schedule ID
 */
export async function createCapture(db, captureId, url, ip, tenantId, scheduleId = null) {
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(
      'INSERT INTO captures (id, tenant_id, url, ip, status, created_at, schedule_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(captureId, tenantId, url, ip, 'pending', createdAt, scheduleId),
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
 *   sort?: string,
 *   schedule_id?: string
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
  schedule_id,
} = {}) {
  const conditions = ['tenant_id = ?'];
  const params = [tenantId];

  if (status) {
    if (status === 'quarantined') {
      // 'quarantined' is a virtual status: DB stores status='complete' + quarantined=1.
      conditions.push('status = ?');
      params.push('complete');
      conditions.push('quarantined = 1');
    } else if (status === 'complete') {
      // Exclude quarantined captures from the normal 'complete' bucket.
      conditions.push('status = ?');
      params.push('complete');
      conditions.push('quarantined = 0');
    } else {
      conditions.push('status = ?');
      params.push(status);
    }
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

  if (schedule_id) {
    conditions.push('schedule_id = ?');
    params.push(schedule_id);
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

  // Validate per-tenant quota overrides if present
  if (config.quotas) {
    if (config.quotas.capturesPerMonth !== undefined) {
      if (typeof config.quotas.capturesPerMonth !== 'number' ||
          config.quotas.capturesPerMonth < 1 ||
          !Number.isInteger(config.quotas.capturesPerMonth)) {
        throw new Error('quotas.capturesPerMonth must be a positive integer');
      }
    }
    if (config.quotas.storageBytes !== undefined) {
      if (typeof config.quotas.storageBytes !== 'number' ||
          config.quotas.storageBytes < 1 ||
          !Number.isInteger(config.quotas.storageBytes)) {
        throw new Error('quotas.storageBytes must be a positive integer');
      }
    }
  }

  // Validate per-tenant schedule limit overrides if present
  if (config.schedules) {
    if (config.schedules.maxSchedules !== undefined) {
      if (typeof config.schedules.maxSchedules !== 'number' ||
          config.schedules.maxSchedules < 1 ||
          !Number.isInteger(config.schedules.maxSchedules)) {
        throw new Error('schedules.maxSchedules must be a positive integer');
      }
      if (config.schedules.maxSchedules > 100) {
        throw new Error('schedules.maxSchedules cannot exceed 100');
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

/**
 * Update the tier for a tenant. The tenant row must already exist.
 * Validates the tier value against VALID_TIERS before writing.
 *
 * @deprecated Tier-based billing is replaced by usage-based billing (payment_method_added_at).
 *   Use billing functions (setBillingStatus, setPaymentMethodAdded) for new billing logic.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {string} tier  'free' | 'pro'
 * @param {string} updatedBy
 * @returns {Promise<void>}
 */
export async function setTenantTier(db, tenantId, tier, updatedBy) {
  if (!TENANT_ID_RE.test(tenantId)) {
    throw new Error(`Invalid tenantId: ${tenantId}`);
  }
  if (!VALID_TIERS.includes(tier)) {
    throw new Error(`Invalid tier '${tier}'; must be one of: ${VALID_TIERS.join(', ')}`);
  }
  const updatedAt = new Date().toISOString();
  await db.prepare(
    `UPDATE tenants SET tier = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
  ).bind(tier, updatedAt, updatedBy, tenantId).run();
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
// Webhook operations
// ---------------------------------------------------------------------------

/**
 * Transform a D1 webhooks row into the canonical camelCase shape.
 * Parses events JSON to array. Converts active INTEGER to boolean.
 * Secret is omitted by default -- pass opts.includeSecret = true on show-once paths.
 *
 * @param {object} row
 * @param {{ includeSecret?: boolean }} [opts]
 * @returns {object}
 */
function rowToWebhook(row, opts = {}) {
  const record = {
    webhookId: row.id,
    tenantId: row.tenant_id,
    url: row.url,
    name: row.name,
    events: JSON.parse(row.events),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
  if (opts.includeSecret) {
    record.secret = row.secret;
  }
  return record;
}

/**
 * Insert a new webhook registration.
 * Returns the created record WITH secret (show-once in API response).
 *
 * @param {D1Database} db
 * @param {{ id: string, tenantId: string, url: string, name: string, secret: string, events: string[] }} params
 * @returns {Promise<object>}
 */
export async function createWebhook(db, { id, tenantId, url, name, secret, events }) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(
      `INSERT INTO webhooks (id, tenant_id, url, name, secret, events)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, tenantId, url, name, secret, JSON.stringify(events)),
  ]);

  const row = await db.prepare('SELECT * FROM webhooks WHERE id = ?').bind(id).first();
  return rowToWebhook(row, { includeSecret: true });
}

/**
 * Read a single webhook by ID, scoped to tenantId for authorization.
 * Returns null if not found or tenant does not match.
 *
 * @param {D1Database} db
 * @param {string} webhookId
 * @param {string} tenantId
 * @param {{ includeSecret?: boolean }} [opts]
 * @returns {Promise<object|null>}
 */
export async function getWebhook(db, webhookId, tenantId, opts = {}) {
  const row = await db.prepare(
    'SELECT * FROM webhooks WHERE id = ? AND tenant_id = ?',
  ).bind(webhookId, tenantId).first();
  if (!row) return null;
  return rowToWebhook(row, opts);
}

/**
 * List all webhooks for a tenant, ordered by created_at ascending.
 * Secrets are not included.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @returns {Promise<object[]>}
 */
export async function listWebhooks(db, tenantId) {
  const rows = await db.prepare(
    'SELECT * FROM webhooks WHERE tenant_id = ? ORDER BY created_at ASC',
  ).bind(tenantId).all();
  return (rows.results ?? []).map(row => rowToWebhook(row));
}

/**
 * Delete a webhook by ID, scoped to tenantId for authorization.
 * Returns { deleted: true } on success, null if not found or wrong tenant.
 *
 * @param {D1Database} db
 * @param {string} webhookId
 * @param {string} tenantId
 * @returns {Promise<{ deleted: true }|null>}
 */
export async function deleteWebhook(db, webhookId, tenantId) {
  const result = await db.prepare(
    'DELETE FROM webhooks WHERE id = ? AND tenant_id = ?',
  ).bind(webhookId, tenantId).run();
  if (result.meta.changes === 0) return null;
  return { deleted: true };
}

/**
 * Count all webhooks (active + inactive) for a tenant.
 * Used to enforce the 5-per-tenant limit.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @returns {Promise<number>}
 */
export async function countWebhooks(db, tenantId) {
  const row = await db.prepare(
    'SELECT COUNT(*) AS total FROM webhooks WHERE tenant_id = ?',
  ).bind(tenantId).first();
  return row?.total ?? 0;
}

/**
 * Fetch all active webhooks for a tenant that should receive a given event type.
 * Event filtering is performed in application code (max 5 rows per tenant makes
 * json_each unnecessary overhead). Returns records WITH secrets for HMAC signing.
 * This is the hot-path query called from the queue consumer.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {string} eventType  e.g. "capture.complete" or "capture.failed"
 * @returns {Promise<object[]>}
 */
export async function getActiveWebhooksForEvent(db, tenantId, eventType) {
  const rows = await db.prepare(
    'SELECT * FROM webhooks WHERE tenant_id = ? AND active = 1',
  ).bind(tenantId).all();
  return (rows.results ?? [])
    .filter(row => {
      const events = JSON.parse(row.events);
      return events.includes(eventType);
    })
    .map(row => rowToWebhook(row, { includeSecret: true }));
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
 * @param {{ captures?: number, storageBytes?: number, apiCalls?: number, eidasCaptures?: number }} deltas
 * @returns {Promise<void>}
 */
export async function incrementUsage(db, tenantId, deltas) {
  const period = computePeriod();
  const captures = deltas.captures ?? 0;
  const storageBytes = deltas.storageBytes ?? 0;
  const apiCalls = deltas.apiCalls ?? 0;
  const eidasCaptures = deltas.eidasCaptures ?? 0;

  if (captures === 0 && storageBytes === 0 && apiCalls === 0 && eidasCaptures === 0) return;

  await db.prepare(
    `INSERT INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_call_count, eidas_capture_count)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, period) DO UPDATE SET
       capture_count = capture_count + excluded.capture_count,
       storage_bytes = storage_bytes + excluded.storage_bytes,
       api_call_count = api_call_count + excluded.api_call_count,
       eidas_capture_count = eidas_capture_count + excluded.eidas_capture_count,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).bind(tenantId, period, captures, storageBytes, apiCalls, eidasCaptures).run();
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
      eidasCaptureCount: 0,
      updatedAt: null,
    };
  }

  return {
    tenantId: row.tenant_id,
    period: row.period,
    captureCount: row.capture_count,
    storageBytes: row.storage_bytes,
    apiCallCount: row.api_call_count,
    eidasCaptureCount: row.eidas_capture_count ?? 0,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Check whether a tenant row exists in D1.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @returns {Promise<boolean>}
 */
export async function tenantExists(db, tenantId) {
  const row = await db.prepare('SELECT 1 FROM tenants WHERE id = ?').bind(tenantId).first();
  return row !== null;
}

// ---------------------------------------------------------------------------
// GitHub user operations
// ---------------------------------------------------------------------------

/**
 * Transform a D1 github_users row into the canonical camelCase shape.
 *
 * @param {object} row
 * @returns {object}
 */
function rowToGitHubUser(row) {
  return {
    githubId: row.github_id,
    githubLogin: row.github_login,
    tenantId: row.tenant_id,
    tosAcceptedAt: row.tos_accepted_at ?? null,
    tosVersion: row.tos_version ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Look up a GitHub user by their stable GitHub numeric ID.
 * Returns null if the user has not yet completed onboarding.
 *
 * @param {D1Database} db
 * @param {number} githubId  GitHub's stable numeric user ID
 * @returns {Promise<{ githubId: number, githubLogin: string, tenantId: string,
 *   tosAcceptedAt: string|null, tosVersion: string|null, createdAt: string } | null>}
 */
export async function findGitHubUser(db, githubId) {
  const row = await db.prepare(
    'SELECT * FROM github_users WHERE github_id = ?',
  ).bind(githubId).first();
  if (!row) return null;
  return rowToGitHubUser(row);
}

/**
 * Insert a new GitHub user record and ensure the associated tenant row exists.
 * Both statements run atomically via db.batch().
 *
 * Self-serve tenants follow the format gh-{github_numeric_id}. When these
 * tenants later create API keys via the self-serve flow, the api_keys.created_by
 * field is set to 'github:{githubId}' (e.g. 'github:12345') -- a TEXT convention
 * with no schema enforcement.
 *
 * @param {D1Database} db
 * @param {{ githubId: number, githubLogin: string, tenantId: string,
 *   tosAcceptedAt: string|null, tosVersion: string|null }} params
 * @returns {Promise<{ githubId: number, githubLogin: string, tenantId: string,
 *   tosAcceptedAt: string|null, tosVersion: string|null, createdAt: string }>}
 */
export async function createGitHubUser(db, { githubId, githubLogin, tenantId, tosAcceptedAt, tosVersion }) {
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(
      `INSERT INTO github_users (github_id, github_login, tenant_id, tos_accepted_at, tos_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(githubId, githubLogin, tenantId, tosAcceptedAt ?? null, tosVersion ?? null, createdAt),
  ]);
  return { githubId, githubLogin, tenantId, tosAcceptedAt: tosAcceptedAt ?? null, tosVersion: tosVersion ?? null, createdAt };
}

/**
 * Update the github_login display name for a GitHub user.
 * Called on every OAuth login callback to keep the display name current
 * (GitHub users can rename themselves between logins).
 *
 * @param {D1Database} db
 * @param {number} githubId
 * @param {string} githubLogin
 * @returns {Promise<void>}
 */
export async function updateGitHubLogin(db, githubId, githubLogin) {
  await db.prepare(
    `UPDATE github_users SET github_login = ?, updated_at = ? WHERE github_id = ?`,
  ).bind(githubLogin, new Date().toISOString(), githubId).run();
}

/**
 * Record ToS acceptance for a GitHub user. Idempotent -- the WHERE clause
 * prevents overwriting an existing acceptance timestamp, so repeated calls
 * are safe.
 *
 * @param {D1Database} db
 * @param {number} githubId
 * @param {string} tosVersion  The ToS version string the user accepted
 * @returns {Promise<void>}
 */
export async function acceptTos(db, githubId, tosVersion) {
  await db.prepare(
    `UPDATE github_users
     SET tos_accepted_at = ?, tos_version = ?, updated_at = ?
     WHERE github_id = ? AND tos_accepted_at IS NULL`,
  ).bind(new Date().toISOString(), tosVersion, new Date().toISOString(), githubId).run();
}

// ---------------------------------------------------------------------------
// Session operations
// ---------------------------------------------------------------------------

/**
 * Insert a new server-side session record.
 * The raw session cookie value must never be stored -- only its SHA-256 hex hash.
 *
 * @param {D1Database} db
 * @param {{ idHash: string, githubId: number, tenantId: string, expiresAt: string }} params
 * @returns {Promise<void>}
 */
export async function createSession(db, { idHash, githubId, tenantId, expiresAt }) {
  await db.prepare(
    `INSERT INTO sessions (id_hash, github_id, tenant_id, expires_at) VALUES (?, ?, ?, ?)`,
  ).bind(idHash, githubId, tenantId, expiresAt).run();
}

// ---------------------------------------------------------------------------
// Billing operations
// ---------------------------------------------------------------------------

/**
 * Set the Stripe customer ID for a tenant.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {string} customerId  Stripe's cus_xxx identifier
 * @returns {Promise<void>}
 */
export async function setStripeCustomerId(db, tenantId, customerId) {
  const updatedAt = new Date().toISOString();
  await db.prepare(
    `UPDATE tenants SET stripe_customer_id = ?, updated_at = ? WHERE id = ?`,
  ).bind(customerId, updatedAt, tenantId).run();
}

/**
 * Transition a tenant's billing_status. Validates the new status against
 * VALID_BILLING_STATUSES. Uses a WHERE clause on the current state to make
 * transitions idempotent (concurrent calls produce the same result).
 *
 * - 'grace_period' requires gracePeriodEnd (ISO 8601 timestamp).
 * - 'active' clears grace_period_end.
 * - 'blocked' leaves grace_period_end unchanged (record for audit purposes).
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {string} status  'active' | 'grace_period' | 'blocked'
 * @param {string|null} [gracePeriodEnd]  Required when status = 'grace_period'
 * @returns {Promise<void>}
 */
export async function setBillingStatus(db, tenantId, status, gracePeriodEnd = null) {
  if (!VALID_BILLING_STATUSES.includes(status)) {
    throw new Error(`Invalid billing status '${status}'; must be one of: ${VALID_BILLING_STATUSES.join(', ')}`);
  }
  const updatedAt = new Date().toISOString();

  if (status === 'grace_period') {
    // Transition to grace period: set end timestamp, only if not already in grace period
    await db.prepare(
      `UPDATE tenants
       SET billing_status = ?, grace_period_end = ?, updated_at = ?
       WHERE id = ? AND billing_status != 'grace_period'`,
    ).bind(status, gracePeriodEnd, updatedAt, tenantId).run();
  } else if (status === 'active') {
    // Transition to active: clear grace_period_end
    await db.prepare(
      `UPDATE tenants
       SET billing_status = ?, grace_period_end = NULL, updated_at = ?
       WHERE id = ? AND billing_status != 'active'`,
    ).bind(status, updatedAt, tenantId).run();
  } else {
    // 'blocked': only transition from grace_period
    await db.prepare(
      `UPDATE tenants
       SET billing_status = ?, updated_at = ?
       WHERE id = ? AND billing_status = 'grace_period'`,
    ).bind(status, updatedAt, tenantId).run();
  }
}

/**
 * Record that a tenant has added a payment method. Idempotent -- the WHERE
 * clause ensures payment_method_added_at is set only once, never overwritten.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @returns {Promise<void>}
 */
export async function setPaymentMethodAdded(db, tenantId) {
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE tenants
     SET payment_method_added_at = ?, updated_at = ?
     WHERE id = ? AND payment_method_added_at IS NULL`,
  ).bind(now, now, tenantId).run();
}

/**
 * Read billing fields for a tenant.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @returns {Promise<{
 *   stripeCustomerId: string|null,
 *   billingStatus: string,
 *   gracePeriodEnd: string|null,
 *   paymentMethodAddedAt: string|null
 * }|null>}
 */
export async function getTenantBilling(db, tenantId) {
  const row = await db.prepare(
    `SELECT stripe_customer_id, billing_status, grace_period_end, payment_method_added_at
     FROM tenants WHERE id = ?`,
  ).bind(tenantId).first();
  if (!row) return null;
  return {
    stripeCustomerId: row.stripe_customer_id ?? null,
    billingStatus: row.billing_status,
    gracePeriodEnd: row.grace_period_end ?? null,
    paymentMethodAddedAt: row.payment_method_added_at ?? null,
  };
}

/**
 * Set the eidas_qualified flag for a tenant. Creates the tenant row if absent.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export async function setEidasQualified(db, tenantId, enabled) {
  if (!TENANT_ID_RE.test(tenantId)) {
    throw new Error(`Invalid tenantId: ${tenantId}`);
  }
  const updatedAt = new Date().toISOString();
  await db.prepare(
    `INSERT INTO tenants (id, eidas_qualified, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       eidas_qualified = excluded.eidas_qualified,
       updated_at = excluded.updated_at`,
  ).bind(tenantId, enabled ? 1 : 0, updatedAt).run();
}

/**
 * Read the eidas_qualified flag for a tenant.
 * Returns false if the tenant row does not exist.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @returns {Promise<boolean>}
 */
export async function getEidasQualified(db, tenantId) {
  const row = await db.prepare(
    'SELECT eidas_qualified FROM tenants WHERE id = ?',
  ).bind(tenantId).first();
  return Boolean(row?.eidas_qualified);
}

/**
 * Look up a tenant by Stripe customer ID.
 * Used by the Stripe webhook handler to resolve the affected tenant.
 *
 * @param {D1Database} db
 * @param {string} customerId  Stripe's cus_xxx identifier
 * @returns {Promise<{
 *   id: string,
 *   billingStatus: string,
 *   gracePeriodEnd: string|null,
 *   paymentMethodAddedAt: string|null
 * }|null>}
 */
export async function getTenantByStripeCustomerId(db, customerId) {
  const row = await db.prepare(
    `SELECT id, billing_status, grace_period_end, payment_method_added_at
     FROM tenants WHERE stripe_customer_id = ?`,
  ).bind(customerId).first();
  if (!row) return null;
  return {
    id: row.id,
    billingStatus: row.billing_status,
    gracePeriodEnd: row.grace_period_end ?? null,
    paymentMethodAddedAt: row.payment_method_added_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Notification preferences operations
// ---------------------------------------------------------------------------

/**
 * Notification type keys -- single source of truth for all notification columns.
 * Used for validation and dynamic column access (SQL injection prevention).
 * Maps event type key to the column name in notification_preferences.
 */
export const NOTIFICATION_TYPES = [
  'capture_failure',
  'approaching_limit',
  'limit_reached',
  'invoice_generated',
  'payment_failure',
  'weekly_digest',
];

/**
 * Validate an email address at write time.
 * Rejects CRLF characters, null bytes, and values over 254 chars.
 * Returns null if valid, or an error message string if invalid.
 *
 * @param {string} email
 * @returns {string|null}
 */
function validateEmail(email) {
  if (typeof email !== 'string') return 'email must be a string';
  if (email.length > 254) return 'email must be 254 characters or fewer';
  if (/[\r\n\x00]/.test(email)) return 'email must not contain control characters';
  const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!EMAIL_RE.test(email)) return 'email is not a valid email address';
  return null;
}

/**
 * Transform a D1 notification_preferences row into the canonical camelCase shape.
 *
 * @param {object} row
 * @returns {object}
 */
function rowToNotificationPreferences(row) {
  return {
    tenantId: row.tenant_id,
    email: row.email ?? null,
    emailVerified: Boolean(row.email_verified),
    emailSource: row.email_source,
    notifications: {
      capture_failure:   Boolean(row.notify_capture_failure),
      approaching_limit: Boolean(row.notify_approaching_limit),
      limit_reached:     Boolean(row.notify_limit_reached),
      invoice_generated: Boolean(row.notify_invoice_generated),
      payment_failure:   Boolean(row.notify_payment_failure),
      weekly_digest:     Boolean(row.notify_weekly_digest),
    },
    pendingEmail: row.pending_email ?? null,
    verificationSentAt: row.verification_sent_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Read notification preferences for a tenant.
 * Returns null if no row exists (caller synthesises defaults).
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @returns {Promise<object|null>}
 */
export async function getNotificationPreferences(db, tenantId) {
  const row = await db.prepare(
    'SELECT * FROM notification_preferences WHERE tenant_id = ?',
  ).bind(tenantId).first();
  if (!row) return null;
  return rowToNotificationPreferences(row);
}

/**
 * UPSERT notification preferences with partial update semantics.
 * Only fields present in `fields` are changed. Recognised field names:
 *   email (string|null), emailVerified (boolean), emailSource (string),
 *   notifications (object of NOTIFICATION_TYPES keys -> boolean).
 *
 * Changing `email` resets emailVerified to false and sets emailSource to 'manual'
 * (caller may pass emailSource to override this behaviour if needed).
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {object} fields  Partial update fields
 * @returns {Promise<{ ok: true, prefs: object } | { ok: false, error: string }>}
 */
export async function upsertNotificationPreferences(db, tenantId, fields) {
  // Email validation
  if (Object.prototype.hasOwnProperty.call(fields, 'email') && fields.email !== null) {
    const err = validateEmail(fields.email);
    if (err) return { ok: false, error: err };
  }

  const updatedAt = new Date().toISOString();

  // Build the SET clause dynamically from provided fields only.
  // All column names are hardcoded here -- never interpolated from user input.
  const setClauses = ['updated_at = ?'];
  const params = [updatedAt];

  if (Object.prototype.hasOwnProperty.call(fields, 'email')) {
    setClauses.push('email = ?');
    params.push(fields.email ?? null);
    // Changing email resets verification (unless caller explicitly provides emailVerified)
    if (!Object.prototype.hasOwnProperty.call(fields, 'emailVerified')) {
      setClauses.push('email_verified = 0');
    }
    // And sets source to manual (unless caller explicitly provides emailSource)
    if (fields.email !== null && !Object.prototype.hasOwnProperty.call(fields, 'emailSource')) {
      setClauses.push("email_source = 'manual'");
    }
    // Clearing email: leave emailSource as-is (no semantic meaning with null email)
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'emailVerified')) {
    setClauses.push('email_verified = ?');
    params.push(fields.emailVerified ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'emailSource')) {
    setClauses.push('email_source = ?');
    params.push(fields.emailSource);
  }

  if (fields.notifications && typeof fields.notifications === 'object') {
    const colMap = {
      capture_failure:   'notify_capture_failure',
      approaching_limit: 'notify_approaching_limit',
      limit_reached:     'notify_limit_reached',
      invoice_generated: 'notify_invoice_generated',
      payment_failure:   'notify_payment_failure',
      weekly_digest:     'notify_weekly_digest',
    };
    for (const [key, col] of Object.entries(colMap)) {
      if (Object.prototype.hasOwnProperty.call(fields.notifications, key)) {
        setClauses.push(`${col} = ?`);
        params.push(fields.notifications[key] ? 1 : 0);
      }
    }
  }

  const setClause = setClauses.join(', ');

  // Two-step: INSERT OR IGNORE to create the row with schema defaults, then
  // UPDATE with the requested fields. This avoids the ON CONFLICT pattern where
  // the SET clause does not execute on the first insert (only on conflict).
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare('INSERT OR IGNORE INTO notification_preferences (tenant_id) VALUES (?)').bind(tenantId),
    db.prepare(`UPDATE notification_preferences SET ${setClause} WHERE tenant_id = ?`).bind(...params, tenantId),
  ]);

  const row = await db.prepare(
    'SELECT * FROM notification_preferences WHERE tenant_id = ?',
  ).bind(tenantId).first();

  return { ok: true, prefs: rowToNotificationPreferences(row) };
}

/**
 * Set a specific notification type to 0 (unsubscribed) for a tenant.
 * Creates the preferences row if it does not exist.
 *
 * IMPORTANT: eventType is validated against NOTIFICATION_TYPES before use.
 * Never interpolate unvalidated strings into SQL column names.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {string} eventType  Must be in NOTIFICATION_TYPES
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function unsubscribeNotificationType(db, tenantId, eventType) {
  if (!NOTIFICATION_TYPES.includes(eventType)) {
    return { ok: false, error: `Unknown notification type: ${eventType}` };
  }
  // Column name is safe: derived from the NOTIFICATION_TYPES allowlist above
  const col = `notify_${eventType}`;
  const updatedAt = new Date().toISOString();

  await db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId).run();

  await db.prepare(
    `INSERT INTO notification_preferences (tenant_id, ${col}, updated_at)
     VALUES (?, 0, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET ${col} = 0, updated_at = excluded.updated_at`,
  ).bind(tenantId, updatedAt).run();

  return { ok: true };
}

/**
 * Check whether a notification has already been sent for the given period + event_type.
 * Returns true if a row exists (already sent), false otherwise.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {string} period  'YYYY-MM' format
 * @param {string} eventType
 * @returns {Promise<boolean>}
 */
export async function checkNotificationSent(db, tenantId, period, eventType) {
  const row = await db.prepare(
    'SELECT 1 FROM notification_sent WHERE tenant_id = ? AND period = ? AND event_type = ?',
  ).bind(tenantId, period, eventType).first();
  return row !== null;
}

/**
 * Record that a notification has been sent for the given period + event_type.
 * INSERT OR IGNORE makes this idempotent.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {string} period  'YYYY-MM' format
 * @param {string} eventType
 * @returns {Promise<void>}
 */
export async function markNotificationSent(db, tenantId, period, eventType) {
  await db.prepare(
    'INSERT OR IGNORE INTO notification_sent (tenant_id, period, event_type) VALUES (?, ?, ?)',
  ).bind(tenantId, period, eventType).run();
}

/**
 * Delete notification preferences for a tenant (right-to-erasure / GDPR).
 * Also removes the notification_sent deduplication rows for this tenant.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @returns {Promise<void>}
 */
export async function deleteNotificationPreferences(db, tenantId) {
  await db.batch([
    db.prepare('DELETE FROM notification_sent WHERE tenant_id = ?').bind(tenantId),
    db.prepare('DELETE FROM notification_preferences WHERE tenant_id = ?').bind(tenantId),
  ]);
}

/**
 * Set the pending email and record the verification send timestamp.
 * Creates the preferences row if it does not exist.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {string} email  The new address awaiting verification
 * @returns {Promise<void>}
 */
export async function setPendingEmail(db, tenantId, email) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare('INSERT OR IGNORE INTO notification_preferences (tenant_id) VALUES (?)').bind(tenantId),
    db.prepare(
      `UPDATE notification_preferences
          SET pending_email = ?, verification_sent_at = ?, updated_at = ?
        WHERE tenant_id = ?`,
    ).bind(email, now, now, tenantId),
  ]);
}

/**
 * Atomically promote pending_email to the verified primary email.
 * Sets email = pending_email, email_verified = 1, email_source = 'manual',
 * and clears pending_email and verification_sent_at.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {string} expectedEmail - must match pending_email for the swap to proceed (TOCTOU guard)
 * @returns {Promise<{ ok: true, prefs: object } | { ok: false, error: string }>}
 */
export async function swapVerifiedEmail(db, tenantId, expectedEmail) {
  const now = new Date().toISOString();
  const result = await db.prepare(
    `UPDATE notification_preferences
        SET email                = pending_email,
            email_verified       = 1,
            email_source         = 'manual',
            pending_email        = NULL,
            verification_sent_at = NULL,
            updated_at           = ?
      WHERE tenant_id = ?
        AND pending_email = ?`,
  ).bind(now, tenantId, expectedEmail).run();

  if (result.meta.changes === 0) {
    return { ok: false, error: 'no pending email verification found' };
  }

  const row = await db.prepare(
    'SELECT * FROM notification_preferences WHERE tenant_id = ?',
  ).bind(tenantId).first();

  return { ok: true, prefs: rowToNotificationPreferences(row) };
}

/**
 * Clear any in-flight email verification for a tenant without promoting it.
 * No-op if no pending verification exists.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @returns {Promise<void>}
 */
export async function clearPendingEmail(db, tenantId) {
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE notification_preferences
        SET pending_email = NULL, verification_sent_at = NULL, updated_at = ?
      WHERE tenant_id = ?`,
  ).bind(now, tenantId).run();
}

/**
 * Fetch a session record joined with GitHub user display info.
 * Does NOT filter by expiry -- the caller is responsible for checking
 * expiresAt (expired records may still be needed for logging purposes).
 *
 * @param {D1Database} db
 * @param {string} idHash  SHA-256 hex of the session cookie value
 * @returns {Promise<{ idHash: string, githubId: number, tenantId: string,
 *   githubLogin: string, tosAcceptedAt: string|null,
 *   createdAt: string, expiresAt: string } | null>}
 */
export async function getSession(db, idHash) {
  const row = await db.prepare(
    `SELECT s.id_hash, s.github_id, s.tenant_id, s.created_at, s.expires_at,
            u.github_login, u.tos_accepted_at
     FROM sessions s
     JOIN github_users u ON s.github_id = u.github_id
     WHERE s.id_hash = ?`,
  ).bind(idHash).first();
  if (!row) return null;
  return {
    idHash: row.id_hash,
    githubId: row.github_id,
    tenantId: row.tenant_id,
    githubLogin: row.github_login,
    tosAcceptedAt: row.tos_accepted_at ?? null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Delete a single session by its hash. Used on explicit logout.
 *
 * @param {D1Database} db
 * @param {string} idHash  SHA-256 hex of the session cookie value
 * @returns {Promise<void>}
 */
export async function deleteSession(db, idHash) {
  await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(idHash).run();
}

/**
 * Purge all sessions whose expires_at timestamp has passed.
 * Intended to be called periodically (e.g. from a Cron Trigger).
 *
 * @param {D1Database} db
 * @returns {Promise<number>} Count of deleted rows
 */
export async function deleteExpiredSessions(db) {
  const result = await db.prepare(
    `DELETE FROM sessions WHERE expires_at < datetime('now')`,
  ).run();
  return result.meta.changes ?? 0;
}

/**
 * Delete all active sessions for a GitHub user. Used when a user account
 * is deleted or when a forced sign-out of all devices is required.
 *
 * @param {D1Database} db
 * @param {number} githubId
 * @returns {Promise<void>}
 */
export async function deleteSessionsForUser(db, githubId) {
  await db.prepare('DELETE FROM sessions WHERE github_id = ?').bind(githubId).run();
}

// ---------------------------------------------------------------------------
// Schedule operations
// ---------------------------------------------------------------------------

/** Default maximum number of schedules per tenant (no config override present). */
const DEFAULT_SCHEDULE_LIMIT = 10;

/**
 * Transform a D1 schedules row into the canonical camelCase shape.
 * Converts paused INTEGER to boolean.
 *
 * @param {object} row
 * @returns {object}
 */
function rowToSchedule(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    url: row.url,
    name: row.name,
    cron: row.cron,
    paused: Boolean(row.paused),
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at ?? null,
    lastCaptureId: row.last_capture_id ?? null,
    lastCaptureStatus: row.last_capture_status ?? null,
    changeSummary: row.change_summary ? JSON.parse(row.change_summary) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Insert a new schedule and ensure the tenant row exists.
 * Both statements run atomically via db.batch().
 *
 * @param {D1Database} db
 * @param {string} id          Schedule ID (sch_ + 32 hex chars)
 * @param {string} tenantId
 * @param {string} url
 * @param {string} name
 * @param {string} cron        Cron expression string
 * @param {string} nextRunAt   ISO 8601 timestamp of first scheduled run
 * @returns {Promise<object>}  The created schedule record
 */
export async function createSchedule(db, id, tenantId, url, name, cron, nextRunAt) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(tenantId),
    db.prepare(
      `INSERT INTO schedules (id, tenant_id, url, name, cron, next_run_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, tenantId, url, name, cron, nextRunAt),
  ]);

  const row = await db.prepare('SELECT * FROM schedules WHERE id = ?').bind(id).first();
  return rowToSchedule(row);
}

/**
 * Read a single schedule by ID, scoped to tenantId for authorization (IDOR protection).
 * Returns null if not found or tenant does not match.
 *
 * @param {D1Database} db
 * @param {string} id
 * @param {string} tenantId
 * @returns {Promise<object|null>}
 */
export async function getSchedule(db, id, tenantId) {
  const row = await db.prepare(
    'SELECT * FROM schedules WHERE id = ? AND tenant_id = ?',
  ).bind(id, tenantId).first();
  if (!row) return null;
  return rowToSchedule(row);
}

/**
 * List all schedules for a tenant, ordered by created_at descending.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @returns {Promise<object[]>}
 */
export async function listSchedules(db, tenantId) {
  const rows = await db.prepare(
    `SELECT s.*, c.change_summary
     FROM schedules s
     LEFT JOIN captures c ON s.last_capture_id = c.id
     WHERE s.tenant_id = ?
     ORDER BY s.created_at DESC`,
  ).bind(tenantId).all();
  return (rows.results ?? []).map(rowToSchedule);
}

/**
 * Delete a schedule by ID, scoped to tenantId for authorization.
 * Nulls out schedule_id on any captures referencing this schedule before deleting,
 * both operations in a single db.batch() round-trip.
 * Returns { deleted: true } on success, null if not found or wrong tenant.
 *
 * @param {D1Database} db
 * @param {string} id
 * @param {string} tenantId
 * @returns {Promise<{ deleted: true }|null>}
 */
export async function deleteSchedule(db, id, tenantId) {
  // Verify ownership first to distinguish "not found / wrong tenant" from "found and deleted".
  const existing = await db.prepare(
    'SELECT id FROM schedules WHERE id = ? AND tenant_id = ?',
  ).bind(id, tenantId).first();
  if (!existing) return null;

  await db.batch([
    db.prepare(
      'UPDATE captures SET schedule_id = NULL WHERE schedule_id = ?',
    ).bind(id),
    db.prepare(
      'DELETE FROM schedules WHERE id = ? AND tenant_id = ?',
    ).bind(id, tenantId),
  ]);

  return { deleted: true };
}

/**
 * Count all schedules for a tenant.
 * Used to enforce the per-tenant schedule limit.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @returns {Promise<number>}
 */
export async function countSchedules(db, tenantId) {
  const row = await db.prepare(
    'SELECT COUNT(*) AS total FROM schedules WHERE tenant_id = ?',
  ).bind(tenantId).first();
  return row?.total ?? 0;
}

/**
 * Fetch all unpaused schedules whose next_run_at is at or before the given timestamp.
 * Used by the Cron Trigger handler to find work due for execution.
 * Results are ordered by tenant_id for deterministic processing.
 *
 * @param {D1Database} db
 * @param {string} asOf  ISO 8601 timestamp (e.g. new Date().toISOString())
 * @returns {Promise<object[]>}
 */
export async function getDueSchedules(db, asOf) {
  const rows = await db.prepare(
    `SELECT * FROM schedules WHERE paused = 0 AND next_run_at <= ? ORDER BY tenant_id`,
  ).bind(asOf).all();
  return (rows.results ?? []).map(rowToSchedule);
}

/**
 * Advance a schedule after a successful run. CAS-style: only updates if the
 * schedule is still unpaused (guards against a race where the schedule was
 * paused between getDueSchedules and the worker completing).
 *
 * Updates next_run_at, last_run_at, last_capture_id, last_capture_status, and updated_at.
 *
 * @param {D1Database} db
 * @param {string} id               Schedule ID
 * @param {string} nextRunAt        ISO 8601 timestamp of the next run
 * @param {string} lastCaptureId    Capture ID that was just dispatched
 * @param {string} lastCaptureStatus  Status at dispatch time (typically 'pending')
 * @returns {Promise<number>}  Rows affected -- 0 means the schedule was paused or deleted
 */
export async function advanceSchedule(db, id, nextRunAt, lastCaptureId, lastCaptureStatus) {
  const result = await db.prepare(
    `UPDATE schedules
     SET next_run_at = ?,
         last_run_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         last_capture_id = ?,
         last_capture_status = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ? AND paused = 0`,
  ).bind(nextRunAt, lastCaptureId, lastCaptureStatus, id).run();
  return result.meta.changes ?? 0;
}

/**
 * Return the effective maximum number of schedules a tenant may create.
 * Reads the per-tenant config override when present; falls back to the
 * module-level DEFAULT_SCHEDULE_LIMIT. Pure function -- no DB call.
 *
 * @param {object|null} tenantConfig  From getTenantConfig(), may be null
 * @returns {number}
 */
export function getEffectiveScheduleLimit(tenantConfig) {
  return tenantConfig?.schedules?.maxSchedules ?? DEFAULT_SCHEDULE_LIMIT;
}

// ---------------------------------------------------------------------------
// Threat intelligence / quarantine operations
// ---------------------------------------------------------------------------

/**
 * Set the threat_check result on a capture (called during capture creation).
 * Also stamps last_threat_check_at so the re-scan cron ignores this capture
 * until the check interval has elapsed.
 *
 * @param {D1Database} db
 * @param {string} captureId
 * @param {'pass'|'unavailable'} value
 * @returns {Promise<void>}
 */
export async function setCaptureThreatCheck(db, captureId, value) {
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE captures
     SET threat_check = ?, last_threat_check_at = ?
     WHERE id = ?`,
  ).bind(value, now, captureId).run();
}

/**
 * Quarantine a single complete, non-quarantined capture by ID.
 * Sets quarantined=1, quarantine_reason, quarantined_at, and inserts an
 * audit row into threat_checks. Both writes run atomically via db.batch().
 * The WHERE clause is idempotent: a second call on an already-quarantined
 * capture produces zero changes and no duplicate audit row.
 *
 * Used by the re-scan handler when quarantining by URL is not desired
 * (e.g. when only a specific snapshot needs to be blocked).
 *
 * @param {D1Database} db
 * @param {string} captureId
 * @param {string} reason        Threat type string (e.g. 'MALWARE')
 * @param {string|null} threatTypes  Raw threat type string(s) from provider
 * @returns {Promise<number>}  Rows affected on the captures UPDATE (0 = no-op)
 */
export async function quarantineCapture(db, captureId, reason, threatTypes) {
  const now = new Date().toISOString();
  const [captureResult] = await db.batch([
    db.prepare(
      `UPDATE captures
       SET quarantined = 1, quarantine_reason = ?, quarantined_at = ?
       WHERE id = ? AND status = 'complete' AND quarantined = 0`,
    ).bind(reason, now, captureId),
    db.prepare(
      `INSERT INTO threat_checks (capture_id, checked_at, verdict, threat_types)
       VALUES (?, ?, 'threat', ?)`,
    ).bind(captureId, now, threatTypes ?? null),
  ]);
  return captureResult.meta.changes ?? 0;
}

/**
 * Quarantine ALL complete, non-quarantined captures sharing a given URL.
 * Returns an array of { captureId, tenantId } objects for every row that was
 * updated -- callers use this to dispatch quarantine webhooks per tenant.
 * Uses db.batch() for atomicity: SELECT + batch of UPDATE/INSERT statements.
 *
 * @param {D1Database} db
 * @param {string} url
 * @param {string} reason        Threat type string (e.g. 'MALWARE')
 * @param {string|null} threatTypes  Raw threat type string(s) from provider
 * @returns {Promise<Array<{ captureId: string, tenantId: string }>>}
 */
export async function quarantineCapturesByUrl(db, url, reason, threatTypes) {
  // Fetch the captures to quarantine first so we can return tenantId per capture
  // and build the batch update list.
  const { results } = await db.prepare(
    `SELECT id, tenant_id FROM captures
     WHERE url = ? AND status = 'complete' AND quarantined = 0`,
  ).bind(url).all();

  if (!results || results.length === 0) return [];

  const now = new Date().toISOString();
  const statements = [];

  for (const row of results) {
    statements.push(
      db.prepare(
        `UPDATE captures
         SET quarantined = 1, quarantine_reason = ?, quarantined_at = ?
         WHERE id = ? AND status = 'complete' AND quarantined = 0`,
      ).bind(reason, now, row.id),
    );
    statements.push(
      db.prepare(
        `INSERT INTO threat_checks (capture_id, checked_at, verdict, threat_types)
         VALUES (?, ?, 'threat', ?)`,
      ).bind(row.id, now, threatTypes ?? null),
    );
  }

  await db.batch(statements);

  return results.map(row => ({ captureId: row.id, tenantId: row.tenant_id }));
}

/**
 * Record a completed threat check for a capture and advance its last_threat_check_at
 * timestamp. Both the audit insert and the timestamp update run atomically via
 * db.batch(). Called for 'safe' and 'threat' verdicts alike.
 *
 * @param {D1Database} db
 * @param {string} captureId
 * @param {'safe'|'threat'} verdict
 * @param {string|null} threatTypes  Raw threat type string(s); NULL on 'safe'
 * @returns {Promise<void>}
 */
export async function recordThreatCheck(db, captureId, verdict, threatTypes) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO threat_checks (capture_id, checked_at, verdict, threat_types)
       VALUES (?, ?, ?, ?)`,
    ).bind(captureId, now, verdict, threatTypes ?? null),
    db.prepare(
      `UPDATE captures SET last_threat_check_at = ? WHERE id = ?`,
    ).bind(now, captureId),
  ]);
}

/**
 * Return captures that need a threat re-scan.
 * Selects complete, non-quarantined captures whose last_threat_check_at is
 * either NULL (never checked) or older than the given olderThan timestamp.
 * Results are de-duplicated by URL so the cron handler checks each URL once
 * regardless of how many captures share it.
 *
 * SQLite ASC ordering puts NULLs first, so never-checked captures are always
 * processed before recently-checked ones.
 *
 * @param {D1Database} db
 * @param {string} olderThan  ISO 8601 timestamp -- captures checked before this are included
 * @param {number} [limit=500]  Maximum rows to return (API call budget control)
 * @returns {Promise<Array<{ captureId: string, url: string, tenantId: string }>>}
 */
export async function listCapturesNeedingThreatCheck(db, olderThan, limit = 500) {
  const { results } = await db.prepare(
    `SELECT MIN(id) AS capture_id, url, MIN(tenant_id) AS tenant_id
     FROM captures
     WHERE status = 'complete'
       AND quarantined = 0
       AND (last_threat_check_at IS NULL OR last_threat_check_at < ?)
     GROUP BY url
     ORDER BY MIN(last_threat_check_at) ASC
     LIMIT ?`,
  ).bind(olderThan, limit).all();

  return (results ?? []).map(row => ({
    captureId: row.capture_id,
    url: row.url,
    tenantId: row.tenant_id,
  }));
}

// ---------------------------------------------------------------------------
// Change detection
// ---------------------------------------------------------------------------

/**
 * Find the most recent complete capture for a schedule created before the
 * given capture. Uses two sequential queries to avoid OFFSET-based fragility
 * with historical data.
 *
 * @param {D1Database} db
 * @param {string} scheduleId
 * @param {string} captureId  The current capture to look behind
 * @returns {Promise<string|null>}  The previous capture's ID, or null if none
 */
export async function getPreviousCaptureId(db, scheduleId, captureId) {
  const current = await db.prepare(
    'SELECT created_at FROM captures WHERE id = ?',
  ).bind(captureId).first();
  if (!current) return null;

  const previous = await db.prepare(
    `SELECT id FROM captures
     WHERE schedule_id = ? AND status = 'complete' AND created_at < ?
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(scheduleId, current.created_at).first();

  return previous?.id ?? null;
}

/**
 * Persist a JSON change summary on a capture record. Called asynchronously
 * after capture completion once the diff has been computed.
 *
 * @param {D1Database} db
 * @param {string} captureId
 * @param {object} summary  Plain JS object matching the change_summary JSON schema
 * @returns {Promise<void>}
 */
export async function setChangeSummary(db, captureId, summary) {
  await db.prepare(
    'UPDATE captures SET change_summary = ? WHERE id = ?',
  ).bind(JSON.stringify(summary), captureId).run();
}

// ---------------------------------------------------------------------------
// Admin dashboard operations
// ---------------------------------------------------------------------------

/**
 * List all tenants with their current-period usage counters in a single query.
 * Active key count is included as a correlated subquery so no second round-trip
 * is needed. Tenants with no usage row for the period return zeroed counters via
 * COALESCE.
 *
 * @param {D1Database} db
 * @param {string} period  'YYYY-MM' billing period (use computePeriod() for current)
 * @returns {Promise<Array<{
 *   id: string,
 *   tier: string,
 *   billingStatus: string,
 *   paymentMethodAddedAt: string|null,
 *   eidasQualified: boolean,
 *   config: string|null,
 *   createdAt: string,
 *   captureCount: number,
 *   storageBytes: number,
 *   apiCallCount: number,
 *   eidasCaptureCount: number,
 *   keyCount: number
 * }>>}
 */
export async function listTenantsWithUsage(db, period) {
  const { results } = await db.prepare(
    `SELECT
       t.id,
       t.tier,
       t.billing_status,
       t.payment_method_added_at,
       t.eidas_qualified,
       t.config,
       t.created_at,
       COALESCE(u.capture_count, 0) AS capture_count,
       COALESCE(u.storage_bytes, 0) AS storage_bytes,
       COALESCE(u.api_call_count, 0) AS api_call_count,
       COALESCE(u.eidas_capture_count, 0) AS eidas_capture_count,
       (SELECT COUNT(*) FROM api_keys ak WHERE ak.tenant_id = t.id AND ak.revoked = 0) AS key_count
     FROM tenants t
     LEFT JOIN usage_counters u
       ON u.tenant_id = t.id AND u.period = ?
     ORDER BY t.created_at DESC`,
  ).bind(period).all();

  return (results ?? []).map(row => ({
    id: row.id,
    tier: row.tier,
    billingStatus: row.billing_status,
    paymentMethodAddedAt: row.payment_method_added_at ?? null,
    eidasQualified: Boolean(row.eidas_qualified),
    config: row.config ?? null,
    createdAt: row.created_at,
    captureCount: row.capture_count,
    storageBytes: row.storage_bytes,
    apiCallCount: row.api_call_count,
    eidasCaptureCount: row.eidas_capture_count,
    keyCount: row.key_count,
  }));
}

/**
 * Return comprehensive data for a single tenant in one db.batch() round-trip:
 * the tenant row, recent usage history, and active API key summaries.
 *
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {number} [periodLimit=6]  Number of billing periods of history to return
 * @returns {Promise<{
 *   tenant: object,
 *   usageHistory: object[],
 *   keys: object[]
 * }|null>}  null if the tenant does not exist
 */
export async function getTenantDetail(db, tenantId, periodLimit = 6) {
  const [tenantResult, usageResult, keysResult] = await db.batch([
    db.prepare('SELECT * FROM tenants WHERE id = ?').bind(tenantId),
    db.prepare(
      `SELECT period, capture_count, storage_bytes, api_call_count, eidas_capture_count, updated_at
       FROM usage_counters WHERE tenant_id = ? ORDER BY period DESC LIMIT ?`,
    ).bind(tenantId, periodLimit),
    db.prepare(
      `SELECT key_hash, name, scopes, created_at, created_by
       FROM api_keys WHERE tenant_id = ? AND revoked = 0 ORDER BY created_at DESC`,
    ).bind(tenantId),
  ]);

  const tenantRow = tenantResult.results?.[0] ?? null;
  if (!tenantRow) return null;

  const tenant = {
    id: tenantRow.id,
    tier: tenantRow.tier,
    billingStatus: tenantRow.billing_status,
    gracePeriodEnd: tenantRow.grace_period_end ?? null,
    paymentMethodAddedAt: tenantRow.payment_method_added_at ?? null,
    stripeCustomerId: tenantRow.stripe_customer_id ?? null,
    eidasQualified: Boolean(tenantRow.eidas_qualified),
    config: tenantRow.config ?? null,
    createdAt: tenantRow.created_at,
    updatedAt: tenantRow.updated_at ?? null,
  };

  const usageHistory = (usageResult.results ?? []).map(row => ({
    period: row.period,
    captureCount: row.capture_count,
    storageBytes: row.storage_bytes,
    apiCallCount: row.api_call_count,
    eidasCaptureCount: row.eidas_capture_count ?? 0,
    updatedAt: row.updated_at ?? null,
  }));

  const keys = (keysResult.results ?? []).map(row => ({
    keyHash: row.key_hash,
    name: row.name,
    scopes: JSON.parse(row.scopes),
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));

  return { tenant, usageHistory, keys };
}

/**
 * Return platform-wide aggregate statistics in a single db.batch() round-trip.
 * Tenant breakdown and usage aggregates are fetched simultaneously and merged
 * into a flat result object.
 *
 * @param {D1Database} db
 * @param {string} period  'YYYY-MM' billing period for current-period metrics
 * @returns {Promise<{
 *   totalTenants: number,
 *   tenantsByTier: { free: number, pro: number },
 *   tenantsByBillingStatus: { active: number, gracePeriod: number, blocked: number },
 *   totalCapturesCurrentPeriod: number,
 *   totalCapturesAllTime: number,
 *   currentPeriodStorageBytes: number,
 *   totalEidasCaptures: number,
 *   activeApiKeys: number
 * }>}
 */
export async function getOverviewStats(db, period) {
  const [tenantsResult, usageResult] = await db.batch([
    db.prepare(
      `SELECT
         COUNT(*) AS total_tenants,
         SUM(CASE WHEN tier = 'free' THEN 1 ELSE 0 END) AS free_count,
         SUM(CASE WHEN tier = 'pro' THEN 1 ELSE 0 END) AS pro_count,
         SUM(CASE WHEN billing_status = 'active' THEN 1 ELSE 0 END) AS active_count,
         SUM(CASE WHEN billing_status = 'grace_period' THEN 1 ELSE 0 END) AS grace_count,
         SUM(CASE WHEN billing_status = 'blocked' THEN 1 ELSE 0 END) AS blocked_count,
         (SELECT COUNT(*) FROM api_keys WHERE revoked = 0) AS active_api_keys
       FROM tenants`,
    ),
    db.prepare(
      `SELECT
         SUM(CASE WHEN period = ? THEN capture_count ELSE 0 END) AS current_captures,
         SUM(capture_count) AS all_time_captures,
         SUM(CASE WHEN period = ? THEN storage_bytes ELSE 0 END) AS current_storage,
         SUM(CASE WHEN period = ? THEN eidas_capture_count ELSE 0 END) AS current_eidas_captures
       FROM usage_counters`,
    ).bind(period, period, period),
  ]);

  const t = tenantsResult.results?.[0] ?? {};
  const u = usageResult.results?.[0] ?? {};

  return {
    totalTenants: t.total_tenants ?? 0,
    tenantsByTier: {
      free: t.free_count ?? 0,
      pro: t.pro_count ?? 0,
    },
    tenantsByBillingStatus: {
      active: t.active_count ?? 0,
      gracePeriod: t.grace_count ?? 0,
      blocked: t.blocked_count ?? 0,
    },
    totalCapturesCurrentPeriod: u.current_captures ?? 0,
    totalCapturesAllTime: u.all_time_captures ?? 0,
    currentPeriodStorageBytes: u.current_storage ?? 0,
    totalEidasCaptures: u.current_eidas_captures ?? 0,
    activeApiKeys: t.active_api_keys ?? 0,
  };
}

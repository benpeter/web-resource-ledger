/*
 * share-tokens.js -- Share token generation, hashing, and D1 storage for WRL
 *
 * Share tokens grant read-only access to a specific capture without requiring
 * the owner's API key. The token is a URL-safe opaque string stored only as
 * a SHA-256 hash in D1 (never in plaintext).
 *
 * Token format:
 *   wrl_share_ (10 chars) + base64url(32 random bytes, no padding) (43 chars)
 *   = 53 characters total, 256 bits of entropy
 *
 * Storage:
 *   SHA-256(rawToken) as 64-char lowercase hex -- same pattern as api_keys.
 *   Lookup is a single D1 PK read: O(1).
 *
 * Security invariants:
 *   - Raw tokens are NEVER stored in D1
 *   - Raw tokens are NEVER logged (log tokenHash.slice(0,8) for correlation)
 *   - Expiry is enforced server-side on every request (expires_at checked after lookup)
 *   - Share tokens are scoped to a single capture (scopedCaptureId check in handlers)
 *
 * Tests: test/share-token.test.js
 */ // tva

/**
 * Generate a cryptographically random share token.
 * Returns the raw token string (not hashed).
 *
 * Format: wrl_share_ + base64url(32 random bytes, no padding)
 *
 * @returns {string}
 */
export function generateShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  // base64url encoding: use + -> -, / -> _, strip = padding
  const base64 = btoa(String.fromCharCode(...bytes));
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `wrl_share_${base64url}`;
}

/**
 * Hash a raw share token with SHA-256, returning lowercase hex (64 chars).
 * Used for D1 storage and safe logging (prefix only).
 *
 * @param {string} rawToken
 * @returns {Promise<string>}
 */
export async function hashShareToken(rawToken) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(rawToken));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Insert a new share token record into D1.
 * The caller is responsible for generating and hashing the token before calling this.
 *
 * @param {D1Database} db
 * @param {object} params
 * @param {string} params.tokenHash    SHA-256 hex of the raw token (64 chars)
 * @param {string} params.captureId    Capture this token grants access to
 * @param {string} params.tenantId     Owning tenant
 * @param {string|null} params.expiresAt  ISO 8601 expiry or null for permanent
 * @returns {Promise<object>}  The inserted row
 */
export async function createShareToken(db, { tokenHash, captureId, tenantId, expiresAt }) {
  const createdAt = new Date().toISOString();
  await db.prepare(
    `INSERT INTO share_tokens (token_hash, capture_id, tenant_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(tokenHash, captureId, tenantId, createdAt, expiresAt ?? null).run();

  return { tokenHash, captureId, tenantId, createdAt, expiresAt: expiresAt ?? null };
}

/**
 * Retrieve a share token record by its hash (PK lookup).
 * Does NOT check expiry -- the caller must check expires_at.
 *
 * @param {D1Database} db
 * @param {string} tokenHash  64-char SHA-256 hex
 * @returns {Promise<object|null>}
 */
export async function getShareTokenByHash(db, tokenHash) {
  const row = await db.prepare(
    'SELECT token_hash, capture_id, tenant_id, created_at, expires_at FROM share_tokens WHERE token_hash = ?',
  ).bind(tokenHash).first();
  if (!row) return null;
  return {
    tokenHash: row.token_hash,
    captureId: row.capture_id,
    tenantId: row.tenant_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? null,
  };
}

/**
 * Delete all expired share tokens.
 * Intended for the cleanup cron trigger.
 *
 * @param {D1Database} db
 * @returns {Promise<number>}  Number of deleted rows
 */
export async function deleteExpiredShareTokens(db) {
  const result = await db.prepare(
    `DELETE FROM share_tokens WHERE expires_at IS NOT NULL AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run();
  return result.meta.changes ?? 0;
}

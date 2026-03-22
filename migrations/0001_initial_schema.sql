-- WRL initial D1 schema
-- Migrates metadata from KV to structured SQLite tables.
-- KV is retained only for rate limit counters (rl:* keys).
--
-- PRAGMA foreign_keys = ON is included so that FK constraints are
-- enforced during migration execution. At runtime, D1 enforces FKs
-- per-session; the application layer relies on its own validation.
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- tenants
-- Explicit tenant registry. Previously implicit in KV key prefixes.
-- id must match TENANT_ID_RE: /^[a-z0-9_-]{1,64}$/
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id          TEXT    NOT NULL PRIMARY KEY
                        CHECK (id GLOB '[a-z0-9_-]*'
                               AND length(id) >= 1
                               AND length(id) <= 64),
  config      TEXT,   -- JSON: rate limit overrides, future settings; nullable
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT,
  updated_by  TEXT
);

-- ---------------------------------------------------------------------------
-- captures
-- Structured columns for queryable fields; opaque blobs stored as JSON.
-- id format: cap_ + 32 lowercase hex chars (total length 36)
-- ---------------------------------------------------------------------------
CREATE TABLE captures (
  id               TEXT    NOT NULL PRIMARY KEY
                             CHECK (id GLOB 'cap_[a-f0-9]*' AND length(id) = 36),
  tenant_id        TEXT    NOT NULL REFERENCES tenants(id),
  status           TEXT    NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  url              TEXT    NOT NULL,
  ip               TEXT,
  created_at       TEXT    NOT NULL,
  completed_at     TEXT,
  failed_at        TEXT,
  error            TEXT,
  retryable        INTEGER CHECK (retryable IN (0, 1)),
  render_quality   TEXT    CHECK (render_quality IN ('full', 'partial')),
  artifacts        TEXT,   -- JSON
  wacz             TEXT,   -- JSON
  render           TEXT,   -- JSON
  capture_settings TEXT    -- JSON
);

-- Primary listing query: tenant captures in reverse chronological order
CREATE INDEX idx_captures_tenant_created
  ON captures (tenant_id, created_at DESC);

-- Filtered listing: tenant + status + reverse chronological order
CREATE INDEX idx_captures_tenant_status_created
  ON captures (tenant_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- api_keys
-- Keyed by SHA-256 hash of the raw key. Natural PK, no auto-increment.
-- key_hash: 64 lowercase hex chars
-- ---------------------------------------------------------------------------
CREATE TABLE api_keys (
  key_hash    TEXT    NOT NULL PRIMARY KEY
                        CHECK (length(key_hash) = 64),
  tenant_id   TEXT    NOT NULL REFERENCES tenants(id),
  scopes      TEXT    NOT NULL, -- JSON array
  name        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  created_by  TEXT    NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
  revoked_at  TEXT
);

-- Tenant key listing with revocation filter
CREATE INDEX idx_api_keys_tenant
  ON api_keys (tenant_id, revoked, created_at);

-- ---------------------------------------------------------------------------
-- signing_keys
-- Archived Ed25519 public keys. Tiny table -- single-digit rows over service lifetime.
-- key_id: first 8 hex chars of SHA-256(raw public key bytes)
-- ---------------------------------------------------------------------------
CREATE TABLE signing_keys (
  id          TEXT    NOT NULL PRIMARY KEY
                        CHECK (length(id) = 8),
  algorithm   TEXT    NOT NULL DEFAULT 'Ed25519',
  public_key  TEXT    NOT NULL,
  archived_at TEXT    NOT NULL
);

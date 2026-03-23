-- WRL GitHub OAuth schema
-- Supports self-serve tenant onboarding via GitHub OAuth.
-- OAuth state parameters are stored in KV (not here).
-- Session cookie values are never stored -- only their SHA-256 hashes.
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- github_users
-- Maps a GitHub identity to a WRL tenant. One row per GitHub account.
-- github_id is GitHub's stable numeric user ID (survives login renames).
-- github_login is the mutable display name, refreshed on each OAuth callback.
-- tenant_id follows the format gh-{github_numeric_id} for self-serve tenants.
-- tos_accepted_at / tos_version are NULL until the user accepts the ToS;
-- tos_version is retained so future ToS revisions can trigger re-consent.
-- ---------------------------------------------------------------------------
CREATE TABLE github_users (
  github_id       INTEGER NOT NULL PRIMARY KEY,
  github_login    TEXT    NOT NULL,
  tenant_id       TEXT    NOT NULL REFERENCES tenants(id),
  tos_accepted_at TEXT,
  tos_version     TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT,
  UNIQUE (tenant_id)        -- one GitHub account per tenant, one tenant per GitHub account
);

-- ---------------------------------------------------------------------------
-- sessions
-- Server-side session records for cookie-based auth.
-- id_hash: SHA-256 (hex) of the session cookie value -- same hash-before-store
-- pattern as api_keys. The raw cookie value is never persisted.
-- tenant_id is denormalized from github_users to avoid a JOIN on the hot path.
-- expires_at is an ISO 8601 timestamp; expired rows are cleaned up periodically.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id_hash     TEXT    NOT NULL PRIMARY KEY
                        CHECK (length(id_hash) = 64),
  github_id   INTEGER NOT NULL REFERENCES github_users(github_id),
  tenant_id   TEXT    NOT NULL REFERENCES tenants(id),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT    NOT NULL
);

-- All active sessions for a given GitHub user, most recent first
CREATE INDEX idx_sessions_github_id
  ON sessions (github_id, created_at DESC);

-- Expired session cleanup: find rows where expires_at is in the past
CREATE INDEX idx_sessions_expires_at
  ON sessions (expires_at);

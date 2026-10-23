-- ---------------------------------------------------------------------------
-- 0018_email_login.sql -- sign in with an emailed link (phase 0131)
--
-- email_users: one row per email address that signs in by link. An address
-- belongs to exactly one tenant. Stored lower-cased.
--
-- login_tokens: the links sent by POST /v1/auth/email. Only the SHA-256 hex
-- of the token is stored. A token is used once (used_at) and expires after
-- 15 minutes (expires_at).
--
-- sessions: rebuilt so a session belongs to either a GitHub user or an email
-- user. SQLite can't drop NOT NULL from github_id in place, so the table is
-- copied. Existing sessions keep their id_hash and stay valid.
-- ---------------------------------------------------------------------------

PRAGMA defer_foreign_keys = true;

CREATE TABLE email_users (
  email            TEXT NOT NULL PRIMARY KEY
                     CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  tos_accepted_at  TEXT DEFAULT NULL,
  tos_version      TEXT DEFAULT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at    TEXT DEFAULT NULL
);

CREATE INDEX idx_email_users_tenant_id ON email_users (tenant_id);

CREATE TABLE login_tokens (
  token_hash  TEXT NOT NULL PRIMARY KEY CHECK (length(token_hash) = 64),
  email       TEXT NOT NULL,
  source      TEXT DEFAULT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT NOT NULL,
  used_at     TEXT DEFAULT NULL
);

CREATE INDEX idx_login_tokens_expires_at ON login_tokens (expires_at);

CREATE TABLE sessions_new (
  id_hash     TEXT    NOT NULL PRIMARY KEY
                        CHECK (length(id_hash) = 64),
  github_id   INTEGER DEFAULT NULL REFERENCES github_users(github_id),
  email       TEXT    DEFAULT NULL REFERENCES email_users(email),
  tenant_id   TEXT    NOT NULL REFERENCES tenants(id),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT    NOT NULL,
  CHECK ((github_id IS NOT NULL) + (email IS NOT NULL) = 1)
);

INSERT INTO sessions_new (id_hash, github_id, tenant_id, created_at, expires_at)
  SELECT id_hash, github_id, tenant_id, created_at, expires_at FROM sessions;

DROP TABLE sessions;

ALTER TABLE sessions_new RENAME TO sessions;

CREATE INDEX idx_sessions_github_id ON sessions (github_id, created_at DESC);
CREATE INDEX idx_sessions_email ON sessions (email, created_at DESC);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

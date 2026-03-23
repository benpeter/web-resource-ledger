-- Share tokens for granting read-only access to specific captures.
--
-- token_hash: SHA-256 of the raw token (64 hex chars). Same pattern as api_keys.
--   Raw tokens are NEVER stored -- only the hash. Hash is the primary key for
--   O(1) lookup on every authenticated request.
--
-- capture_id / tenant_id: denormalized for listing without JOIN.
--   tenant_id is authoritative for ownership checks.
--
-- expires_at NULL means permanent (no expiry).
-- No revoked column -- revocation is out of scope for this version.
-- No label column -- YAGNI.
--
-- Security invariants:
--   - token_hash CHECK enforces exactly 64 chars (SHA-256 hex output)
--   - capture_id FK prevents orphaned tokens after capture deletion
--   - tenant_id FK prevents tokens referencing non-existent tenants
CREATE TABLE share_tokens (
  token_hash   TEXT NOT NULL PRIMARY KEY CHECK (length(token_hash) = 64),
  capture_id   TEXT NOT NULL REFERENCES captures(id),
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at   TEXT
);

-- idx_share_tokens_capture: supports listing tokens for a specific capture
--   (descending by created_at for reverse-chronological order).
CREATE INDEX idx_share_tokens_capture ON share_tokens (capture_id, created_at DESC);

-- idx_share_tokens_tenant: supports listing all tokens for a tenant.
CREATE INDEX idx_share_tokens_tenant ON share_tokens (tenant_id, created_at DESC);

-- idx_share_tokens_expires_at: supports the cleanup cron (partial index --
--   only indexes rows with an expiry to keep the index small).
CREATE INDEX idx_share_tokens_expires_at ON share_tokens (expires_at) WHERE expires_at IS NOT NULL;

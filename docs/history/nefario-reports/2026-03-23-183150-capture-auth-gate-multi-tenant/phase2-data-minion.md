# Domain Plan Contribution: data-minion

## Recommendations

### (a) Column design for share_tokens

The table should follow the established hash-before-store pattern used by `api_keys` (key_hash as PK) and `sessions` (id_hash as PK with expires_at). Recommended columns:

```sql
CREATE TABLE share_tokens (
  token_hash   TEXT    NOT NULL PRIMARY KEY
                         CHECK (length(token_hash) = 64),
  capture_id   TEXT    NOT NULL REFERENCES captures(id),
  tenant_id    TEXT    NOT NULL REFERENCES tenants(id),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at   TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
  label        TEXT
);
```

Column rationale:

- **token_hash** (PK, SHA-256 hex, 64 chars): Matches the `api_keys.key_hash` and `sessions.id_hash` patterns exactly. The raw share token is never stored. PK is the hash itself -- no surrogate key needed.
- **capture_id** (FK to captures.id): Scopes the token to exactly one capture. This is the core access grant.
- **tenant_id** (FK to tenants.id): Denormalized from captures for audit and listing without a JOIN on the hot path (same pattern as `sessions.tenant_id`). Also enables listing all share tokens per tenant for management.
- **created_at**: Audit trail, consistent with every other table.
- **expires_at** (nullable): NULL means permanent. Non-null is ISO 8601 timestamp. Same semantics as `sessions.expires_at`. The caller checks expiry -- the DB does not enforce it (same as sessions pattern).
- **revoked** (integer 0/1): Allows token revocation without deletion. Same pattern as `api_keys.revoked`. Keeps audit trail intact. NOTE: D1 ALTER TABLE ADD COLUMN does not support CHECK constraints, but since this is a CREATE TABLE migration, the CHECK is fine.
- **label** (nullable text): Optional human-readable label for the token (e.g., "shared with legal team"). Not `name` since api_keys already uses `name` with NOT NULL -- here it's optional because share tokens may be created programmatically without a label.

**Columns deliberately omitted:**
- No `scopes` column. Share tokens grant read-only access to a single capture's metadata and artifacts. There is no use case for a share token that grants write or capture scope. Keep it simple.
- No `created_by` column. The tenant_id is sufficient audit -- the creator is the tenant's API key holder. If needed later, it can be added via ALTER TABLE.
- No `access_count` or `last_accessed_at`. Tracking access frequency adds write pressure on every read. If needed, log it to Coralogix instead.

### (b) Lookup strategy: token_hash alone

**Recommendation: Lookup by token_hash alone (PK lookup).**

Rationale:
- The token_hash is a SHA-256 hex string -- it is globally unique with negligible collision probability. Adding capture_id to the lookup is redundant for uniqueness.
- The api_keys pattern uses `key_hash` alone as PK and lookup key. Share tokens should follow the same pattern for consistency.
- A PK lookup on token_hash is the fastest possible D1 query -- one B-tree probe, no index scan.
- The capture_id is in the row and can be validated after retrieval: hash the presented token, look up the row, confirm the capture_id matches the requested capture. This is a single-row read regardless.
- If the caller presents a valid share token but for a different capture_id, reject it. This is an application-layer check, not a query-layer one.

The query pattern:

```sql
SELECT * FROM share_tokens WHERE token_hash = ?
```

Then in application code: verify `row.capture_id === requestedCaptureId`, `row.revoked === 0`, and `row.expires_at` is null or in the future.

### (c) Indexes

Three indexes cover the identified query patterns:

```sql
-- 1. Expired token cleanup (periodic cron, same pattern as sessions)
CREATE INDEX idx_share_tokens_expires_at
  ON share_tokens (expires_at)
  WHERE expires_at IS NOT NULL;

-- 2. List tokens per capture (management UI / API)
CREATE INDEX idx_share_tokens_capture
  ON share_tokens (capture_id, created_at DESC);

-- 3. List all tokens per tenant (admin / audit)
CREATE INDEX idx_share_tokens_tenant
  ON share_tokens (tenant_id, created_at DESC);
```

Index rationale:
- **PK (token_hash)**: Already covers the hot-path lookup. No additional index needed.
- **idx_share_tokens_expires_at**: Partial index (only non-null expires_at) for the cleanup cron. Same pattern as `idx_sessions_expires_at`. Keeps the index small since permanent tokens (NULL expires_at) are excluded.
- **idx_share_tokens_capture**: Supports "list all share tokens for this capture" -- needed for the management API. Ordered DESC so the most recent token appears first.
- **idx_share_tokens_tenant**: Supports "list all share tokens for this tenant" -- needed for admin/audit. This is a secondary access pattern but important for tenant management.

### (d) Token limit per capture

**Recommendation: Enforce a per-capture limit at the application layer, not in the schema.**

- D1/SQLite has no built-in mechanism for row count constraints per foreign key value. A trigger would work but adds schema complexity the project explicitly avoids (KISS principle).
- A reasonable default limit is **20 tokens per capture**. This accommodates sharing with multiple parties (legal team, client, auditor) without enabling abuse.
- Implementation: Before INSERT, run `SELECT COUNT(*) FROM share_tokens WHERE capture_id = ? AND revoked = 0`. If >= 20, reject with 409 or 422. The `idx_share_tokens_capture` index makes this count fast.
- The limit should be a constant in `db.js` (e.g., `MAX_SHARE_TOKENS_PER_CAPTURE = 20`) so it's visible and adjustable without schema changes.
- Include revoked tokens in the listing but exclude them from the count -- revoked tokens shouldn't consume quota.

### (e) Interaction with the captures table

The share_tokens table has a FK to captures(id), which establishes referential integrity. The interaction model:

1. **Ownership check remains on captures.tenant_id**: When a tenant creates a share token, the system verifies `captures.tenant_id === authenticated_tenant_id`. The share_tokens.tenant_id is a denormalized copy for audit/listing, not for ownership verification.

2. **Share token auth is a separate path from tenant auth**: The retrieval endpoint currently has no auth (`handleGetCapture` comment: "No authentication required -- capture ID acts as the access secret"). The new auth gate will check three paths in order:
   - Bearer token is a valid API key with `read` scope -> tenant_id must match captures.tenant_id (ownership)
   - Bearer token is a valid share token -> token_hash lookup, verify capture_id matches, not expired, not revoked
   - Session cookie auth -> tenant_id from session must match captures.tenant_id (ownership)
   - No auth -> 401

3. **Cascade behavior**: No ON DELETE CASCADE. If a capture is somehow deleted, the share_tokens rows become orphaned but harmless (the FK prevents this in practice since captures are never deleted in the current schema -- no DELETE endpoint exists). If capture deletion is added later, add CASCADE at that point.

4. **Quarantine interaction**: If a capture is quarantined, the share token still resolves but the capture metadata endpoint already handles quarantine (returns limited data, no artifact URLs). No special handling needed in share_tokens -- the quarantine gate is in the capture retrieval logic, not the auth layer.

5. **No cross-tenant access via share tokens**: A share token created by tenant A for capture X allows anyone with the raw token to access capture X's metadata and artifacts. The token does NOT grant access to tenant A's other captures or any tenant-scoped operations. This is by design -- it is a capability token scoped to a single resource.

## Proposed Tasks

### Task 1: Write migration 0010_share_tokens.sql
- CREATE TABLE with all columns defined above
- Three indexes: expires_at (partial), capture_id+created_at, tenant_id+created_at
- PRAGMA foreign_keys = ON at top (consistent with other CREATE TABLE migrations)
- File: `migrations/0010_share_tokens.sql`

### Task 2: Add share token CRUD functions to db.js
- `createShareToken(db, { tokenHash, captureId, tenantId, expiresAt, label })` -- with per-capture limit check
- `getShareToken(db, tokenHash)` -- PK lookup, returns row or null (does NOT filter by expiry/revoked -- caller checks)
- `revokeShareToken(db, tokenHash)` -- sets revoked=1, returns success/not_found
- `listShareTokensForCapture(db, captureId)` -- ordered by created_at DESC
- `deleteExpiredShareTokens(db)` -- cleanup cron, same pattern as `deleteExpiredSessions`
- Export `MAX_SHARE_TOKENS_PER_CAPTURE = 20`

### Task 3: Integrate share token verification in auth.js
- Add `verifyShareToken(request, env, captureId)` function that:
  - Extracts Bearer token from Authorization header (reuse `extractBearerToken`)
  - Hashes with SHA-256
  - Looks up in share_tokens table
  - Validates: not revoked, not expired, capture_id matches
  - Returns `{ ok: true, authMethod: 'share_token', captureId, tenantId }` or `{ ok: false, ... }`

### Task 4: Wire expired token cleanup into the existing cron handler
- Add `deleteExpiredShareTokens` call alongside `deleteExpiredSessions` in the scheduled handler

## Risks and Concerns

1. **Token format ambiguity**: Share tokens and API keys both go through the same `Authorization: Bearer <token>` header. The retrieval endpoint auth gate needs to distinguish them. Recommendation: use a distinct prefix for share tokens (e.g., `wrl_share_` vs `wrl_live_` for API keys) so the auth layer can route to the correct lookup without trying both tables on every request. This avoids a wasted D1 query on the wrong table.

2. **Migration ordering**: This is migration 0010. Verify that the D1 migration runner applies migrations sequentially and that 0009 (threat_check) has already been applied in both staging and production before deploying 0010. D1 migrations are ordered by filename, so the 0010 prefix handles this.

3. **Permanent tokens as liability**: Tokens with `expires_at = NULL` never expire. If a share token is leaked, it provides indefinite access to that capture. Mitigations: (a) revocation is available, (b) listing tokens per capture lets tenants audit, (c) consider a maximum TTL (e.g., 1 year) enforced at the application layer as a default, with NULL reserved for explicit opt-in. This is an application-layer decision, not a schema concern.

4. **No rate limiting on share token lookups**: An attacker could brute-force share tokens by trying random values. The existing rate limiter on the capture retrieval endpoint provides some protection, but the token space should be large enough to make brute-force infeasible. A 256-bit random token (32 bytes hex = 64 chars) has 2^256 possible values -- computationally infeasible to brute-force. Ensure token generation uses `crypto.getRandomValues`.

5. **D1 row limits**: D1 has no hard row limit per table, but query performance degrades with very large tables. Share tokens are bounded by captures * tokens_per_capture (max 20). With realistic capture volumes (tens of thousands), the share_tokens table stays well within D1's comfort zone.

## Additional Agents Needed

- **security-minion**: Should review the share token generation scheme (token entropy, prefix format), the auth flow ordering (API key vs share token vs session), and whether share tokens should be rate-limited independently from API key auth.
- **api-design-minion**: Should define the share token management endpoints (POST to create, GET to list, DELETE to revoke) and the token format/prefix convention, plus how the retrieval endpoints surface share token auth in their response (e.g., should the response indicate it was accessed via share token?).

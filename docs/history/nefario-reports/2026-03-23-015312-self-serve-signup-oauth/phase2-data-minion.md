# Domain Plan Contribution: data-minion

## Current Schema Analysis

The existing D1 schema has 6 tables: `tenants`, `captures`, `api_keys`, `signing_keys`, `usage_counters`, and `webhooks`. All table inter-references use `tenants.id` (TEXT, format `[a-z0-9_-]{1,64}`) as the foreign key. This ID is deeply embedded -- it appears in `captures.tenant_id`, `api_keys.tenant_id`, `usage_counters.tenant_id`, `webhooks.tenant_id`, and in log entries, R2 key prefixes, and rate limit counter keys in KV.

Key observations from reading `db.js` and `admin.js`:
- `createCapture()` does `INSERT OR IGNORE INTO tenants` -- auto-creates tenant rows on first capture
- `createApiKeyRecord()` also does `INSERT OR IGNORE INTO tenants` -- same pattern
- `api_keys.created_by` is `TEXT NOT NULL` -- currently always `'admin'` (set in `admin.js` line 118)
- `TENANT_ID_RE = /^[a-z0-9_-]{1,64}$/` is validated on every auth path
- Tenant IDs are used as KV rate limit keys, R2 prefixes, and in Coralogix log fields

This means the tenant ID format is a system-wide contract, not just a D1 column constraint.

---

## Recommendations

### 1. GitHub Identity: New `github_users` Table (Not Columns on `tenants`)

**Do NOT add GitHub columns to the `tenants` table.** The `tenants` table represents a billing/isolation entity that exists independently of how it was created. Some tenants are operator-provisioned (no GitHub user), some are self-serve (linked to a GitHub user), and future providers (Google, email) should not require schema changes to `tenants`.

Create a separate `github_users` table that maps GitHub identity to tenant:

```sql
CREATE TABLE github_users (
  github_id       INTEGER NOT NULL PRIMARY KEY,   -- GitHub's numeric user ID (stable, immutable)
  github_login    TEXT    NOT NULL,                -- GitHub username (mutable, display only)
  tenant_id       TEXT    NOT NULL REFERENCES tenants(id),
  tos_accepted_at TEXT,                            -- ISO 8601 timestamp of ToS acceptance
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT
);

CREATE UNIQUE INDEX idx_github_users_tenant
  ON github_users (tenant_id);
```

**Why `github_id INTEGER` as PK:**
- GitHub user IDs are stable integers that never change. Usernames (`login`) can be changed and recycled.
- INTEGER PK is natural for GitHub's ID space and avoids the string transformation overhead.
- This table is not constrained by `TENANT_ID_RE` -- it has its own identity space.

**Why `UNIQUE INDEX` on `tenant_id`:**
- Enforces one-to-one: one tenant can have at most one GitHub user linked. This prevents orphan tenants and simplifies the linking model.
- The reverse lookup (given a tenant, find the GitHub user) is also covered by this index.

**Why `github_login` is stored despite being mutable:**
- Used for display in the UI (session info, account page).
- Updated on every login (the OAuth callback refreshes it from the GitHub API response).
- Never used as a lookup key or for identity matching.

### 2. Tenant ID Strategy for Self-Serve Users: `gh-{github_id}`

The tenant ID for a self-serve user must satisfy `TENANT_ID_RE = /^[a-z0-9_-]{1,64}$/`. GitHub user IDs are integers (currently up to ~200M, will grow but stay within 64 chars as `gh-` prefix + digits).

**Format: `gh-{github_id}`** (e.g., `gh-12345678`)

Rationale for numeric ID over username:
- GitHub usernames can be changed by the user and recycled by GitHub after deletion. Using `gh-octocat` creates a permanent binding to a transient identifier. If user "octocat" renames to "octopus", their tenant ID would be stale, confusing, and impossible to change without migrating all captures, usage counters, R2 objects, etc.
- GitHub numeric IDs are immutable. `gh-12345678` is permanently tied to one account.
- Human-readability is provided by `github_login` in the `github_users` table and in session data. The tenant ID is a system identifier, not a display name.

**Maximum length check:** GitHub IDs are currently 9 digits. Even at 20 digits (far future), `gh-` + 20 = 23 chars, well within the 64-char limit.

### 3. Session Storage: New `sessions` Table in D1

Server-side sessions are the correct approach for this architecture. D1 is the right store -- the same database that holds tenants and keys, queried in the same Worker, with no additional bindings needed.

```sql
CREATE TABLE sessions (
  id_hash     TEXT    NOT NULL PRIMARY KEY CHECK (length(id_hash) = 64),
  github_id   INTEGER NOT NULL REFERENCES github_users(github_id),
  tenant_id   TEXT    NOT NULL REFERENCES tenants(id),
  csrf_token  TEXT    NOT NULL CHECK (length(csrf_token) >= 32),
  ip_hash     TEXT,                            -- HMAC-SHA256 of CF-Connecting-IP at creation
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT    NOT NULL
);

CREATE INDEX idx_sessions_github
  ON sessions (github_id, created_at);

CREATE INDEX idx_sessions_expires
  ON sessions (expires_at);
```

**Key design decisions:**

**`id_hash` (SHA-256 of session ID) as PK, not the raw session ID.** The same pattern used for API keys. The cookie holds the raw session token; D1 stores only the SHA-256 hash. If D1 is ever breached, the attacker gets hashes, not usable session tokens. This matches the security-minion's requirement.

**`github_id` and `tenant_id` are both stored.** Denormalized from `github_users` for single-query session validation. The hot-path query (`SELECT tenant_id, github_id, csrf_token, expires_at FROM sessions WHERE id_hash = ? AND expires_at > ?`) returns everything `verifySession()` needs without a JOIN.

**`csrf_token`** is stored per-session, generated at session creation. Even though the api-design-minion recommended a stateless custom-header approach (`X-WRL-CSRF: 1`), I include the column because the security-minion explicitly recommended a synchronizer token. The column costs nothing and gives a stronger defense. The implementing team can choose which strategy to use -- the schema supports both.

**`ip_hash`** for forensic logging, not enforcement. Mobile users change IPs frequently.

**`expires_at`** enables single-condition expiry check in SQL. The application sets this to `created_at + 7 days` (session lifetime). The 30-day absolute maximum recommended by security-minion can be enforced by setting a hard cap on `expires_at` regardless of sliding renewal.

**No `github_login` in sessions.** The `github_login` is in `github_users` and is fetched via JOIN or a separate query only when needed (e.g., `GET /auth/session`). This avoids stale login names in long-lived sessions.

### 4. OAuth State Storage: New `oauth_states` Table in D1

```sql
CREATE TABLE oauth_states (
  state       TEXT NOT NULL PRIMARY KEY CHECK (length(state) >= 32),
  ip_hash     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

**Why a dedicated table instead of reusing sessions:** OAuth state parameters are ephemeral, short-lived (5-10 minute TTL), and unrelated to sessions. They exist before the user is authenticated. Mixing them into the sessions table would pollute the session lifecycle with pre-auth garbage.

**Why store `state` in plaintext (not hashed):** Unlike session tokens and API keys, the OAuth state parameter is not a credential. It is a CSRF prevention nonce for the OAuth flow itself, generated and consumed within minutes. An attacker who obtains a state value from D1 cannot use it to hijack an OAuth flow -- they would also need the matching authorization code from GitHub and the ability to intercept the callback URL. Hashing adds complexity without meaningful security benefit.

**Cleanup strategy:** State records expire after 10 minutes. Two options:
1. **Lazy cleanup (recommended):** On callback, check `created_at` -- reject if older than 10 minutes. On each authorization initiation, delete any expired states (e.g., `DELETE FROM oauth_states WHERE created_at < datetime('now', '-10 minutes')`). This piggybacks cleanup on normal traffic.
2. **Cron trigger:** A scheduled Worker invocation that purges expired states. Adds operational complexity for minimal benefit given the low volume of OAuth requests.

Delete the state record after successful use (one-time use enforcement).

### 5. Linking GitHub Users to Existing Operator-Created Tenants

This is the hardest data problem. The constraint is: "don't duplicate" -- a GitHub user who already has an operator-provisioned tenant should not get a second tenant.

**The system cannot auto-link.** There is no reliable way to automatically determine that GitHub user 12345 is the same person who owns operator-provisioned tenant `acme-corp`. GitHub usernames can be recycled, email addresses can be spoofed, and there is no shared secret.

**Recommended approach: Explicit operator-initiated link via admin API.**

Add a new admin endpoint (or extend `setTenantConfig`) that creates a link:

```
POST /v1/admin/tenants/:tenantId/link-github
{ "githubId": 12345 }
```

This inserts a row into `github_users` with the specified `tenant_id` instead of auto-generating `gh-{github_id}`. The operator performs this before the user's first OAuth login (or within a grace window).

**Flow for a linked user:**
1. User logs in via GitHub OAuth. Callback receives `github_id = 12345`.
2. Query: `SELECT tenant_id FROM github_users WHERE github_id = 12345`.
3. Row found -> use existing `tenant_id` (e.g., `acme-corp`). No new tenant created.

**Flow for a new user (no link exists):**
1. User logs in via GitHub OAuth. Callback receives `github_id = 12345`.
2. Query: `SELECT tenant_id FROM github_users WHERE github_id = 12345`.
3. No row found -> create tenant `gh-12345`, insert `github_users` row, create first API key.

**Flow for an operator who wants to link after the user already signed up:**
1. User already has tenant `gh-12345` with captures, keys, usage.
2. Operator wants to consolidate into `acme-corp`.
3. This is a **tenant merge**, not a simple link. It requires migrating captures, usage counters, API keys, and webhooks from `gh-12345` to `acme-corp`. This is out of scope for the initial implementation but should be a documented backlog item.
4. For now: update `github_users.tenant_id` to `acme-corp`. The user's session will now resolve to `acme-corp`. Their old captures under `gh-12345` become orphaned (still accessible by capture ID, not by tenant listing). This is acceptable as a manual admin operation with documented consequences.

**Alternative considered and rejected: Link codes.** A one-time code generated by the admin that the user enters during OAuth signup. This is more user-friendly but adds significant complexity (code generation, storage, expiry, redemption flow in the UI). YAGNI for the initial implementation.

### 6. ToS Acceptance Timestamp

**Location: `github_users.tos_accepted_at`**

Rationale:
- ToS acceptance is an act by a human user (the GitHub-authenticated person), not a property of the tenant entity. Operator-provisioned tenants accept ToS through their contract with the operator, not through the self-serve flow.
- Placing it on `github_users` means the query `SELECT tos_accepted_at FROM github_users WHERE github_id = ?` gives the answer in one lookup.
- The session validation can include this field when populating the `GET /auth/session` response.

**Not on `tenants`:** If ToS acceptance were on `tenants`, it would apply to all tenants including operator-provisioned ones, which don't go through the self-serve ToS flow. Adding a nullable `tos_accepted_at` to `tenants` would be semantically wrong -- it conflates "user accepted ToS" with "tenant is compliant."

**Not on `sessions`:** ToS acceptance persists across sessions. It is a one-time event per user.

**Recording the acceptance:** During the OAuth callback (first login), after the user agrees to ToS, update `github_users.tos_accepted_at`. On subsequent logins, skip the ToS screen if `tos_accepted_at IS NOT NULL`.

**Enforcing the gate:** The `verifySession()` function or the account route handler checks `tos_accepted_at` on the `github_users` row. If NULL, return 403 with the ToS acceptance URL.

### 7. Migration File: `0004_oauth_sessions.sql`

```sql
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- github_users
-- Maps GitHub OAuth identity to a WRL tenant. One GitHub user per tenant.
-- github_id is GitHub's stable numeric user ID (INTEGER, not TEXT).
-- github_login is mutable/display-only; refreshed on each login.
-- tos_accepted_at records when the user accepted the Terms of Service.
-- ---------------------------------------------------------------------------
CREATE TABLE github_users (
  github_id       INTEGER NOT NULL PRIMARY KEY,
  github_login    TEXT    NOT NULL,
  tenant_id       TEXT    NOT NULL REFERENCES tenants(id),
  tos_accepted_at TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT
);

CREATE UNIQUE INDEX idx_github_users_tenant
  ON github_users (tenant_id);

-- ---------------------------------------------------------------------------
-- sessions
-- Server-side session records. id_hash is SHA-256 of the session cookie
-- value (same hash-before-store pattern as api_keys). Denormalized
-- github_id and tenant_id avoid JOINs on the hot path.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id_hash     TEXT    NOT NULL PRIMARY KEY CHECK (length(id_hash) = 64),
  github_id   INTEGER NOT NULL REFERENCES github_users(github_id),
  tenant_id   TEXT    NOT NULL REFERENCES tenants(id),
  csrf_token  TEXT    NOT NULL CHECK (length(csrf_token) >= 32),
  ip_hash     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT    NOT NULL
);

CREATE INDEX idx_sessions_github
  ON sessions (github_id, created_at);

CREATE INDEX idx_sessions_expires
  ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- oauth_states
-- Ephemeral CSRF nonces for the GitHub OAuth flow. Short-lived (10 min TTL),
-- consumed once on callback. Cleaned up lazily.
-- ---------------------------------------------------------------------------
CREATE TABLE oauth_states (
  state       TEXT NOT NULL PRIMARY KEY CHECK (length(state) >= 32),
  ip_hash     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

### 8. db.js Functions to Add

The data access layer needs these new functions (all in `src/db.js`):

**GitHub users:**
- `findGitHubUser(db, githubId)` -- SELECT by github_id. Returns `{ githubId, githubLogin, tenantId, tosAcceptedAt, createdAt }` or null.
- `createGitHubUser(db, { githubId, githubLogin, tenantId })` -- INSERT into github_users and INSERT OR IGNORE into tenants. Uses `db.batch()` for atomicity (same pattern as `createCapture`).
- `updateGitHubLogin(db, githubId, githubLogin)` -- UPDATE github_login and updated_at. Called on every OAuth login to keep the display name current.
- `acceptTos(db, githubId)` -- UPDATE tos_accepted_at where it is currently NULL. Idempotent (no-op if already set).

**Sessions:**
- `createSession(db, { idHash, githubId, tenantId, csrfToken, ipHash, expiresAt })` -- INSERT into sessions.
- `getSession(db, idHash)` -- SELECT by id_hash. Returns session record or null. Does NOT check expiry (caller checks, because the caller also needs the record to know which user's session expired for logging).
- `deleteSession(db, idHash)` -- DELETE by id_hash. Used for logout.
- `deleteExpiredSessions(db)` -- `DELETE FROM sessions WHERE expires_at < datetime('now')`. Called opportunistically (e.g., on login or logout) to prevent table bloat. Returns count of deleted rows for logging.
- `deleteSessionsForUser(db, githubId)` -- DELETE all sessions for a github_id. Used for "log out everywhere" or when an operator unlinks a user.

**OAuth states:**
- `createOAuthState(db, { state, ipHash })` -- INSERT into oauth_states.
- `consumeOAuthState(db, state, maxAgeSeconds)` -- SELECT + DELETE in a batch. Returns the record if found and not expired, null otherwise. Atomically consumes the state to prevent replay.
- `cleanupExpiredOAuthStates(db, maxAgeSeconds)` -- DELETE expired states. Called lazily on each authorization initiation.

### 9. Impact on Existing `api_keys.created_by` Field

Currently, `created_by` is always `'admin'`. The api-design-minion recommends `'github:{githubId}'` for self-serve key creation. This is a good approach that requires NO schema change -- `created_by` is `TEXT NOT NULL` with no constraint on format. The convention becomes:

| Value | Meaning |
|-------|---------|
| `'admin'` | Created by operator via admin API |
| `'github:12345'` | Created by self-serve user with GitHub ID 12345 |
| `'system'` | Auto-created during first OAuth signup (the initial key) |

This provides audit trail without schema changes.

---

## Proposed Tasks

### T-DATA-1: Create migration `0004_oauth_sessions.sql` (BLOCKING)
Write the migration file with the three new tables (`github_users`, `sessions`, `oauth_states`) as specified above. Apply to both staging and production D1 databases using `wrangler d1 migrations apply`.

**Priority:** Must be done first. All other tasks depend on the schema existing.

### T-DATA-2: Add GitHub user CRUD functions to `db.js`
Implement `findGitHubUser`, `createGitHubUser`, `updateGitHubLogin`, and `acceptTos` in `src/db.js`. Follow existing patterns: parameter validation, camelCase return shapes, JSDoc.

**Depends on:** T-DATA-1

### T-DATA-3: Add session CRUD functions to `db.js`
Implement `createSession`, `getSession`, `deleteSession`, `deleteExpiredSessions`, and `deleteSessionsForUser`. The session ID hash uses the same `hashApiKey` function (rename to `sha256hex` or make a shared utility). Follow the hash-before-store pattern.

**Depends on:** T-DATA-1

### T-DATA-4: Add OAuth state functions to `db.js`
Implement `createOAuthState`, `consumeOAuthState`, and `cleanupExpiredOAuthStates`. The consume function must be atomic (SELECT + DELETE in batch or single statement) to prevent TOCTOU race conditions on state reuse.

**Depends on:** T-DATA-1

### T-DATA-5: Add admin endpoint for GitHub-tenant linking
Implement `POST /v1/admin/tenants/:tenantId/link-github` that creates a `github_users` row linking a GitHub ID to an existing operator-provisioned tenant. Validates that the tenant exists and the GitHub ID is not already linked to another tenant.

**Depends on:** T-DATA-2

### T-DATA-6: Write tests for all new db.js functions
Unit tests covering: github user creation and lookup, session lifecycle (create, get, expire, delete), OAuth state consumption and TTL enforcement, tenant ID generation (`gh-{id}` format), edge cases (duplicate github_id, linking to non-existent tenant, consuming already-consumed state).

**Depends on:** T-DATA-2, T-DATA-3, T-DATA-4

---

## Risks and Concerns

### RISK-1: `github_users.tenant_id` UNIQUE Constraint Prevents Multiple Providers Per Tenant (MEDIUM)
The UNIQUE index on `tenant_id` in `github_users` means a tenant can only be linked to one GitHub user. This is correct for the current requirement (one user per tenant). However, if a future feature adds Google OAuth or team/org accounts, the constraint prevents multiple identity providers pointing to the same tenant.

**Mitigation:** The constraint is easily dropped in a future migration if multi-provider support is needed. For now, the one-to-one model is simpler and avoids the complexity of identity federation. Document this as a known limitation.

### RISK-2: Session Table Growth Without Active Cleanup (LOW-MEDIUM)
Sessions expire but are not automatically deleted. The `deleteExpiredSessions` function must be called regularly to prevent D1 from accumulating dead rows.

**Mitigation:** Call `deleteExpiredSessions()` in a `ctx.waitUntil()` on every session creation or OAuth login. This piggybacks cleanup on natural traffic. If traffic is very low, the dead rows are small (each session is ~200 bytes). A Cron Trigger can be added later if the table grows beyond expectations. The `idx_sessions_expires` index makes the cleanup DELETE efficient.

### RISK-3: Tenant Merge Is Not Addressed (HIGH for Linked Users)
If a GitHub user signs up (gets `gh-12345`) and the operator later wants them on `acme-corp`, there is no automated tenant merge. Captures, API keys, usage counters, webhooks, and R2 objects are all keyed by `tenant_id`. Changing `github_users.tenant_id` from `gh-12345` to `acme-corp` fixes future operations but orphans historical data.

**Mitigation:** Document this limitation clearly. For the initial release, an operator who knows they want to link a GitHub user to an existing tenant should use the admin link endpoint BEFORE the user's first OAuth login. Post-signup migration is a manual admin operation. Add a backlog item for an automated tenant merge tool.

### RISK-4: D1 Query Latency on Session Validation (LOW)
Every session-authenticated request requires a D1 read (`SELECT ... FROM sessions WHERE id_hash = ?`). D1 reads are typically <5ms, well within the project's <300ms latency budget.

**Mitigation:** Monitor session lookup latency in Coralogix. If it becomes an issue, the session record is an excellent candidate for KV caching (short TTL, invalidate on logout). But do not pre-optimize -- D1 lookups by primary key are fast by design.

### RISK-5: OAuth State Consumption Race Condition (LOW)
Two concurrent requests with the same state parameter could both pass the SELECT check before either executes the DELETE. D1 does not support row-level locks.

**Mitigation:** Use a single `DELETE FROM oauth_states WHERE state = ? AND created_at > datetime('now', '-600 seconds') RETURNING *` statement (SQLite 3.35+/D1 supports RETURNING). If the DELETE returns a row, the state was valid and is now consumed. If it returns nothing, the state was already consumed or expired. This is atomic at the SQL level. If D1 does not support RETURNING, use `DELETE` + check `meta.changes === 1`.

### RISK-6: GitHub ID Space Assumptions (VERY LOW)
The schema uses `INTEGER` for `github_id`. GitHub user IDs are currently 32-bit integers but could theoretically grow. SQLite INTEGER can hold 64-bit signed integers (up to 9.2 * 10^18), which is more than sufficient.

---

## Additional Agents Needed

- **security-minion** (REVIEW): Should validate that the hash-before-store pattern for session IDs provides adequate protection, and that the `csrf_token` column length constraint (>= 32 chars) is sufficient.
- **oauth-minion** (BLOCKING): The OAuth callback implementation needs to orchestrate the GitHub user creation, tenant provisioning, first API key generation, session creation, and ToS acceptance in the correct order. The data layer provides the primitives; oauth-minion defines the orchestration.
- **api-design-minion** (INFORMATIONAL): The `createdBy` convention (`'github:{id}'`, `'admin'`, `'system'`) should be documented in the API reference alongside the key creation endpoints.
- **test-minion** (PARALLEL): Test cases for the db functions can be written in parallel with the oauth handler implementation since they test the data layer independently.
- **iac-minion** (INFORMATIONAL): The migration needs to be applied to both staging and production D1. The existing `migrations_dir = "migrations"` in `wrangler.toml` covers this, but the deploy process should be documented.

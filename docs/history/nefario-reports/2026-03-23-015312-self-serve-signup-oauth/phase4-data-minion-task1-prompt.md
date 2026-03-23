You are data-minion. Create the D1 migration file `migrations/0004_github_oauth.sql` for the WRL self-serve OAuth feature.

## Context
The WRL Worker uses D1 (SQLite) for all metadata. Existing tables: tenants, captures, api_keys, signing_keys, usage_counters, webhooks. All foreign keys reference `tenants(id)` which is TEXT matching `/^[a-z0-9_-]{1,64}$/`.

Existing migrations: 0001_initial_schema.sql, 0002_usage_counters.sql, 0003_webhooks.sql.

Read the existing migrations in `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/tender-painting-lollipop/migrations/` to match style and conventions.

## Tables to Create

**github_users** -- maps GitHub OAuth identity to a WRL tenant:
- `github_id` INTEGER NOT NULL PRIMARY KEY -- GitHub's stable numeric user ID
- `github_login` TEXT NOT NULL -- mutable display name, refreshed on each login
- `tenant_id` TEXT NOT NULL REFERENCES tenants(id) -- the WRL tenant this user owns
- `tos_accepted_at` TEXT -- ISO 8601 timestamp of ToS acceptance (NULL until accepted)
- `tos_version` TEXT -- version identifier of accepted ToS (e.g., "2026-03-23")
- `created_at` TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
- `updated_at` TEXT
- UNIQUE INDEX on tenant_id (one tenant per GitHub user, one GitHub user per tenant)

**sessions** -- server-side session records for cookie-based auth:
- `id_hash` TEXT NOT NULL PRIMARY KEY CHECK (length(id_hash) = 64) -- SHA-256 of session cookie value
- `github_id` INTEGER NOT NULL REFERENCES github_users(github_id)
- `tenant_id` TEXT NOT NULL REFERENCES tenants(id) -- denormalized for hot-path query
- `created_at` TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
- `expires_at` TEXT NOT NULL
- INDEX on (github_id, created_at) for "all sessions for user" queries
- INDEX on (expires_at) for cleanup queries

## Design Decisions (already settled)
- `id_hash` uses SHA-256 of session ID, same hash-before-store pattern as api_keys. The cookie holds the raw session token; D1 stores only the hash.
- No `csrf_token` column -- CSRF is handled via custom header check (`X-WRL-CSRF: 1`), no server state needed.
- No `ip_hash` column -- IP forensics via Coralogix `cip`, not D1.
- No `github_login` in sessions -- fetched from github_users via JOIN only when needed.
- OAuth state parameters are stored in KV (not D1) -- no `oauth_states` table.
- Tenant IDs for self-serve users follow format `gh-{github_numeric_id}` (e.g., `gh-12345678`).
- `tos_version` stored from day one for future re-consent support.

## Constraints
- Use PRAGMA foreign_keys = ON at the top
- Include clear comments explaining each table's purpose
- Match the style of existing migrations (read them first)

## Deliverables
- `migrations/0004_github_oauth.sql`

## What NOT to do
- Do NOT create an oauth_states table (state goes in KV)
- Do NOT modify any existing table
- Do NOT add columns to the tenants table
- Do NOT add a csrf_token or ip_hash column to sessions

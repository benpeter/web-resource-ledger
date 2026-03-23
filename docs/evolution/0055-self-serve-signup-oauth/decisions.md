# Phase 0055: Self-Serve Signup (OAuth) — Decisions

## D1: OAuth state storage — KV with TTL vs D1 table

**Chosen**: KV with 600s TTL
**Over**: D1 `oauth_states` table (data-minion)
**Why**: OAuth state is ephemeral (10-minute lifetime, single-use, high-churn). KV TTL handles cleanup automatically. D1 would require lazy cleanup queries or a cron trigger. By callback time (seconds later, after GitHub interaction), KV eventual consistency has settled.

## D2: CSRF approach — custom header vs synchronizer token

**Chosen**: Custom header check (`X-WRL-CSRF: 1`) + `SameSite=Lax`
**Over**: Per-session synchronizer token stored in D1 (security-minion)
**Why**: Custom headers trigger CORS preflight for cross-origin requests; `SameSite=Lax` blocks the cookie on cross-site POST. Together they provide equivalent protection to synchronizer tokens with zero server state. The `__Host-` cookie prefix mitigates subdomain cookie attacks.

## D3: Tenant ID format for self-serve users

**Chosen**: `gh-{github_numeric_id}` (e.g., `gh-12345678`)
**Over**: `gh-{github_login}` (oauth-minion)
**Why**: GitHub usernames are mutable and recyclable. Tenant ID is embedded in R2 keys, KV rate limit counters, and capture records — changing it requires data migration. Numeric GitHub ID is immutable. Human-readability comes from `github_login` in the `github_users` table.

## D4: Session mechanism — D1 sessions vs JWT vs encrypted cookie

**Chosen**: D1 server-side sessions with HMAC-signed cookie
**Over**: JWT (cannot revoke server-side), encrypted self-contained cookie (payload size, no revocation)
**Why**: D1 sessions enable server-side revocation (logout, force-invalidation). Session ID hashed before storage limits breach blast radius.

## D5: First-key delivery — KV with one-time read vs URL param vs session embed

**Chosen**: KV entry deleted on first read, dedicated `/v1/account/first-key` endpoint
**Over**: (1) Passing key in redirect URL (leaks in browser history/server logs), (2) Embedding in session (session is long-lived, key exposure should be time-bounded)
**Why**: First read deletes the KV entry (security-minion advisory). User gets one chance to copy the key. Settings page allows creating replacement keys if missed.

## D6: ToS acceptance timing

**Chosen**: Create github_users record with `tos_accepted_at = NULL` on first login; enforce ToS gate in both UI and backend
**Over**: (1) ToS before OAuth redirect (complicates flow), (2) ToS in callback handler (mixes protocol with legal concerns)
**Why**: Single redirect, single session creation. Backend enforces 403 on `/v1/account/*` when `tosAcceptedAt` is null (security-minion + lucy advisory — prevents curl bypass of UI-only gate). `POST /v1/account/tos` is exempt from this gate.

## D7: Task 9 (observability) absorbed into Tasks 3 and 4

**Chosen**: Inline log calls in oauth.js and account.js handlers
**Over**: Standalone observability task (Task 9) by observability-minion
**Why**: Margo advisory — Task 3/4 prompts already specify every log event. A separate task either duplicates work or fragments handler ownership. The log.js JSDoc update is a two-line change absorbed into Task 3.

## D8: verifySession JOIN strategy

**Chosen**: `getSession()` JOINs `github_users` in a single query
**Over**: Separate D1 queries for session + github_users (double D1 hit)
**Why**: Margo advisory — every authenticated request needs `githubLogin` and `tosAcceptedAt`. One query instead of two on the hot path.

## D9: Operator tenant linking — deferred

**Chosen**: Deferred to backlog
**Over**: `POST /v1/admin/tenants/:tenantId/link-github` in this phase
**Why**: YAGNI for initial launch. Data model supports it (github_users row can point to any tenant_id). Manual D1 SQL available for edge cases. Lucy acknowledged the gap vs "Must handle" in the prompt — the deferral is product-acceptable because tenant ID formats are disjoint (operator tenants don't start with `gh-`).

## D10: PKCE for confidential client — kept

**Chosen**: Include PKCE (S256) despite being a confidential client
**Over**: Omit PKCE (margo noted it's technically YAGNI for server-side clients)
**Why**: OAuth 2.1 recommends PKCE for all clients. Marginal code cost (~5 lines). Defense-in-depth. Already stored in same KV entry as state parameter.

## D11: Error parameter display — closed allowlist

**Chosen**: Closed allowlist of error codes mapped to hardcoded display strings
**Over**: Displaying raw query parameter values
**Why**: Security-minion advisory — prevents XSS if any code path inadvertently uses innerHTML. All display via `textContent` assignment.

VERDICT: ADVISE
WARNINGS:
- [YAGNI]: Per-capture token limit of 20 is premature
  SCOPE: `src/share-tokens.js` — `MAX_SHARE_TOKENS_PER_CAPTURE` constant and pre-INSERT count query
  CHANGE: Drop the per-capture limit check entirely. If a limit proves necessary later, add it then. D1 SQLite handles thousands of rows per capture without performance concern. The cron cleanup already prevents unbounded growth of expired tokens.
  WHY: No user has requested this limit. No performance data justifies it. The limit adds a count query on every INSERT, a constant to maintain, a 422 error path to test, and a user-facing error message to document. That is four artifacts serving a problem that does not yet exist. If a tenant is creating excessive tokens, that is an abuse/rate-limiting concern (handled by existing rate limits), not a data-model concern.
  TASK: 1

- [YAGNI]: `label` field on share tokens adds complexity without a consumer
  SCOPE: `migrations/0010_share_tokens.sql` — `label TEXT` column; `src/share-tokens.js` — `label` parameter threading; `docs/openapi.yaml` — request body schema
  CHANGE: Remove the `label` column from the migration and the `label` parameter from `createShareToken` and the POST request body. Add it when there is a UI or API consumer that displays token labels.
  WHY: No endpoint lists share tokens to a user (the plan explicitly marks token metadata in GET response as YAGNI). Without a list view, labels are write-only data — stored but never surfaced. Adding the column later is a single ALTER TABLE migration. Adding it now means the POST request body, OpenAPI spec, and tests all carry a parameter nobody reads.
  TASK: 1

- [YAGNI]: Revocation endpoint is out-of-scope per the user's own spec
  SCOPE: `src/index.js` — `DELETE /v1/captures/{id}/share/{tokenHashPrefix}` route and `handleRevokeShare` handler; `src/share-tokens.js` — `revokeShareToken()` function; `migrations/0010_share_tokens.sql` — `revoked` and `revoked_at` columns
  CHANGE: Remove the DELETE endpoint, the `revokeShareToken()` function, the `revoked`/`revoked_at` columns from the migration, and all revocation-related test cases. The user's scope explicitly says "Out: share token revocation API (future enhancement)". If revocation is needed later, add the columns and endpoint in a new migration.
  WHY: The user drew a clear line: revocation is out of scope. The plan crosses it. The `revoked` column also adds branching in the auth gate (check revoked before checking expiry), complicates the cron cleanup (separate TTL for revoked vs. expired), and requires its own test matrix (revoked token returns 401, revocation of non-owned token returns 404, etc.). This is the largest single source of unnecessary complexity in the plan.
  TASK: 1

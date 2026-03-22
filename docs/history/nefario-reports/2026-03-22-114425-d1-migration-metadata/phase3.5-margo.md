# Margo Review: D1 Migration for Metadata

## Verdict: ADVISE

This plan is well-scoped for the problem it solves. Three tasks for a full storage backend migration is proportional. The conflict resolutions are consistently correct -- offset/limit over cursor, prefix match over substring, deferred Cron Trigger, no FK enforcement wrapper, single tenants table. These are all YAGNI/KISS-aligned decisions. The plan correctly strips accidental complexity that KV imposed (secondary index keys, cursor encoding, in-memory status filtering, over-fetch heuristics).

No blocking concerns. The following are non-blocking items to watch:

- [simplicity]: Task 3 migration script uses Cloudflare REST API for both KV reads and D1 writes when `wrangler d1 execute` and `wrangler kv key list/get` could do the same with less code and no API token management.
  SCOPE: `scripts/migrate-kv-to-d1.js`
  CHANGE: Consider using wrangler CLI commands (piped through the script) instead of raw REST API calls. The script is one-time operational tooling for a pre-launch product with a small dataset. Shell-out-to-wrangler is simpler than managing Cloudflare API authentication, pagination, and error handling manually.
  WHY: The prompt says "Use Cloudflare REST API (better error handling than CLI)" but for a one-time migration of a small dataset with operator supervision, wrangler CLI is simpler and already authenticated. The "better error handling" argument is premature optimization of tooling that runs once.
  TASK: 3

- [simplicity]: Task 2 prompt specifies a row-to-camelCase transformation function in `getCapture` and duplicates it in `listCaptures`. This mapping (snake_case columns to camelCase JS) should be a single private helper used by both, not described twice in the prompt.
  SCOPE: `src/db.js`
  CHANGE: Ensure the implementing agent extracts one `rowToCapture(row)` helper rather than inlining the transformation in both `getCapture` and `listCaptures`. The prompt describes the shape twice -- the agent should recognize this as a DRY opportunity.
  WHY: Dual maintenance of the same field mapping is a bug vector. If a column is added or renamed, two sites need updating.
  TASK: 2

- [simplicity]: The `url` filter validation rejects `%` but not `_` (SQLite single-char wildcard). The plan acknowledges this with "negligible impact" but the fix is one character in a CHECK -- `AND NOT url LIKE '%[_%]%'` or just reject `_` alongside `%` in the HTTP validation.
  SCOPE: `src/index.js` URL param validation
  CHANGE: Reject `_` in the url filter parameter alongside `%`. One extra condition, zero ambiguity.
  WHY: "Negligible impact" is still a known inconsistency. Closing it costs nothing.
  TASK: 2

- [simplicity]: 431 `env.KV` references across 17 test files is a large blast radius for Task 3. The plan mitigates with `cleanDb` and `seedCapture` helpers, which is correct. Watch for the test-minion attempting to rewrite every file from scratch rather than making targeted find-and-replace edits.
  SCOPE: Test suite (all 17 files)
  CHANGE: No plan change needed. This is an execution risk note: the agent should update imports and swap `env.KV` to `env.DB` for metadata calls mechanically, not rewrite test logic. Most HTTP-level tests need only fixture/cleanup changes.
  WHY: Unnecessary test rewrites introduce regressions. The goal is to change the storage backend, not redesign the test suite.
  TASK: 3

# Code Review: R26 Tenant Quotas

Reviewer: code-review-minion
Date: 2026-03-23

---

VERDICT: ADVISE

FINDINGS:

- [ADVISE] src/ui/ui-settings.js:36 -- `formatBytes` MB branch has a ternary that always resolves to 0 decimal places. The expression `(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 0)` has identical branches: both sides of the conditional are `0`. This means 524.3 MB renders as "524 MB" instead of "524.3 MB", dropping sub-MB precision silently. The KB and GB branches handle fractional precision correctly; MB is the odd one out.
  FIX: Change line 36 to: `if (n < 1000000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + ' MB';`

- [ADVISE] src/quotas.js:62-118 / src/account.js:472 -- `checkQuota` is used as the primary data source for `handleAccountGetUsage` by calling it with `count=0`. When the tenant is already over the capture limit (`captureCount > quota.capturesPerMonth`), the function returns a denied shape that omits `storageBytes` from its fields. The account.js fallback path (lines 492-504) re-queries D1 to recover the missing data -- this is correct and documented, but it means every over-quota usage page view costs two D1 round-trips. This is noted in the comment as acceptable. No action required unless the usage endpoint becomes a hotspot.
  FIX: No change needed; the double-read on the over-quota path is intentional and documented. Flag for revisiting if usage endpoint becomes high-traffic.

- [NIT] src/quotas.js:76 -- `JSON.parse(tenant.config)` is called without a try/catch. Malformed config JSON stored in D1 (e.g. from a bug in a previous admin write path) would cause an unhandled exception that propagates as a 500 to the capture endpoint. The project's "fail loudly" principle is satisfied since it would propagate up with a stack trace, but it would also deny captures to the tenant until the bad config is repaired. The admin `setTenantConfig` path validates and serializes correctly, so this is a defense-in-depth gap rather than a likely bug.
  FIX: Wrap in try/catch and return `{ allowed: false, reason: 'config_parse_error' }`, or wrap in a helper that catches and logs. If you prefer to keep it simple, add a comment noting the assumption that config is always well-formed JSON (written only by setTenantConfig).

- [NIT] src/account.js:492-496 -- The fallback D1 batch in `handleAccountGetUsage` duplicates the exact query shape from `checkQuota` (lines 65-70 of quotas.js): same two prepared statements, same column list, same bind order. If the quota query shape ever changes (e.g. adding a `tier_override` column), the fallback path will silently lag behind.
  FIX: Extract the tenant+usage read into a small db.js helper (e.g. `getTenantAndUsage(db, tenantId, period)`) that both `checkQuota` and the account usage fallback can call. Not urgent given the small codebase, but keeps the query shape DRY.

- [NIT] src/ui/ui-settings.js:361 -- `var keyLimit = 5;` is a hardcoded magic number duplicated from `account.js`'s `MAX_KEYS_PER_TENANT = 5`. If the server-side limit changes, the UI will show a stale count (e.g. "4 of 5 keys" when the real limit is 10). The UI already has the actual key count from the API; it could derive the limit from the API response instead.
  FIX: Ideally, the GET /v1/account/keys response should include a `limit` field. As a minimum, add a comment linking this constant to `account.js:MAX_KEYS_PER_TENANT` so it is not missed during future changes.

- [NIT] migrations/0005_tenant_tiers.sql:4 -- The migration comment correctly notes that SQLite/D1 does not support CHECK constraints in ALTER TABLE ADD COLUMN. However, there is no index on the new `tier` column. If a future admin query needs to list all tenants by tier (e.g. "all pro tenants"), it will require a full table scan. Not a correctness issue at current scale, but worth noting for the backlog.
  FIX: No action required now. Add to backlog as: "Consider index on tenants.tier if tier-based admin queries are added."

---

## Summary

The implementation is well-structured. The quota logic in `quotas.js` is clean, the D1 batch pattern is used correctly, and the test coverage is thorough: unit tests cover edge cases (boundary conditions, year rollover, per-tenant config overrides), integration tests cover the full HTTP stack for both single and batch capture endpoints, and the UI helper tests use the Function constructor pattern to test pure logic without DOM.

The one genuine correctness issue is the `formatBytes` MB branch (ADVISE above) -- it always rounds to 0 decimal places due to a copy-paste error in the ternary. For a storage metric displaying values like 524.3 MB this is user-visible data loss. Everything else is nit-level.

Security posture is solid: `tenantId` always sourced from verified session, quota checks occur before any work is queued, legacy-auth paths are explicitly excluded from quota (they have no D1 tenant record), and the UI DOM construction uses `textContent` throughout with no `innerHTML` on variable data.

# Margo: Complexity Review -- Admin Dashboard

**VERDICT: ADVISE**

Two non-blocking concerns (one functional bug, one minor). The overall
implementation is proportional to the problem and follows established project
patterns well.

---

## What is right

**Minimal complexity budget spend.** No new dependencies, no new frameworks,
no new infrastructure. The admin UI follows the exact same vanilla-JS,
inline-everything, no-external-resources pattern as the existing tenant
dashboard (`src/ui/`). Five files vs. the tenant UI's fourteen -- proportional
to the simpler scope.

**DB functions are efficient.** `getTenantDetail` and `getOverviewStats` both
use `db.batch()` for single-round-trip multi-query execution. The SQL is
straightforward with no unnecessary JOINs or subquery chains.
`listTenantsWithUsage` is a single query with a correlated subquery for
key count, which is appropriate for the expected tenant cardinality (low
hundreds at most).

**No abstraction layers.** Handler functions call DB functions directly and
return responses. No service layer, no repository pattern, no middleware chain.
This is correct for the scale.

**Tests are thorough without being bloated.** DAL tests validate the query
logic directly against the DB. HTTP integration tests verify auth, response
shape, caching headers, and security boundaries. The IP-rotation strategy
for rate limit isolation is pragmatic.

**Security posture is solid.** CSP with `default-src 'none'`, `frame-ancestors
'none'`, `X-Frame-Options: DENY`, `no-store` caching, `textContent` only (no
innerHTML), admin auth gate with client-side throttle after 3 failures.

---

## Findings

### 1. FUNCTIONAL BUG: Frontend references wrong quota field name

**File:** `src/admin/admin-detail.js`, lines 172, 174, 182

**What:** The usage progress bar reads `quota.captures`, but the API returns
`quota.capturesPerMonth` (from `getEffectiveQuota` in `src/quotas.js`). Since
`quota.captures` is always `undefined`, the condition `quota.captures > 0` is
always false and the usage bar never renders.

**Evidence:** The test at `test/admin-dashboard.test.js:386` confirms the API
field is `capturesPerMonth`:
```js
expect(tenant.quota.capturesPerMonth).toBe(200);
```

**Fix:** Change `quota.captures` to `quota.capturesPerMonth` in all three
locations in `admin-detail.js`.

**Complexity assessment:** N/A -- this is a correctness issue, not a complexity
concern. Noting it because it was caught during the review pass and the fix is
trivial. Handoff to the implementing minion.

### 2. MINOR: Duplicated `ADMIN_CACHE` constant

**Files:** `src/admin.js` line 28, `src/admin-dashboard.js` line 24

**What:** Both files define `const ADMIN_CACHE = { 'Cache-Control': 'private, no-store' }`.

**Assessment:** This is a one-line constant. Extracting it into a shared module
would add a file and an import for negligible deduplication. The duplication is
de minimis and not worth addressing unless the constant grows or a third
consumer appears. **No action needed.**

---

## Complexity tally

| Addition | Budget cost | Justification |
|---|---|---|
| 3 API handlers (`admin-dashboard.js`) | 0 | Functions in existing module pattern |
| 3 DB functions (`db.js`) | 0 | Added to existing data access layer |
| 5 UI files (`src/admin/`) | 1 (new abstraction: admin UI module) | Follows existing `src/ui/` pattern; scope-proportional |
| 2 test files | 0 | Tests are not complexity -- they are validation |

**Total budget spend: ~1 point (managed column).** Proportional to the problem.

No new technologies, no new services, no new dependencies, no unnecessary
abstraction layers. The implementation is the minimum viable admin dashboard
and nothing more.

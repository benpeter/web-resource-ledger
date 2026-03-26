# Code Review: Admin Dashboard Feature

Reviewed files: `src/admin-dashboard.js`, `src/admin/admin-shell.js`, `src/admin/admin-auth.js`, `src/admin/admin-tenants.js`, `src/admin/admin-detail.js`, `src/admin/admin-css.js`, `src/db.js` (new DAL), `src/index.js` (routes), `src/rate-limits.js`, `wrangler.toml`, `wrangler.test.toml`, `test/admin-dashboard.test.js`, `test/ui-admin.test.js`, `test/fixtures.js`

---

## VERDICT: ADVISE

No hard blockers. Two semantic correctness issues (naming/label mismatch, missing field) that will mislead operators once in production. Safe to merge if those are addressed or explicitly accepted with a comment.

---

## FINDINGS

### Correctness

- **[ADVISE] src/db.js:2067-2089, src/admin/admin-tenants.js:155** -- `totalStorageBytes` in `getOverviewStats` is period-scoped (the SQL uses `SUM(CASE WHEN period = ? THEN storage_bytes ELSE 0 END)`), but the field name `totalStorageBytes` and the UI label "Total Storage" both imply an all-time aggregate. The analogous fields `totalCapturesCurrentPeriod` vs `totalCapturesAllTime` show the pattern was intentional for captures. Storage does not get the same treatment.

  This will confuse operators: the stat card will show storage shrinking to near-zero at the start of each new billing period.

  Two ways to fix this:
  - Change the SQL to `SUM(storage_bytes) AS total_storage_all_time` and rename the field `totalStorageBytesAllTime`, matching the captures pattern. Update the UI label to "Total Storage (All Time)".
  - Or keep the period-scoped behavior but rename the field `currentPeriodStorageBytes` and fix the UI label to "Storage This Period". No test exists that would catch the mismatch: the empty-DB test passes trivially (both approaches return 0).

  FIX: Pick one semantics and make field name, JSDoc `@returns` comment, UI label, and test description consistent. The test at line 227 currently gives no signal on period-scoping because all values are zero.

- **[ADVISE] src/admin/admin-detail.js:318, src/db.js:2021-2026** -- The API keys table in the detail view falls back to `k.keyHashPrefix` if `k.name` is falsy (line 318: `k.name || k.keyHashPrefix || '(unnamed)'`). But `getTenantDetail` does not return a `keyHashPrefix` field -- the key shape from the DAL is `{ keyHash, name, scopes, createdAt, createdBy }`. `keyHash` is the full 64-hex SHA-256 hash, not a prefix.

  As written, `k.keyHashPrefix` is always `undefined`, so the fallback silently degrades to `'(unnamed)'` instead of showing any key identifier. For keys where `name` is null (old keys created before the name column existed), the operator has no way to identify which key they're looking at.

  FIX: Either have `getTenantDetail` compute and return `keyHashPrefix` (first 8 chars of `key_hash` is the convention used elsewhere), or change the fallback to `k.keyHash ? k.keyHash.slice(0, 8) : '(unnamed)'`. The first option keeps formatting logic server-side.

### Security

- **[NIT] src/admin/admin-auth.js:48-73** -- The client-side login throttle (3 failed attempts -> 30s lockout) resets on page reload because `_adminConsecutive401s` lives in JS memory. This is intentional for a single-operator admin tool (noted in the file comment), and the server-side rate limiter (30 req/60s per IP in `wrangler.toml`) is the real abuse guard. No change required, but the comment at line 9 should be updated to explicitly mention that the server-side rate limiter is the primary brute-force protection, not this client-side counter.

  FIX (optional): Add `// Note: the server-side ADMIN_RATE_LIMITER (30 req/60s) is the primary brute-force guard. This client-side counter improves UX only.`

- **[NIT] src/admin/admin-detail.js:10** -- `document.title = tenantId + ' \u2014 WRL Admin'` assigns a tenant ID from the URL hash directly to `document.title`. `document.title` is not an XSS vector (it sets the tab title, not HTML content), and the tenant ID has already passed the route regex `[a-z0-9_-]{1,64}` before this code runs. No injection risk, but the comment pattern used elsewhere for DOM safety ("Safe: ...") is absent here. Low-priority.

### Design / DRY

- **[NIT] src/admin/admin-tenants.js:50-78, src/admin/admin-detail.js:17-23** -- The live region reconstruction block (create `div#admin-live`, set ARIA attributes, append to `view`) is duplicated verbatim in both `renderTenants` and `renderAdminDetail`. It was already defined once in `renderAdminShell` but gets wiped by `view.textContent = ''` when views re-render. Consider extracting to a shared `restoreAdminLiveRegion(view)` helper.

  This is non-blocking since the inline JS is a string constant; the duplication is a template limitation. Worth addressing in a follow-up if the views grow.

- **[NIT] src/admin/admin-auth.js:158-165, 27-31** -- The fetch+timeout race pattern is duplicated identically in `handleAdminLoginSubmit` (lines 158-165) and `adminFetch` (lines 27-31). The login submit path re-implements the race manually instead of calling `adminFetch`. This is intentional (login submit calls before the key is stored in sessionStorage), but a comment clarifying why it duplicates the pattern would prevent future refactoring confusion.

### SQL Correctness

- **[NIT] src/db.js:1984-1993** -- `getTenantDetail` uses `SELECT *` on the tenants table (line 1985). The other two queries in the batch are explicitly column-listed. `SELECT *` is fine for an internal admin-only tool reading a table the code controls, but it diverges from the DAL's convention of explicit column lists (e.g., `listTenantsWithUsage` names every column). Non-blocking, but worth noting for consistency.

### Test Coverage

- **[ADVISE] test/admin-dashboard.test.js** -- No test verifies the cross-period storage scoping behavior of `getOverviewStats`. Add a test that seeds storage counters in two different periods and asserts which period's value appears in `totalStorageBytes`. This would catch the naming/semantics issue described above and prevent regression regardless of which fix direction is chosen.

  FIX: Add a test analogous to the "all-time captures includes all periods" test (line 276) but for storage, asserting the expected behavior explicitly.

- **[NIT] test/admin-dashboard.test.js:386** -- The quota test (`capturesPerMonth: 200`) couples the test to a specific quota constant. If `FREE_CAPTURE_LIMIT` changes, the test breaks without an obvious connection. Consider importing `FREE_CAPTURE_LIMIT` from `quotas.js` and comparing against it rather than a magic number.

### Route / Import Correctness

All imports resolve correctly. Route ordering is correct: `/v1/admin/tenants/:id/config` patterns at lines 89-90 precede `/v1/admin/tenants/:id` at line 95, so the config routes shadow correctly. The `handleAdminDashboard` function at line 762 correctly delegates to `htmlAdminDashboard()` without auth (HTML shell is public; auth is client-side). The `isAdminRoute` check at line 537 correctly covers all three new API routes (`/v1/admin/tenants`, `/v1/admin/tenants/:id`, `/v1/admin/overview`) since all start with `/v1/admin/`.

### Response Shape Consistency

API-to-frontend field mapping is consistent on the happy path. `problemResponse` at line 134 correctly passes `ADMIN_CACHE` as the headers argument (matches the signature `problemResponse(status, detail, headers, extra)`).

---

## Summary

| Severity | Count |
|----------|-------|
| BLOCK    | 0     |
| ADVISE   | 3     |
| NIT      | 5     |

The two actionable ADVISEs (totalStorageBytes semantics, missing keyHashPrefix fallback) should be resolved before merge. The third ADVISE (missing storage scoping test) is a follow-up if the naming fix is made.

# Test Minion -- Planning Contribution

## Scope of Test Changes

The access model change (individual captures public, list remains authed, share tokens removed) affects **4 test files directly** and **1 fixture file**. The changes are well-contained; there are no deep dependency chains to untangle.

---

## (a) capture-retrieval.test.js: Update In-Place vs. Restructure

**Recommendation: Update in-place, with targeted restructuring of the file header and one describe block deletion.**

The file (`test/capture-retrieval.test.js`, 345 lines) has clean separation into describe blocks. The changes are:

### Auth block (lines 80-125): Invert the model

The entire `GET /v1/captures/{id} -- auth` describe block (5 tests) needs reworking:

- **"unauthenticated request returns 401"** (line 81-86): Flip to `200`. This is the core change -- unauthenticated access now succeeds. Rename to something like `"unauthenticated request returns 200 (public access)"`.
- **"authenticated owner with API key returns 200"** (line 88-96): Keep as-is. Auth still works, it just is no longer *required*.
- **"authenticated owner with session cookie returns 200"** (line 98-104): Keep as-is.
- **"legacy auth..."** (line 106-124): Keep as-is.

The describe block header comment (line 2-9) needs updating to reflect the new security invariants: individual captures are public (128-bit IDs as capability), list endpoint requires auth.

### Tenant isolation block (lines 131-183): Rethink entirely

This is the most conceptually impacted section. With public access, "cross-tenant access returns 404" no longer makes sense as stated -- **anyone** can access any capture by ID. The tenant isolation concept only applies to the **list endpoint** now.

- **"cross-tenant access returns 404"** (line 132-139): Delete. With public access, tenant B *can* read tenant A's capture. This test would need to expect 200, but then it's not testing isolation anymore.
- **"cross-tenant 404 is identical to non-existent capture 404"** (line 142-158): Delete. The premise is gone.
- **"response body does not include ip field"** (line 161-167): Keep (change auth header to no auth -- the IP must never leak regardless of access method).
- **"security headers present on 200"** (line 169-175): Keep (remove auth header requirement).
- **"Cache-Control: private, no-store on 200"** (line 177-182): This needs careful thought. With public access, `Cache-Control: private, no-store` may be wrong -- public captures could be cacheable. The implementation decision drives this test. **Flag for architect: should public capture responses use `public, max-age=N` or remain `private, no-store`?**

**New tests to add in this block:**
- `"unauthenticated request for nonexistent capture returns 404"` -- ensures the 404 response doesn't leak information about whether a capture exists vs. doesn't.
- `"ip field absent from unauthenticated response"` -- critical security assertion.

### Status endpoint block (lines 189-210): Same pattern

- **"unauthenticated returns 401"** (line 190-192): Flip to `200`.
- **"authenticated owner returns 200"** (line 195-209): Keep.
- **"cross-tenant access returns 404"** (line 204-209): Delete (public access).

### Artifacts block (lines 216-311): Flip all unauth tests

- **"unauthenticated screenshot returns 401"** (line 217-219): Flip to `200`.
- **"unauthenticated html returns 401"** (line 221-225): Flip to `200`.
- **"unauthenticated wacz returns 200"** (line 227-231): Already correct (WACZ was already public).
- **"authenticated owner can access screenshot/html/wacz"** (lines 233-254): Keep.
- **"cross-tenant screenshot/html/wacz access returns 404"** (lines 256-275): Delete all three. Public access means no cross-tenant enforcement on individual captures.
- **"unauthenticated headers returns 401"** (line 277-279): Flip to `200`.
- **"unauthenticated wacz for non-existent capture returns 404"** (line 282-286): Keep.
- **"unauthenticated wacz for incomplete capture returns 404"** (line 288-293): Keep.
- **"cross-tenant 404 is identical to non-existent capture 404 for artifacts"** (line 295-311): Delete.

### Share token propagation block (lines 314-345): Delete entirely

The entire `"share token propagation to artifact URLs"` describe block must be deleted. Both tests reference `seedShareToken` and test `?token=` query param propagation -- this is the share token system being removed.

### Summary of line-level changes

| Action | Lines affected | Tests |
|--------|---------------|-------|
| Flip 401->200 | ~6 tests | unauth metadata, status, screenshot, html, headers |
| Delete | ~8 tests | all cross-tenant tests, share token propagation block |
| Update | ~4 tests | remove auth headers from remaining security/header tests |
| Add | ~2 tests | unauthenticated 404, IP absence without auth |

The file structure (describe blocks) stays the same except the share token block is removed. No restructure needed -- the existing grouping works.

### Import cleanup

Remove `seedShareToken` from the imports (line 18). The other imports (`cleanDb`, `seedApiKey`, `seedCapture`, `createTestSession`, `TEST_TENANT_KEY`, `TEST_TENANT_KEY_B`) are still needed -- the list tests and authenticated access tests still use them.

---

## (b) share-token.test.js: Clean Removal

**Delete `test/share-token.test.js` entirely.** (374 lines)

### Dependency analysis

The file imports from:
- `cloudflare:test` -- framework, no issue
- `vitest` -- framework, no issue
- `../src/db.js` -- `createCapture`, `completeCapture` -- used by many tests, not affected
- `./fixtures.js` -- `cleanDb`, `seedApiKey`, `seedCapture`, `seedShareToken`, `TEST_TENANT_KEY` -- shared helpers

**No other test file imports from `share-token.test.js`.** It is entirely self-contained. Safe to delete.

### Fixtures cleanup (test/fixtures.js)

The `seedShareToken` function (lines 346-365) should be removed from `test/fixtures.js`. Consumers:
- `test/capture-retrieval.test.js` line 18 (import) and lines 321-333 (usage) -- both go away in (a)
- `test/share-token.test.js` -- deleted entirely

The `cleanDb` function (line 376) has `db.prepare('DELETE FROM share_tokens')` at line 382. This must remain **until the D1 migration drops the table** -- if you remove the DELETE before the migration, `cleanDb` will throw on the missing table. The ordering is:

1. First: remove `seedShareToken` export and all call sites
2. First: delete `share-token.test.js`
3. Later (after D1 migration drops share_tokens table): remove `DELETE FROM share_tokens` from `cleanDb`
4. Later: remove `migrations/0010_share_tokens.sql` or add a drop migration

**Risk: migration ordering.** The `cleanDb` DELETE will fail if run against a DB without the `share_tokens` table. If the plan is to drop the table in a migration that runs before tests, then `cleanDb` must be updated simultaneously. Use `DELETE FROM share_tokens` -> wrap in try/catch or remove the line when the migration lands. Safest: add the DROP TABLE migration and update cleanDb in the **same commit**.

### Source cleanup

`src/share-tokens.js` (111 lines) should be deleted entirely. It exports:
- `generateShareToken` -- imported in `src/index.js` (line 28) and `test/share-token.test.js`
- `hashShareToken` -- imported in `src/index.js` (line 28), `test/fixtures.js` (line 357)
- `createShareToken` -- imported in `src/index.js` (line 28)
- `getShareTokenByHash` -- imported in `src/index.js` (line 28)
- `deleteExpiredShareTokens` -- imported in `src/index.js` (line 28)

All source imports come from `src/index.js` line 28. When the auth middleware (lines 466-511 of index.js) is simplified and the `/share` route (line 69) is removed, all these imports become dead.

---

## (c) verify-page.spec.js: E2E Root Cause Analysis

**The E2E verify page test is likely already passing after commits `e870439` and `7004f1f`.**

### Root cause timeline

1. Phase 0062 added auth to all `GET /v1/captures/*` endpoints
2. The verify page's client-side JS was fetching `/v1/captures/{id}` **without authentication** to get the capture URL and screenshot URLs
3. This fetch started returning 401, causing:
   - The captured URL display to break (it depended on the captures response)
   - Screenshot display to break (artifact URLs came from captures response)
   - Console errors from the failed fetch (the E2E spec asserts zero console errors)

### Fixes already applied

- `e870439`: Added `capture.url` to the `/v1/verify/{id}` response so the verify page gets the URL from the verify endpoint instead of the captures endpoint
- `7004f1f`: Removed the `/v1/captures/{id}` fetch entirely from the verify page JS; now calls `populate(verifyData, null)` with null for `retrievalData`

### Current state of verify-page.spec.js

The spec (157 lines) tests:
1. **Browser rendering** (line 61-103): Navigates to `/v1/verify/{captureId}`, waits for `.result-content.visible`, checks status heading, checks `example.com` text, asserts zero console errors
2. **JSON API** (line 110-137): Fetches `/v1/verify/{captureId}` with Accept: application/json, checks verified/checks/signing/CORS
3. **404 for nonexistent** (line 143-156): Fetches verify for fake ID, expects 404

**None of these tests touch share tokens or the captures endpoint.** The `beforeAll` creates a capture via authenticated `POST /v1/captures`, which is still authed.

### Minimal fix needed for the E2E spec

**Likely none.** The spec should pass as-is against the current codebase (post-`7004f1f`). The E2E failure described in the issue was caused by the auth gate breaking the verify page's JS, which has been fixed in the two recent commits.

However, with the new public access model, there is an opportunity to **enhance** the verify page spec:
- After capture completes, make an **unauthenticated** `GET /v1/captures/{captureId}` and assert it returns 200 -- this is a direct regression test for the access model
- Check that screenshot URLs in the response work without auth

But these are additive tests, not fixes. The existing spec should pass.

### One caveat

The spec's `beforeAll` polls status via `pollUntilComplete(apiFetch, captureId, 120_000)` which uses the **authenticated** fetch wrapper. With public access, this could be simplified to use unauthenticated fetch, but the authenticated version still works. No change required.

---

## (d) Other Test Files Referencing Share Tokens or Capture Auth

### Comprehensive search results

| File | Share token refs? | Capture auth assertions? | Action needed? |
|------|-------------------|--------------------------|----------------|
| `test/fixtures.js` | `seedShareToken` function, `DELETE FROM share_tokens` in `cleanDb` | No | Remove `seedShareToken`, update `cleanDb` when migration lands |
| `test/capture-retrieval.test.js` | Import + usage of `seedShareToken` | 6 tests asserting 401 on unauth | See (a) above |
| `test/share-token.test.js` | Entire file | N/A | Delete (see (b)) |
| `test/verify-integration.test.js` | No share tokens | Tests retrieval auth at lines 338-375 | These tests use legacy auth (`Bearer test-api-key-for-vitest`) and will continue to work. The `verifyUrl` tests don't assert auth requirements. No change needed. |
| `test/e2e/capture-verify.spec.js` | No share tokens | Uses authenticated fetch for capture detail (line 57) | Works with auth. Could optionally add unauthenticated variant. No change needed. |
| `test/list-captures.test.js` | No share tokens | Likely asserts auth on list endpoint | **Must remain unchanged** -- list stays authed |
| `test/security-headers.test.js` | No share tokens | May assert auth-dependent headers | Check if any tests assume 401 on capture routes |
| `test/auth.test.js` | No share tokens | Auth middleware tests | May need updates if auth middleware behavior changes for capture routes |
| `test/cors.test.js` | No share tokens | May test CORS on capture routes | Review for auth assumptions |

### Files to double-check (search for 401 on capture routes)

Let me be specific about `test/auth.test.js` and `test/security-headers.test.js`:

- `test/auth.test.js`: Tests the auth middleware generically. The middleware will still exist for list endpoints and POST endpoints. The changes to the capture GET auth gate are tested in `capture-retrieval.test.js`. **Likely no changes needed** unless auth.test.js has specific assertions about capture GET routes.
- `test/security-headers.test.js`: Tests security headers on responses. If any test sends unauthenticated requests to capture endpoints and expects 401 response headers, those expectations change. Worth a quick review.

---

## Execution Order and Risk Summary

### Recommended order

1. **Delete `test/share-token.test.js`** -- cleanest removal, no dependencies
2. **Remove `seedShareToken` from `test/fixtures.js`** -- only consumers are share-token.test.js (deleted) and capture-retrieval.test.js (updated next)
3. **Update `test/capture-retrieval.test.js`** -- flip auth expectations, delete cross-tenant and share token blocks, update imports
4. **Quick-scan `test/auth.test.js`, `test/security-headers.test.js`, `test/cors.test.js`** for any capture-route auth assumptions and fix if found
5. **Run full test suite** -- `npx vitest run` to catch any missed references
6. **D1 migration to drop share_tokens table** -- separate commit, paired with `cleanDb` update

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Forgetting a share token reference | Low | `grep -r "share" test/` after changes |
| `cleanDb` breaking if share_tokens table removed before code updated | Medium | Same-commit: migration + cleanDb update |
| Cache-Control header change on public captures breaking header tests | Medium | Decide caching policy before writing tests |
| Auth middleware changes break tests in unexpected files | Low | Run full suite, check auth.test.js |
| E2E tests flaky after deploy | Low | The verify-page.spec.js fixes are already landed |

### Tests that MUST NOT change

- `test/verify-integration.test.js` -- The `/v1/verify/` endpoint remains public. These tests are the canary.
- `test/list-captures.test.js` -- The list endpoint remains authed. If any test asserts 401 on unauth list, it must stay.
- All `POST /v1/captures` tests -- Capture creation remains authed.

### Net test count change

- Deleted: ~38 tests (share-token.test.js) + ~10 tests (cross-tenant, share token propagation in capture-retrieval.test.js) = **~48 tests removed**
- Added: ~2 new tests (unauthenticated 404, IP field absence without auth)
- Modified: ~8 tests (flip 401->200, remove auth headers)
- **Net: ~46 fewer tests**, but with higher confidence in the actual access model. The deleted tests were testing a share token system that no longer exists and cross-tenant isolation that no longer applies to individual capture access.

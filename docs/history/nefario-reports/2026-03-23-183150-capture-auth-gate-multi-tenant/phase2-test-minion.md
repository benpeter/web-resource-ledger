# Domain Plan Contribution: test-minion

## Recommendations

### Current State Analysis

The codebase currently uses an "ID as secret" model for capture retrieval: `handleGetCapture`, `handleGetCaptureArtifact`, `handleCaptureStatus`, and `handleVerifyCapture` are all **unauthenticated**. The DB function `getCapture(db, captureId)` does a bare `SELECT * FROM captures WHERE id = ?` with no tenant filtering. The only tenant-scoped endpoint today is `GET /v1/captures` (list), which already authenticates via `verifyAuth()` and passes `tenantId` to `listCaptures()`.

The test suite uses Vitest with `@cloudflare/vitest-pool-workers` running against real D1/R2 miniflare bindings. Tests are structured as flat `.test.js` files in `test/`, with E2E tests in `test/e2e/` using Playwright. The shared `test/fixtures.js` module provides `seedApiKey`, `seedCapture`, `createTestSession`, `cleanDb`, and other helpers. The existing `capture-retrieval.test.js` explicitly asserts `no auth required` (line 74) -- this test must change.

### Test Strategy: Three Layers

The auth gate introduces branching logic at the HTTP handler level, new data structures (share tokens), and changes existing public contracts (retrieval endpoints become authenticated). The testing pyramid should be:

**Unit tests (70%)**: Auth middleware decision logic, share token validation/expiry logic, tenant-scoping in DB queries. These are fast, isolated, and exercise every branch.

**Integration tests (20%)**: Full HTTP request/response flows through `SELF.fetch()` using miniflare bindings. These validate that the router, auth middleware, DB queries, and response shaping work together correctly. This is where tenant isolation and share token lifecycle get their strongest validation.

**E2E tests (10%)**: Update existing `capture-verify.spec.js` and `verify-page.spec.js` to confirm the CLI verify flow still works unauthenticated against staging. One new E2E test for the share token flow if share tokens are part of the initial implementation.

### Critical Test Dimension: What NOT To Break

The CLI `wrl verify` tool currently fetches `GET /v1/verify/{id}` without authentication. This is the product's core trust primitive -- anyone with a capture ID can independently verify the capture's integrity. Breaking this would destroy the product's value proposition. The verify endpoint **must remain unauthenticated** (or have a separate backward-compatible path).

## Proposed Tasks

### Task 1: Update `capture-retrieval.test.js` -- Auth Gate on Retrieval Endpoints

**File**: `test/capture-retrieval.test.js`

The existing test file explicitly asserts "no auth required" on `GET /v1/captures/{id}`. This must be rewritten to test the new auth-gated behavior. Test scenarios:

**1a. Authenticated owner access (happy path)**
- Tenant A creates a capture, tenant A retrieves it with valid API key -> 200
- Tenant A creates a capture, tenant A retrieves it with valid session cookie -> 200
- Response shape unchanged from current tests (artifacts, wacz, verifyUrl all present)

**1b. Cross-tenant isolation (security-critical)**
- Tenant A creates a capture, tenant B requests it with valid API key -> 404 (NOT 403)
  - Using 404 rather than 403 prevents capture ID enumeration
- Tenant A creates a capture, unauthenticated request -> 401 (was 200, now gated)
- Same cross-tenant 404 behavior on all sub-routes:
  - `GET /v1/captures/{id}/status` -- cross-tenant -> 404
  - `GET /v1/captures/{id}/artifacts/screenshot` -- cross-tenant -> 404
  - `GET /v1/captures/{id}/artifacts/html` -- cross-tenant -> 404
  - `GET /v1/captures/{id}/artifacts/wacz` -- cross-tenant -> 404

**1c. Edge cases**
- Legacy auth (`authMethod: 'legacy'`, `tenantId: 'default'`) can still access captures owned by `default` tenant
- Capture exists but belongs to different tenant, with valid format ID -> indistinguishable from "capture doesn't exist"
- Revoked API key -> 401 (not 404 -- auth failure happens before tenant check)
- Read-only scope (`['read']`) should suffice for retrieval (no `capture` scope required)

**Implementation notes**: This test will need two distinct API key fixtures (tenant A and tenant B). Add `TEST_TENANT_KEY_B` and a second tenant ID to `fixtures.js`. Use `seedCapture` to create captures owned by each tenant.

### Task 2: New `share-token.test.js` -- Share Token Lifecycle

**File**: `test/share-token.test.js` (new)

Share tokens provide time-limited, unauthenticated access to specific captures. Test scenarios:

**2a. Token creation**
- Authenticated tenant creates share token for own capture -> 201 with token string
- Share token response includes: `token`, `captureId`, `expiresAt`, `createdAt`
- Creating token for non-owned capture -> 404
- Creating token for non-existent capture -> 404
- Creating token without authentication -> 401

**2b. Token usage (happy path)**
- Valid share token in query param `?token=xxx` grants access to `GET /v1/captures/{id}` -> 200
- Valid share token grants access to artifact sub-routes -> 200
- Response shape matches authenticated access (same fields, same artifact URLs)

**2c. Token expiry**
- Expired share token -> 401 or 404 (design decision: should expired token reveal existence?)
- Token with `expiresAt` in the past is rejected
- Token validity checked against server time, not client time

**2d. Token security**
- Share token for capture A does not grant access to capture B -> 404
- Malformed token string -> 401
- Empty token parameter -> treated as unauthenticated -> 401
- Token cannot be used to list captures (only specific capture access)
- Token cannot be used to create new captures

**2e. Token management**
- List share tokens for a capture (authenticated as owner) -> 200 with array
- Revoke a share token (authenticated as owner) -> 204
- Revoked token no longer grants access -> 401/404

### Task 3: Preserve `verify-integration.test.js` and `verify.test.js` -- CLI Backward Compat

**Files**: `test/verify-integration.test.js`, `test/verify.test.js`

These existing tests validate that `GET /v1/verify/{id}` works without authentication. The critical assertion is:

- `GET /v1/verify/{id}` remains **unauthenticated** -- no `Authorization` header, no share token, no session cookie required
- The verify endpoint response does NOT include `url` (already tested, must stay true)
- Cross-tenant verification works: any capture can be verified by anyone (this is the trust model)
- The verify page HTML rendering still works without auth
- Rate limiting on verify endpoint is per-IP, not per-tenant (unchanged)

**No changes needed to these test files** unless the verify endpoint contract changes. However, these tests serve as regression guards and should be explicitly re-run after the auth gate changes to confirm they still pass unchanged. Add a comment block at the top of `verify-integration.test.js` noting the backward-compat contract:

```js
// BACKWARD COMPAT: These tests validate the CLI verify contract.
// GET /v1/verify/{id} MUST remain unauthenticated.
// Changes to capture retrieval auth gates must NOT affect this endpoint.
```

### Task 4: Update `list-captures.test.js` -- Confirm Existing Tenant Isolation

**File**: `test/list-captures.test.js`

The list endpoint is already tenant-scoped. Add explicit cross-tenant tests if not present:

- Tenant A has captures, tenant B lists captures -> empty result (not tenant A's captures)
- Tenant A has captures, tenant A lists -> sees own captures
- This confirms the existing behavior is consistent with the new retrieval auth gate

### Task 5: New DB-Level Unit Tests for Tenant-Scoped Retrieval

**File**: `test/db.test.js` (add new describe block)

If `getCapture()` is modified to accept a `tenantId` parameter for tenant-scoped lookups:

- `getCapture(db, captureId, tenantId)` with matching tenant -> returns record
- `getCapture(db, captureId, wrongTenantId)` -> returns null
- `getCapture(db, captureId)` without tenantId (backward compat for verify) -> returns record regardless of tenant
- This is the foundational isolation test -- if this fails, everything above it fails

### Task 6: Update `test/fixtures.js` -- Multi-Tenant Test Helpers

**File**: `test/fixtures.js`

Add shared constants and helpers for multi-tenant testing:

```js
export const TEST_TENANT_KEY_B = 'wrl_live_' + 'b'.repeat(43);
export const TENANT_A = 'tenant-alpha';
export const TENANT_B = 'tenant-beta';

export async function seedShareToken(db, { captureId, tenantId, token, expiresAt }) { ... }
```

These helpers centralize multi-tenant test data creation and prevent duplication across test files.

### Task 7: Update E2E Tests for Auth Gate

**File**: `test/e2e/capture-verify.spec.js`

The E2E golden path test currently does:
1. POST /v1/captures (authenticated)
2. Poll /v1/captures/{id}/status (authenticated)
3. GET /v1/captures/{id} (currently unauthenticated)
4. GET /v1/captures/{id}/artifacts/screenshot (currently unauthenticated)

Steps 3 and 4 will break if auth is required. Update to include the `Authorization` header on retrieval requests. Also add a negative test: unauthenticated retrieval returns 401.

The `verify-page.spec.js` test should pass unchanged (verify is unauthenticated). This is the canary for CLI backward compat.

### Task 8: `handleCaptureStatus` Auth Gate Tests

**File**: `test/capture-retrieval.test.js` or new `test/capture-status.test.js`

The status polling endpoint (`GET /v1/captures/{id}/status`) is currently unauthenticated but is only used during the capture lifecycle. It needs auth gating consistent with the retrieval endpoint:

- Authenticated owner polls own capture -> 200 with status
- Cross-tenant poll -> 404
- Unauthenticated poll -> 401
- This is critical because the E2E flow polls this endpoint after creating a capture

## Risks and Concerns

### Risk 1: Breaking the CLI Verify Tool (Severity: Critical)

The `/v1/verify/{id}` endpoint MUST remain unauthenticated. If any auth middleware is applied broadly (e.g., a blanket auth gate on all `/v1/captures/` routes), the verify endpoint could accidentally require auth. The verify endpoint uses `getCapture()` internally, so if that function is modified to require a tenant ID, the verify path breaks.

**Mitigation**: Keep `getCapture(db, captureId)` (no tenant) as the verify path. Add `getCaptureForTenant(db, captureId, tenantId)` or add an optional `tenantId` parameter. The verify tests serve as regression guards.

### Risk 2: 404 vs 403 Leaking Capture Existence (Severity: High)

Cross-tenant access must return 404, not 403. If the implementation checks "capture exists" and then "tenant matches" as separate steps, a 403 would reveal that the capture ID is valid. The DB query should combine both checks: `WHERE id = ? AND tenant_id = ?`.

**Mitigation**: Unit test at the DB level that cross-tenant returns null, not a record with a mismatch flag. Integration test that the HTTP response is indistinguishable from a non-existent capture.

### Risk 3: Share Token Timing Attacks (Severity: Medium)

Token validation must use timing-safe comparison (already established pattern in `auth.js`). If share tokens are stored as hashes in D1 (following the API key pattern), this is handled by the hash lookup. If they're compared directly, timing-safe comparison is required.

**Mitigation**: Test that the share token validation path follows the same security patterns as API key validation. Add a test that verifies share tokens are not echoed in error responses (following existing pattern from `auth.test.js` line 276).

### Risk 4: Legacy Auth Backward Compatibility (Severity: High)

The `CAPTURE_API_KEY` legacy auth path returns `tenantId: 'default'`. All existing captures belong to the `default` tenant. After adding auth gates, legacy-auth users must still access their captures. If the migration introduces new tenant IDs without migrating existing captures, legacy users lose access.

**Mitigation**: Test that legacy auth (`authMethod: 'legacy'`, `tenantId: 'default'`) can access captures owned by `default`. Test that new KV-auth tenants cannot see `default` tenant captures.

### Risk 5: Existing Test Suite Breakage (Severity: High)

`capture-retrieval.test.js` uses `SELF.fetch()` without any `Authorization` header and expects 200. When auth gates are added, every test in this file will fail. The file must be updated as part of the implementation, not after.

**Mitigation**: Update `capture-retrieval.test.js` in the same PR as the auth gate code changes. Do not merge auth gate code without updating these tests -- the CI will fail.

### Risk 6: `handleCaptureStatus` Polling During Capture Lifecycle (Severity: Medium)

The status endpoint is called immediately after `POST /v1/captures` returns 202. If the capture is created by tenant A, and the status poll requires auth, the poll request must carry the same auth credentials. The E2E test flow currently does this (uses `authenticatedFetch`), but the unit tests in `capture-integration.test.js` may not.

**Mitigation**: Audit `capture-integration.test.js` for any unauthenticated status polls. Update to include auth headers.

## Additional Agents Needed

### api-design-minion

Decisions needed before tests can be finalized:

1. **Share token transport**: Query parameter (`?token=xxx`) or `Authorization: ShareToken xxx` header? This affects how tests construct requests.
2. **Share token scope**: Does a share token grant access to status, artifacts, AND verify? Or just the detail endpoint? The test matrix depends on this.
3. **404 vs 401 for unauthenticated retrieval**: Should unauthenticated requests to `GET /v1/captures/{id}` return 401 (revealing the endpoint exists but needs auth) or 404 (hiding existence)? The current pattern uses 404 for unknown routes, so 401 would be a signal that the route exists.
4. **Share token creation endpoint**: What URL path? `POST /v1/captures/{id}/share`? `POST /v1/shares`? This determines routing test setup.
5. **Verify endpoint tenant visibility**: Should `GET /v1/verify/{id}` return `url` only to authenticated owners? Currently `url` is omitted from verify responses. If adding tenant context to verify, the response shape changes.

### security-minion

Review needed for:
1. Share token entropy and format (e.g., `shr_xxxx` prefix following existing conventions)
2. Whether share tokens should be hashed in D1 (following API key pattern) or stored as opaque tokens
3. Whether expired/revoked share tokens should return 401 (revealing token was once valid) or 404
4. Timing-safe comparison requirements for share token validation

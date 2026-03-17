# Domain Plan Contribution: test-minion

## Recommendations

### 1. Rewrite test/auth.test.js, don't extend

The current `test/auth.test.js` tests a single-key `CAPTURE_API_KEY` comparison flow. The R12 auth rewrite changes the fundamental structure: KV-based key lookup by SHA-256 hash, scope enforcement, three distinct auth paths (ADMIN_KEY, KV key, CAPTURE_API_KEY fallback), and soft-delete revocation. Extending the existing file would create a confusing mix of old and new assumptions. A full rewrite is cleaner and safer.

The new `test/auth.test.js` should preserve the same structure: `describe` blocks for success, wrong/malformed key, missing auth header, misconfigured environment, RFC 9457 response shape, and key-not-leaked security assertions. Add new blocks for scope enforcement and revocation.

### 2. KV mock pattern: use real miniflare KV via `env.KV`

The project already uses `@cloudflare/vitest-pool-workers` with miniflare-backed KV. Every existing test (kv.test.js, key-rotation.test.js, list-captures.test.js) uses `import { env } from 'cloudflare:test'` and writes/reads real KV records. The auth rewrite must follow this established pattern.

For auth tests, seed API key records directly into KV via `env.KV.put()` before each test. This matches how kv.test.js seeds capture records. Do NOT mock the KV namespace -- the project explicitly rejects mock-based testing per CLAUDE.md ("mocking out the browser is like testing an HTTP server without sending requests" -- same principle applies to KV).

The auth module will need to accept a KV namespace (likely via `env.KV`) rather than reading it from a closure, matching the existing `getCapture(env.KV, ...)` and `listCaptures(env.KV, ...)` patterns.

**KV key schema for test fixtures**: Seed keys with the `apikey-hash:` prefix (or whatever the implementation settles on). The test must construct the SHA-256 hash of a known test key, write the key record to KV, then use that raw key in the `Authorization: Bearer` header.

```js
// Example pattern for auth test setup
const TEST_RAW_KEY = 'wrl_live_' + 'a'.repeat(43); // known raw key
const keyHash = await sha256hex(TEST_RAW_KEY);      // compute lookup hash

await env.KV.put(`apikey-hash:${keyHash}`, JSON.stringify({
  keyId: 'key_test01',
  keyName: 'test-key',
  tenantId: 'acme',
  scopes: ['capture', 'read'],
  createdAt: '2026-01-01T00:00:00.000Z',
  revoked: false,
}));
```

### 3. vitest.config.js needs new bindings

The vitest config must add `ADMIN_KEY` to the `miniflare.bindings` section so the ADMIN_KEY superadmin auth path is testable. No `CAPTURE_API_KEY` removal yet -- dual-mode fallback requires it to remain.

```js
bindings: {
  CAPTURE_API_KEY: 'test-api-key-for-vitest',
  ADMIN_KEY: 'test-admin-key-for-vitest',
  // ... existing bindings
}
```

### 4. test/admin.test.js: new file, follows list-captures.test.js patterns

The admin API endpoint tests should follow the established endpoint testing pattern from `test/list-captures.test.js`:
- Import `{ env, SELF } from 'cloudflare:test'`
- Use `SELF.fetch()` for HTTP endpoint tests
- Seed KV state in `beforeEach`
- Clean up KV state between tests (list + delete all `apikey-hash:` and `apikey-list:` prefixed keys)
- Helper functions for common operations (e.g., `createKey()`, `listKeys()`)

### 5. No integration tests for admin API

The existing `test/integration/` suite exercises real browser captures with Playwright. The admin API is pure HTTP + KV -- no browser, no R2, no external services. The unit tests with miniflare KV are the real boundary test. Adding admin API to the integration suite would add complexity and runtime with no additional confidence.

The admin API SHOULD be covered in the staging smoke test (`scripts/smoke-test.sh`) post-deploy. One round-trip: create key, list keys (verify present), revoke key, list keys (verify absent), attempt capture with revoked key (verify 401). This validates the deployed configuration without bloating the integration test suite.

### 6. Existing test files that need auth-related updates

Several test files hardcode `const AUTH = 'Bearer test-api-key-for-vitest'`. These must continue to work because `CAPTURE_API_KEY` is maintained as a dual-mode fallback. No changes needed to:
- `test/list-captures.test.js` (uses `AUTH` with `CAPTURE_API_KEY`)
- `test/capture-integration.test.js` (uses `CAPTURE_API_KEY`)

This is a feature, not a gap: if these tests break, the dual-mode fallback is broken.

---

## Test Matrix

### A. Auth Module (`test/auth.test.js` -- rewrite)

#### A1. KV-based key lookup (happy path)

| # | Test case | Key type | Expected |
|---|-----------|----------|----------|
| 1 | Valid KV key with `capture` scope on POST /v1/captures | KV key | `{ ok: true, tenantId, scopes, keyName }` |
| 2 | Valid KV key with `read` scope on GET /v1/captures | KV key | `{ ok: true }` |
| 3 | Valid KV key with `admin` scope on admin endpoints | KV key | `{ ok: true }` |
| 4 | `capture` scope implies `read` (capture key works on list endpoint) | KV key | `{ ok: true }` |
| 5 | Returns correct tenantId from key record | KV key | tenantId matches record |
| 6 | Returns correct keyName from key record | KV key | keyName matches record |

#### A2. ADMIN_KEY auth

| # | Test case | Expected |
|---|-----------|----------|
| 7 | ADMIN_KEY grants admin scope | `{ ok: true, scopes: ['admin', 'capture', 'read'] }` |
| 8 | ADMIN_KEY returns a synthetic tenantId (e.g., `'_superadmin'` or `'*'`) | tenantId distinguishes from regular tenants |
| 9 | ADMIN_KEY is checked via timing-safe comparison, not KV lookup | ok: true even with empty KV |

#### A3. CAPTURE_API_KEY dual-mode fallback

| # | Test case | Expected |
|---|-----------|----------|
| 10 | CAPTURE_API_KEY works when no KV keys exist | `{ ok: true, tenantId: 'default' }` |
| 11 | CAPTURE_API_KEY grants capture+read scopes | scopes include capture and read |
| 12 | CAPTURE_API_KEY does NOT grant admin scope | scopes exclude admin |
| 13 | CAPTURE_API_KEY returns `tenantId: 'default'` | Backward compat |

#### A4. Scope enforcement (403 paths)

| # | Test case | Expected |
|---|-----------|----------|
| 14 | `read`-only key on POST /v1/captures returns 403 | 403 with scope detail |
| 15 | `capture` key on POST /v1/admin/keys returns 403 | 403 with scope detail |
| 16 | `read` key on DELETE /v1/admin/keys/{keyId} returns 403 | 403 |
| 17 | 403 response is RFC 9457 shaped | `{ type, status: 403, title, detail }` |
| 18 | 403 detail names the required scope (e.g., "Requires 'admin' scope") | detail contains scope name |
| 19 | 403 detail does NOT name the key's actual scopes | No information leak |

#### A5. Revoked keys

| # | Test case | Expected |
|---|-----------|----------|
| 20 | Revoked key returns 401 (not 403) | 401 -- indistinguishable from invalid |
| 21 | Revoked key response is identical to "wrong key" response | Same status, same detail text |
| 22 | Revoked key does NOT return tenantId | No info leak about tenant structure |

#### A6. Error paths (401)

| # | Test case | Expected |
|---|-----------|----------|
| 23 | Missing Authorization header | 401 + WWW-Authenticate: Bearer |
| 24 | Non-Bearer scheme ("Basic abc") | 401 |
| 25 | Empty token ("Bearer ") | 401 |
| 26 | Valid format but key not in KV | 401 |
| 27 | Key that doesn't start with `wrl_live_` prefix | 401 (reject early, don't hash) |

#### A7. Misconfigured environment

| # | Test case | Expected |
|---|-----------|----------|
| 28 | No CAPTURE_API_KEY, no ADMIN_KEY, no KV binding | 503 |
| 29 | KV available but no ADMIN_KEY or CAPTURE_API_KEY | Auth still works for KV keys |

#### A8. Security invariants

| # | Test case | Expected |
|---|-----------|----------|
| 30 | Error response never contains the provided bearer token | body doesn't contain token |
| 31 | Error response never contains stored key material | body doesn't contain key hash |
| 32 | Error response never reveals whether key exists vs wrong scope | Same 401 for nonexistent and wrong-scope (unless authenticated) |
| 33 | Timing: KV miss (key not found) and KV hit with wrong key return same status | Both 401 |

### B. KV API Key Operations (`test/kv.test.js` -- extend or new section)

| # | Test case | Function | Expected |
|---|-----------|----------|----------|
| 34 | putApiKey writes to `apikey-hash:{hash}` | putApiKey | Record exists at correct key |
| 35 | putApiKey writes list entry `apikey-list:{tenantId}:{keyId}` | putApiKey | List entry exists |
| 36 | getApiKeyByHash returns parsed record | getApiKeyByHash | Correct shape |
| 37 | getApiKeyByHash returns null for missing hash | getApiKeyByHash | null |
| 38 | listApiKeys returns keys for given tenant only | listApiKeys | Tenant isolation |
| 39 | listApiKeys excludes keys from other tenants | listApiKeys | Cross-tenant isolation |
| 40 | deleteApiKey sets revoked: true, revokedAt timestamp | deleteApiKey | Soft-delete, timestamp present |
| 41 | deleteApiKey preserves all other fields | deleteApiKey | tenantId, scopes unchanged |
| 42 | deleteApiKey is idempotent (revoking already-revoked key succeeds) | deleteApiKey | No error |
| 43 | putApiKey for duplicate keyId overwrites | putApiKey | Idempotent |

### C. Admin API Endpoints (`test/admin.test.js` -- new file)

#### C1. POST /v1/admin/keys

| # | Test case | Expected |
|---|-----------|----------|
| 44 | Valid request with admin key creates key, returns 201 | 201, response includes raw key (shown once) |
| 45 | Response includes keyId, keyName, tenantId, scopes, createdAt | All fields present |
| 46 | Response includes raw key starting with `wrl_live_` | Key prefix correct |
| 47 | Missing Content-Type returns 415 | 415 |
| 48 | Missing `name` field returns 400 | 400 |
| 49 | Missing `tenantId` field returns 400 | 400 |
| 50 | Invalid tenantId format (uppercase, colon, >64 chars) returns 400 | 400 with detail |
| 51 | Invalid scope value returns 400 | 400 |
| 52 | Empty scopes array defaults to `['capture', 'read']` | Default scopes applied |
| 53 | No auth returns 401 | 401 |
| 54 | Capture-scope key returns 403 | 403 -- admin scope required |
| 55 | ADMIN_KEY auth works for key creation | 201 |
| 56 | KV admin key with admin scope works for key creation | 201 |
| 57 | Created key can immediately authenticate | Round-trip: create then use |
| 58 | Duplicate keyName for same tenant is allowed (or returns 409 -- depends on design) | Defined behavior |

#### C2. GET /v1/admin/keys

| # | Test case | Expected |
|---|-----------|----------|
| 59 | Returns list of keys for the authenticated tenant | 200, array of key summaries |
| 60 | ADMIN_KEY returns keys across all tenants (or scoped -- design-dependent) | Defined behavior |
| 61 | KV admin key returns only keys for its own tenant | Tenant isolation |
| 62 | Response never includes raw key material | No `key` or `rawKey` field |
| 63 | Response includes: keyId, keyName, tenantId, scopes, createdAt, revoked | All metadata fields |
| 64 | Revoked keys appear in list (with `revoked: true`) | Visible for audit |
| 65 | No auth returns 401 | 401 |
| 66 | Read-scope key returns 403 | 403 |
| 67 | Empty result returns 200 with empty array | `{ keys: [] }` |

#### C3. DELETE /v1/admin/keys/{keyId}

| # | Test case | Expected |
|---|-----------|----------|
| 68 | Valid delete soft-revokes key, returns 200 | 200, key marked revoked |
| 69 | Revoked key becomes immediately unusable for auth | Subsequent auth returns 401 |
| 70 | Delete nonexistent keyId returns 404 | 404 |
| 71 | Delete already-revoked key returns 200 (idempotent) or 404 | Defined behavior |
| 72 | No auth returns 401 | 401 |
| 73 | Non-admin key returns 403 | 403 |
| 74 | Tenant-scoped admin cannot revoke keys from other tenant | 404 (key not visible) |
| 75 | ADMIN_KEY can revoke any key | 200 |
| 76 | Response body includes revokedAt timestamp | Timestamp present |

#### C4. Admin API headers and errors

| # | Test case | Expected |
|---|-----------|----------|
| 77 | All admin responses have security headers (Referrer-Policy, X-Content-Type-Options, etc.) | Headers present |
| 78 | Cache-Control: private, no-store on all admin responses | No caching |
| 79 | X-RateLimit-Limit header present on admin responses | Rate limit ceiling |
| 80 | PUT /v1/admin/keys returns 404 (unsupported method) | 404 per existing router behavior |

### D. Tenant Isolation on Existing Endpoints

| # | Test case | Expected |
|---|-----------|----------|
| 81 | Tenant A's key cannot see Tenant B's captures in GET /v1/captures | Empty list |
| 82 | Tenant A's key cannot access Tenant B's capture via GET /v1/captures/{id} | 404 (if endpoint becomes auth-gated) or visible (if capture ID remains the access secret) |
| 83 | Capture created with Tenant A's key has tenantId: 'tenantA' in KV record | Correct tenantId stored |

---

## Proposed Tasks

### Task 1: Update vitest.config.js bindings
**File**: `vitest.config.js`
**Change**: Add `ADMIN_KEY: 'test-admin-key-for-vitest'` to `miniflare.bindings`.
**Effort**: XS
**Dependencies**: None

### Task 2: Add KV API key CRUD functions and tests
**File**: `src/kv.js` (new functions), `test/kv.test.js` (extend)
**Change**: Implement `putApiKey`, `getApiKeyByHash`, `listApiKeys`, `deleteApiKey` (soft-delete). Add test cases #34-43 to kv.test.js in a new `describe('API key CRUD')` section.
**Effort**: M
**Dependencies**: Depends on KV key schema decision from security-minion.

### Task 3: Rewrite test/auth.test.js
**File**: `test/auth.test.js`
**Change**: Full rewrite covering test matrix sections A1-A8 (test cases #1-33). Helper function `seedApiKey(env.KV, rawKey, record)` that computes SHA-256 hash and writes both the hash-lookup record and the list record. Reusable across auth and admin tests.
**Effort**: L
**Dependencies**: Depends on Task 2 (KV functions) and auth.js rewrite design from security-minion.

### Task 4: Create test/admin.test.js
**File**: `test/admin.test.js` (new)
**Change**: Full endpoint test coverage for POST/GET/DELETE /v1/admin/keys (test matrix sections C1-C4, test cases #44-80). Follow list-captures.test.js patterns: `SELF.fetch()` for HTTP tests, KV cleanup in `beforeEach`, helper functions for common operations.
**Effort**: L
**Dependencies**: Depends on admin endpoint implementation (edge-minion) and auth.js rewrite.

### Task 5: Add tenant isolation assertions
**File**: `test/admin.test.js` or dedicated section in `test/list-captures.test.js`
**Change**: Test cases #81-83 verifying cross-tenant isolation on existing endpoints when using tenant-scoped keys.
**Effort**: S
**Dependencies**: Depends on auth.js rewrite being complete.

### Task 6: Add test/fixtures.js helpers for auth
**File**: `test/fixtures.js`
**Change**: Export shared constants and helpers: `TEST_ADMIN_KEY`, `TEST_RAW_KEY`, `seedApiKey(kv, rawKey, opts)`. These will be used by auth.test.js, admin.test.js, and potentially other endpoint tests.
**Effort**: S
**Dependencies**: Depends on KV key schema.

### Task 7: Verify dual-mode fallback (regression gate)
**File**: Run existing test suite unchanged after auth.js rewrite.
**Change**: No test code changes -- the existing `test/list-captures.test.js` and `test/capture.test.js` use `CAPTURE_API_KEY` auth. If these tests pass after the rewrite, dual-mode fallback works. Document this as an explicit regression gate in the PR description.
**Effort**: XS
**Dependencies**: Auth.js rewrite must be complete.

### Task 8: Smoke test update for admin API
**File**: `scripts/smoke-test.sh`
**Change**: Add admin API round-trip to the post-deploy smoke test (requires ADMIN_KEY to be set as env var for the smoke test). Conditional: only run admin smoke if ADMIN_KEY is available (keeps backward compat with pre-R12 deploys).
**Effort**: S
**Dependencies**: Depends on all implementation tasks being complete.

---

## Risks and Concerns

### Risk 1: KV cleanup between tests is fragile
The `beforeEach` cleanup pattern (list + delete all keys with a prefix) already exists in kv.test.js and list-captures.test.js. Adding API key prefixes (`apikey-hash:`, `apikey-list:`) to cleanup is straightforward but increases the number of KV list calls per test. With `isolatedStorage: false` already configured (due to R2 WAL file issues documented in vitest.config.js), careful cleanup is essential. **Mitigation**: Use unique key names per test case (same pattern as list-captures.test.js with padded hex IDs).

### Risk 2: SHA-256 hash computation in tests
The test helper (`seedApiKey`) must compute SHA-256 hashes identically to the auth module. If the auth module uses `crypto.subtle.digest('SHA-256', ...)` on the raw key bytes, the test helper must do the same. Any mismatch (encoding differences, hex vs base64) will cause all auth tests to fail silently with 401. **Mitigation**: Extract the hash computation into a shared utility (e.g., `src/auth.js` exports a `hashKey` function, or put it in a shared `src/crypto-utils.js`) that both production code and tests import. Never duplicate the hash logic.

### Risk 3: Auth flow ordering affects test structure
The auth module's flow (ADMIN_KEY first, then KV lookup, then CAPTURE_API_KEY fallback) must be settled before tests are written. If security-minion recommends a different ordering (e.g., KV lookup first), the test matrix sections A2 and A3 need restructuring. **Mitigation**: Wait for security-minion's auth flow recommendation before finalizing test implementation order. The test matrix above is stable regardless of flow order -- only test setup varies.

### Risk 4: Scope enforcement location
The advisory says scope enforcement happens in the auth module, but scope requirements are per-endpoint. Two implementation approaches exist: (a) `verifyApiKey(request, env, { requiredScope: 'admin' })` -- auth module handles scope checking, or (b) `verifyApiKey` returns scopes, each handler checks. Both are testable, but (a) concentrates tests in auth.test.js while (b) distributes scope tests across endpoint test files. **Recommendation**: Approach (a) is cleaner -- it keeps all auth logic in one module and all auth tests in one file. Endpoint tests only need to verify that auth is called (which the existing SELF.fetch-based tests already do implicitly).

### Risk 5: Timing-safe comparison change
The current auth.js uses `crypto.subtle.timingSafeEqual` on the raw key bytes. With hash-based lookup, the KV get operation itself is the comparison (hash matches or doesn't). The timing-safe comparison may move to the ADMIN_KEY and CAPTURE_API_KEY fallback paths only. Security-minion should confirm where timing-safe comparison is still needed. Tests should verify timing-safe behavior for env-var comparisons.

---

## Additional Agents Needed

None beyond those already in the meta-plan. The test strategy is fully informed by the advisory decisions and existing codebase patterns. Security-minion's auth flow design (Consultation 1) is the critical dependency -- the test matrix above is designed to be implementation-order-independent, but the test helpers (especially `seedApiKey`) depend on knowing the exact KV schema and hash algorithm.

One coordination point: **edge-minion** and **test-minion** should agree on whether admin handlers live in `src/admin.js` or `src/index.js`. If `src/admin.js`, the unit tests in admin.test.js can test handler functions directly (like capture.test.js tests `performCapture` directly) in addition to the HTTP-level SELF.fetch tests. If inline in index.js, only SELF.fetch tests are practical. Either approach works, but the test structure differs.

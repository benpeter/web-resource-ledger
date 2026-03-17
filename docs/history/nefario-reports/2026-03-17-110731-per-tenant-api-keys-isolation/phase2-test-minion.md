# Test Strategy for Auth Module Rewrite and Admin API (R12)

## Analysis

### Current State

The existing test suite has a well-established pattern:

- **`test/auth.test.js`** -- 10 tests, all pure unit tests. `verifyApiKey()` is called directly with hand-built `Request` objects and a plain `{ CAPTURE_API_KEY }` env object. No KV, no HTTP endpoints, no miniflare. Tests cover: correct key, wrong key, missing header, misconfigured env, Bearer scheme enforcement, RFC 9457 shape, key-not-leaked-in-responses.

- **`test/kv.test.js`** -- uses `cloudflare:test` with real KV (miniflare-backed). Tests the KV data layer in isolation. This is the precedent for how KV tests work in this project: no mocking, real KV via miniflare's `env.KV`.

- **`test/list-captures.test.js`** and **`test/capture-integration.test.js`** -- use `SELF.fetch()` to hit the worker's HTTP handlers through miniflare. Auth is tested indirectly via `Authorization: Bearer test-api-key-for-vitest`. The auth key is injected via `vitest.config.js` miniflare bindings.

- **`test/integration/`** -- real browser capture pipeline tests. These use `performCapture()` directly, bypassing HTTP handlers. They don't test auth at all.

- **vitest.config.js** injects `CAPTURE_API_KEY: 'test-api-key-for-vitest'` as a miniflare binding. All SELF.fetch()-based tests use `Bearer test-api-key-for-vitest` as auth.

### What Changes

The auth rewrite transforms `verifyApiKey()` from a pure function (string compare against env var) into a function that:

1. Hashes the provided key with SHA-256
2. Looks up `apikey:{sha256hex}` in KV
3. Checks the key record for revocation
4. Checks the key record's scopes against the required scope
5. Falls back to legacy `CAPTURE_API_KEY` env var comparison for dual-mode migration
6. Returns `{ ok: true, tenantId, scopes, keyName }` on success

This means `verifyApiKey()` now has a KV dependency and scope-checking logic. Additionally, three new admin endpoints need testing.

---

## Recommendations

### 1. Auth Unit Test Structure (`test/auth.test.js`)

**Restructure into four describe blocks, keeping KV real (miniflare-backed), not mocked.**

The current auth tests are pure function tests with no KV. The new auth has KV as a primary dependency. The project philosophy is clear: "mocking out the browser is like testing an HTTP server without sending requests." The same principle applies to KV in auth tests -- **KV is the auth backend, and mocking it means you are testing the mock, not the auth system.**

However, the analogy has a boundary. The browser is an external process with complex state; KV is a key-value store with a simple get/put interface. The risk of mock/production divergence is lower for KV. The pragmatic answer:

- **Auth unit tests should use real KV (via miniflare's `cloudflare:test` environment).** This is what `test/kv.test.js` already does. It is fast (no network, miniflare KV is in-process SQLite). It is already the established pattern in this project.
- **No custom KV mocks.** Do not create a `FakeKV` or `vi.fn()` wrapper for KV. Use `env.KV` from `cloudflare:test` and seed API key records directly before each test.

The auth test file should evolve from today's `import { verifyApiKey } from '../src/auth.js'` pattern to also importing from `cloudflare:test` for KV access, just like `test/kv.test.js` does.

Proposed describe blocks:

```
describe('verifyApiKey -- KV-based key lookup')
  - valid key with capture scope returns { ok: true, tenantId, scopes }
  - valid key with read scope returns ok for read-required endpoint
  - capture scope implies read (key with only 'capture' passes read check)
  - unknown key (not in KV) returns 401
  - revoked key returns 401
  - key with insufficient scope returns 403 naming the required scope
  - admin-scoped key does NOT pass capture/read checks (admin != capture)
  - response includes keyName on success (for observability enrichment)
  - KV lookup failure (get returns null unexpectedly) falls through to legacy

describe('verifyApiKey -- dual-mode legacy fallback')
  - legacy CAPTURE_API_KEY still works when no KV key matches
  - legacy key returns tenantId: 'default' and scopes: ['capture', 'read']
  - legacy key does NOT grant admin scope
  - when KV key matches, legacy env var is NOT checked (KV takes precedence)
  - when both KV and legacy could match, KV wins

describe('verifyApiKey -- ADMIN_KEY infrastructure credential')
  - ADMIN_KEY env var grants admin operations on admin endpoints
  - ADMIN_KEY does NOT grant capture/read access (separate credential)
  - missing ADMIN_KEY returns 503 on admin endpoints

describe('verifyApiKey -- existing tests (preserved)')
  - missing Authorization header returns 401
  - non-Bearer scheme returns 401
  - empty token returns 401
  - RFC 9457 response shape
  - key never echoed in responses
  - misconfigured environment (no CAPTURE_API_KEY AND no KV keys) returns 503
```

**Key implementation detail**: The current `makeEnv()` helper creates `{ CAPTURE_API_KEY: key }`. The new version needs `{ CAPTURE_API_KEY: key, KV: env.KV, ADMIN_KEY: ... }`. Seed KV records in `beforeEach` using a helper that writes `apikey:{sha256hex}` records directly to `env.KV`.

Create a shared helper (in `test/fixtures.js` or a new `test/auth-fixtures.js`):

```js
import { env } from 'cloudflare:test';

const TEST_TENANT_KEY = 'wrl_live_' + 'a'.repeat(43); // 52 chars total
const TEST_TENANT_KEY_HASH = await sha256hex(TEST_TENANT_KEY);

async function sha256hex(input) {
  const hash = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(input));
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function seedApiKey(kv, rawKey, { tenantId = 'default', scopes = ['capture', 'read'], name = 'test-key', revoked = false } = {}) {
  const hash = await sha256hex(rawKey);
  await kv.put(`apikey:${hash}`, JSON.stringify({
    tenantId,
    scopes,
    name,
    createdAt: new Date().toISOString(),
    createdBy: 'test',
    revoked,
  }));
  return hash;
}
```

### 2. KV Mocking Boundary: Do Not Mock KV

**Recommendation: KV is always real (miniflare-backed) in all test tiers.**

Rationale:

- Miniflare KV is fast enough for unit tests (sub-millisecond, no network).
- The project already uses `cloudflare:test` + real KV for `test/kv.test.js`, `test/list-captures.test.js`, and all SELF.fetch()-based tests.
- Mocking KV would create a second code path that could diverge from real KV behavior (e.g., missing key returns `null` vs. `undefined`, JSON parse behavior on corrupted data, list prefix semantics).
- The engineering philosophy explicitly warns against mocking the integration boundary.

The only thing that should NOT be real in auth unit tests is the admin rate limiter (it is a separate binding and not germane to auth logic). If rate limiter behavior is relevant, test it at the HTTP handler level (`SELF.fetch()`), not in the auth module unit tests.

### 3. Admin API Endpoint Tests (`test/admin-keys.test.js`)

**New test file using `SELF.fetch()` against the worker, same pattern as `test/capture-integration.test.js`.**

The vitest config needs a new miniflare binding: `ADMIN_KEY: 'test-admin-key-for-vitest'`. This goes alongside the existing `CAPTURE_API_KEY` binding.

Proposed structure:

```
describe('POST /v1/admin/keys -- create key')
  - returns 201 with raw key (wrl_live_ prefix, 52+ chars)
  - raw key is present in response exactly once (subsequent GET does not show it)
  - response includes keyHash, tenantId, scopes, name, createdAt
  - created key is immediately usable for capture (round-trip: create key -> use key -> 202)
  - requires ADMIN_KEY authorization
  - returns 401 without auth
  - returns 401 with a tenant capture key (not admin)
  - returns 403 with a tenant admin-scoped KV key (tenant admin != global admin)
  - validates required fields (tenantId, scopes, name)
  - returns 400 for invalid tenantId format
  - returns 400 for invalid scope values
  - returns 400 for duplicate key name within same tenant

describe('GET /v1/admin/keys -- list keys')
  - returns all non-revoked keys for all tenants
  - raw key value is never present in list response
  - includes keyHash for each key (needed for DELETE)
  - supports ?tenant filter
  - requires ADMIN_KEY authorization
  - returns 401/403 for non-admin credentials

describe('DELETE /v1/admin/keys/{keyHash} -- revoke key')
  - returns 204 on successful revocation
  - revoked key immediately fails auth (within eventual consistency)
  - idempotent: revoking already-revoked key returns 204 (not error)
  - returns 404 for unknown keyHash
  - requires ADMIN_KEY authorization
  - returns 401/403 for non-admin credentials
```

**Critical round-trip test**: Create a key via POST, use it for a capture via POST /v1/captures, revoke it via DELETE, verify subsequent capture attempt returns 401. This is the most important end-to-end admin flow.

### 4. Auth-to-Capture Flow Integration Tests

**The existing `test/capture-integration.test.js` and `test/list-captures.test.js` should continue working with the legacy `CAPTURE_API_KEY` binding -- no changes needed.** This validates the dual-mode fallback automatically.

**Add one new test to `test/capture-integration.test.js`** that seeds a KV-based key and uses it instead of the legacy key:

```
describe('POST /v1/captures -- KV-based auth', () => {
  it('accepts a KV-provisioned key and tags capture to correct tenant', async () => {
    // Seed a key for tenant 'acme' directly in KV
    const rawKey = 'wrl_live_test1234...';
    await seedApiKey(env.KV, rawKey, { tenantId: 'acme', scopes: ['capture', 'read'] });

    const res = await SELF.fetch('https://worker.test/v1/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rawKey}`,
      },
      body: JSON.stringify({ url: VALID_URL }),
    });
    expect(res.status).toBe(202);

    const { id } = await res.json();
    const record = await getCapture(env.KV, id);
    expect(record.tenantId).toBe('acme');
  });
});
```

**Do NOT add KV-based auth tests to `test/integration/` (browser pipeline tests).** Those tests bypass HTTP handlers entirely (`performCapture()` is called directly). Auth is not their concern. The existing browser integration tests should remain unchanged.

### 5. Test Boundary Summary

| Test Layer | File | What It Tests | KV | Auth | Rate Limiter |
|---|---|---|---|---|---|
| Unit (auth logic) | `test/auth.test.js` | `verifyApiKey()` directly | Real (miniflare) | Direct call | Not present |
| Unit (KV data) | `test/kv.test.js` | KV CRUD operations | Real (miniflare) | N/A | N/A |
| HTTP handler | `test/admin-keys.test.js` | Admin API endpoints | Real (miniflare) | Via headers | Real (miniflare) |
| HTTP handler | `test/capture-integration.test.js` | Capture POST endpoint | Real (miniflare) | Via headers | Real (miniflare) |
| HTTP handler | `test/list-captures.test.js` | List GET endpoint | Real (miniflare) | Via headers | Real (miniflare) |
| Integration (browser) | `test/integration/*.test.js` | Full capture pipeline | Real (miniflare) | N/A (bypassed) | N/A |

The mocking boundary is:
- **Real**: KV, rate limiters, R2 -- all via miniflare. These are the boundaries we are testing.
- **Mocked**: `fetchMock` for outbound HTTP in capture handler tests (existing pattern). The TSA endpoint (timestamp server) is real only in browser integration tests.
- **Not tested at auth level**: Browser rendering, WACZ bundling, R2 writes. These are orthogonal to auth and have their own integration tests.

---

## Proposed Tasks

### T1: Auth Test Fixtures Helper
- Create `seedApiKey()` and `sha256hex()` helpers in `test/fixtures.js`
- These will be shared by `test/auth.test.js` and `test/admin-keys.test.js`
- Include factory defaults (tenant: 'default', scopes: ['capture', 'read'], not revoked)
- Export test constants: `TEST_TENANT_KEY`, `TEST_ADMIN_KEY`, `TEST_READ_ONLY_KEY`

### T2: Rewrite `test/auth.test.js`
- Add `import { env } from 'cloudflare:test'` to get real KV
- Preserve all existing test cases (they validate the dual-mode fallback path)
- Add KV-based lookup tests (see Section 1 above)
- Add scope enforcement tests (capture implies read, admin is separate)
- Add revoked key rejection test
- Add dual-mode fallback precedence tests (KV wins over env var)
- Each describe block seeds its own KV state in `beforeEach` and cleans up

### T3: Create `test/admin-keys.test.js`
- New file using `SELF.fetch()` pattern from `test/capture-integration.test.js`
- Full CRUD coverage for admin endpoints (see Section 3 above)
- Round-trip test: create key -> use key for capture -> revoke -> verify 401
- Auth enforcement on every admin endpoint
- Validation error coverage (missing fields, invalid formats)

### T4: Update `vitest.config.js`
- Add `ADMIN_KEY: 'test-admin-key-for-vitest'` to miniflare bindings
- Add `ADMIN_RATE_LIMITER` rate limiter binding to miniflare config
- Matching updates in `vitest.integration.config.js`

### T5: Add KV-based auth test to existing `test/capture-integration.test.js`
- One test: KV-provisioned key -> POST /v1/captures -> verify tenantId in KV record
- Verifies that KV-based auth works end-to-end through the HTTP handler

### T6: Tenant Isolation Tests
- Add to `test/list-captures.test.js`:
  - Tenant A's key cannot list Tenant B's captures
  - KV-based key with read scope can list, capture scope can also list
  - Admin key (ADMIN_KEY) cannot list captures (admin is not capture/read)
- These validate that the tenantId from auth flows correctly into KV queries

---

## Risks and Concerns

### R1: `cloudflare:test` KV in auth.test.js (Medium)
The current `test/auth.test.js` does NOT use `cloudflare:test` -- it imports `verifyApiKey` and calls it directly with plain objects. Moving to `cloudflare:test` means the test file now runs inside the miniflare worker pool, which changes the execution model. This is the correct direction (aligns with all other test files), but the migration needs care: ensure `env.KV` is available in the test scope, and that `beforeEach` cleanup deletes `apikey:*` prefix keys.

**Mitigation**: Follow the exact pattern from `test/kv.test.js` which already uses `import { env } from 'cloudflare:test'` successfully.

### R2: SHA-256 Hashing Consistency (High)
The auth module will hash the provided key with SHA-256 to look up the KV record. The test helper `seedApiKey()` must use the exact same hashing logic. If the hash implementation differs between auth code and test helper (e.g., different encoding, hex vs. base64), tests will always fail to find the key.

**Mitigation**: Extract the SHA-256 hashing into a shared utility in `src/auth.js` (e.g., `export async function hashApiKey(rawKey)`) and import it in both production code and test helpers. Single source of truth for the hash algorithm.

### R3: Admin Rate Limiter Binding in Tests (Low)
The advisory specifies a dedicated `ADMIN_RATE_LIMITER` at 5/min. Miniflare supports rate limiter bindings, but the admin tests that make multiple requests could hit the limit. The existing capture tests work around this by using distinct `CF-Connecting-IP` headers per test.

**Mitigation**: Use distinct IPs per test, or configure a higher limit in the test-only miniflare config (e.g., `simple: { limit: 100, period: 60 }` for tests).

### R4: Test Execution Time (Low)
Adding ~30-40 new tests (auth + admin) to the miniflare-backed test suite should add negligible time (miniflare KV operations are sub-millisecond). The admin round-trip test that creates a key, uses it for a capture, and revokes it will use `fetchMock` (like existing capture tests) and should complete in under 1 second.

### R5: Dual-Mode Deprecation Timing (Medium)
The test suite will have tests for both KV-based and legacy auth paths. When the legacy `CAPTURE_API_KEY` fallback is removed (post-migration), the legacy tests need to be updated or removed. If tests for the legacy path are not clearly labeled, they will become confusing dead code.

**Mitigation**: Group all legacy fallback tests under a clearly named describe block: `describe('verifyApiKey -- dual-mode legacy fallback (remove after migration)')`. This makes the deprecation intent visible in the test file itself.

---

## Additional Agents Needed

No additional agents are needed for the test strategy. The security-minion should validate that the test cases cover the security-critical paths (scope enforcement, revoked key rejection, admin key isolation). The api-design-minion should confirm the admin API response shapes so admin endpoint tests can assert the correct field names. Both are already consulted in the meta-plan.

One dependency worth noting: the test structure depends on the **exact field names** in the KV key record schema (from data-minion) and the **exact response shapes** of the admin API (from api-design-minion). If those consultations change the schema or response format, the test plan adapts accordingly -- the test *structure* is stable, only the assertion details change.

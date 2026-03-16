# Domain Plan Contribution: test-minion

## Recommendations

### Existing test patterns to preserve and extend

The codebase has strong test hygiene worth noting:

1. **Pure unit tests in verify.test.js** -- `buildTestWacz(privateKey, publicKeyBytes)` is a self-contained helper that generates real crypto material in-memory. No mocks, no fakes. This pattern is correct and must be extended for key-versioning scenarios, not replaced.

2. **Integration tests use `@cloudflare/vitest-pool-workers`** -- `env` comes from the workers pool, `SELF` makes real HTTP calls through the worker. This is the right approach for endpoint tests. `vitest.config.js` generates a fresh Ed25519 key pair at config load time and injects it as `SIGNING_KEY`. This generates one keypair per test run, which is fine for the current single-key model but needs extension for multi-key scenarios (see below).

3. **Security invariants are explicit tests** -- e.g., "detail messages never contain hash values", "ip absent from response", "R2 keys absent from response". This discipline should extend to key versioning: e.g., `keyId` must appear in outputs but private key material must never leak.

4. **AAA structure is consistently followed** across all test groups. Tamper detection tests are well-factored -- they build a valid WACZ, surgically corrupt it, and assert the specific check that should fail.

---

### Test scenarios required

#### (a) Signing produces keyId in output

These are unit tests against `buildWacz()` / `signBytes()` / `getSigningKeys()` after the versioning changes.

- `datapackage-digest.json` contains `signedData.keyId` field after signing
- `keyId` format is validated (non-empty string; should be deterministic for a given key -- e.g., a hash of the public key bytes)
- `keyId` is stable across multiple sign calls with the same key (no random suffix)
- `keyId` differs between two distinct key pairs

**Where to add:** `test/wacz.test.js` in a new describe block `WACZ signing -- keyId`. Also add keyId assertions to the existing "datapackage-digest.json has a valid Ed25519 signature" test in `wacz.test.js` since it already inspects the digest structure.

#### (b) Verification with the correct historical key succeeds

This is the core correctness scenario for the rotation feature.

- Build a WACZ signed with key A, retrieve key A's public bytes from the key archive, call `verifyWacz(waczBytes, historicalPublicKeyBytes)` -- expects `verified: true`
- All three checks pass when the historically correct key is supplied

**Where to add:** `test/verify.test.js` -- new describe block `verifyWacz -- historical key lookup`. These are pure unit tests; they don't need the worker pool.

#### (c) Verification after key rotation

This is the most important regression scenario. It tests the complete rotation flow:

- **Setup**: Sign WACZ with key A. Simulate key rotation (new `SIGNING_KEY` in env = key B). Archive key A in KV under its keyId.
- **Scenario 1**: WACZ has `keyId` for archived key A. Worker fetches key A from KV archive, verifies signature -- expects `verified: true`.
- **Scenario 2**: WACZ has `keyId` for key A but key A is NOT in the archive -- expects `verified: false` with a `signature` check failing and a meaningful (but non-leaking) detail like "signing key not found".
- **Scenario 3**: `keyId` in WACZ does not match the current key AND is not in the archive -- same failure as scenario 2.

**Where to add:** `test/verify-integration.test.js` -- new describe block `GET /v1/verify/{id} -- key rotation`. These need the worker pool because KV lookup is involved.

**Key implementation detail for test authors**: The test cannot simply swap `env.SIGNING_KEY` between `beforeEach` and the assertion (workers pool bindings are fixed per test run). Instead, the test must:
1. Produce a WACZ signed with key A (by injecting into R2 directly, bypassing `performCapture` -- the same pattern used in tamper detection tests)
2. Manually populate the KV key archive with key A's public bytes under the appropriate key
3. Verify through `SELF.fetch` with the worker currently configured with key B

This means `vitest.config.js` needs to expose **two** key pairs (key A as an archived key, key B as the current `SIGNING_KEY`). The cleanest approach: generate both in `vitest.config.js`, export key A's public bytes as a `miniflare.bindings` variable (e.g., `TEST_ARCHIVED_KEY_PUBLIC`), and let tests use it to pre-populate the KV archive.

#### (d) Backward compatibility -- WACZ without keyId falls back to current key

This is a regression test against the pre-versioning WACZ format.

- Build a legacy WACZ (using `buildTestWacz` from `verify.test.js` which does not include `keyId`) signed with the current key
- Call `verifyWacz` without `keyId` present -- worker should fall back to `getSigningKeys(env).publicKeyBytes`
- Expects `verified: true`

**Where to add:** `test/verify.test.js` -- new test in the existing `verifyWacz -- happy path` describe block. Label it clearly: `"WACZ without keyId falls back to current key -- backward compatibility"`.

Also add an integration-level version in `test/verify-integration.test.js`: inject a legacy WACZ (signed with current key, no `keyId`) into R2, call the verify endpoint -- expects `verified: true`.

#### (e) /.well-known/signing-keys endpoint returns archived keys

This is a new endpoint (plural), separate from the existing `/.well-known/signing-key` (singular).

**Unit tests** (`test/signing-key.test.js` -- new describe block or new file `test/signing-keys.test.js`):
- `GET /.well-known/signing-keys` returns 200 with JSON
- Response body is an array (even when empty -- graceful degradation)
- Each entry has: `keyId`, `algorithm: "Ed25519"`, `publicKey` (base64, 32 bytes), `archivedAt` (ISO timestamp or null for current key)
- Current active key appears in the list (not just archived keys)
- Archived keys appear in the list when KV archive is populated
- `publicKey` decodes to exactly 32 bytes for every entry
- Cache-Control is appropriate (shorter TTL than the singular endpoint -- archived keys change when rotation happens)
- CORS and security headers are present

**Integration test note**: The test must pre-populate the KV archive in `beforeEach` to test the multi-key case. Use `env.KV.put()` directly -- same pattern as the tamper detection tests that manually write KV records.

#### (f) Key archive KV operations

These are pure unit tests against the new KV functions (likely something like `archiveSigningKey(kv, keyId, publicKeyBytes, timestamp)` and `getArchivedSigningKey(kv, keyId)`).

- `archiveSigningKey` writes a parseable JSON value at the expected KV key
- `getArchivedSigningKey` returns the public key bytes for a known keyId
- `getArchivedSigningKey` returns null for an unknown keyId
- `listArchivedSigningKeys` returns all archived keys (empty array when none)
- Key format for KV storage: recommend `signing-key:{keyId}` prefix -- test that the prefix is consistent and doesn't collide with `capture:` or `tenant:` namespaces
- Idempotent write: archiving the same keyId twice does not corrupt the record

**Where to add:** `test/kv.test.js` -- new describe block `signing key archive operations`. Keep these isolated from capture KV operations.

#### (g) Integration tests with multiple key pairs

The `vitest.config.js` currently generates one keypair. This needs extension:

**Recommendation**: Generate key A and key B in `vitest.config.js`. Inject key B as the active `SIGNING_KEY` (so all existing tests that rely on the current key continue to pass). Expose key A's PKCS8 bytes as a binding `TEST_ARCHIVED_KEY` so rotation tests can pre-populate the KV archive.

```
// vitest.config.js pattern
const { privateKey: archivedPrivKey } = generateKeyPairSync('ed25519');
const { privateKey: currentPrivKey } = generateKeyPairSync('ed25519');

const archivedSigningKey = archivedPrivKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const currentSigningKey = currentPrivKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

// bindings:
//   SIGNING_KEY: currentSigningKey        (existing binding)
//   TEST_ARCHIVED_KEY: archivedSigningKey  (new, test-only binding for rotation tests)
```

Tests that need to sign with the archived key import `getSigningKeys` with `{ SIGNING_KEY: env.TEST_ARCHIVED_KEY }` -- same pattern used in `signing-key.test.js` line 74.

**Critical isolation note**: The archived-key integration tests must use a distinct capture ID prefix from existing tests. The current tests use `cap_` + repeated characters (e.g., `'f'.repeat(32)`). Use `cap_` + `'a'.repeat(32)` for rotation tests. `beforeEach` cleanup must scope to the test's own IDs.

---

### Gaps in existing tests that matter for this feature

1. **`verifyWacz` signature is `(waczBytes, publicKeyBytes)`** -- after key versioning, the signature will need to change to include key resolution. The unit tests in `verify.test.js` must be updated to pass a key resolver or KV handle instead of raw bytes. This is a breaking change to the test helper `buildTestWacz`. Plan for it.

2. **`handleVerifyCapture` in `index.js` calls `getSigningKeys(env)` directly** -- this is where the keyId lookup branch must be inserted. The existing integration test in `verify-integration.test.js` only exercises the happy path (current key). There is no test for the "key not found" branch producing a 200 with `verified: false`. Add this.

3. **Security: `keyId` must not reveal key material** -- add a test to the security describe block ensuring no private key bytes, no PKCS8 PEM/DER content appears in any response field.

---

## Proposed Tasks

### Task T1: Add keyId unit tests to `test/wacz.test.js`

New describe block: `WACZ signing -- keyId`

Tests:
- `signed WACZ contains keyId in signedData`
- `keyId is a non-empty string`
- `keyId is stable for the same key across two sign calls`
- `keyId differs for two distinct key pairs`

Extend existing test `datapackage-digest.json has a valid Ed25519 signature` to also assert `signedData.keyId` is present and non-empty.

### Task T2: Add historical-key unit tests to `test/verify.test.js`

New describe block: `verifyWacz -- historical key`

Tests:
- `WACZ signed with key A verified with key A public bytes returns verified: true`
- `WACZ with keyId but no matching key supplied returns verified: false with signature check failing`
- `WACZ without keyId falls back to supplied current key -- backward compatibility`

The function signature of `verifyWacz` will need to change. Tests must be updated to reflect the new signature. The helper `buildTestWacz` should be extended to optionally include `keyId` in `signedData`.

### Task T3: Add KV archive unit tests to `test/kv.test.js`

New describe block: `signing key archive operations`

Tests:
- `archiveSigningKey writes retrievable record`
- `getArchivedSigningKey returns public bytes for known keyId`
- `getArchivedSigningKey returns null for unknown keyId`
- `listArchivedSigningKeys returns empty array when no keys archived`
- `listArchivedSigningKeys returns all archived keys`
- `archiveSigningKey is idempotent`

### Task T4: Add /.well-known/signing-keys endpoint tests to `test/signing-key.test.js`

New describe block: `GET /.well-known/signing-keys -- plural`

Tests:
- `returns 200 with array body`
- `array contains current active key`
- `each entry has keyId, algorithm, publicKey fields`
- `publicKey decodes to 32 bytes for every entry`
- `archived keys appear when KV archive is populated`
- `returns empty array (not 404) when no archived keys`
- `Cache-Control is public with appropriate max-age`
- `CORS and security headers present`
- `POST returns 404`

### Task T5: Update `vitest.config.js` for multi-key support

Changes:
- Generate two keypairs: `archivedPrivKey` and `currentPrivKey`
- Inject `SIGNING_KEY: currentSigningKey` (preserves all existing test behavior)
- Inject `TEST_ARCHIVED_KEY: archivedSigningKey` (new, for rotation tests)
- Export archived key public bytes as `TEST_ARCHIVED_KEY_PUBLIC` so rotation tests can pre-populate KV without importing signing.js

### Task T6: Add key rotation integration tests to `test/verify-integration.test.js`

New describe block: `GET /v1/verify/{id} -- key rotation`

Use distinct ID `cap_a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0` (different from existing test IDs).

Tests:
- `WACZ signed with archived key verifies successfully when key is in KV archive`
- `WACZ signed with archived key fails verification when key is NOT in KV archive`
- `WACZ signed with archived key fails when keyId present but public bytes mismatched`

Setup pattern:
```
// In beforeEach:
// 1. Generate a WACZ signed with env.TEST_ARCHIVED_KEY
// 2. Write the WACZ to R2 directly (bypass performCapture)
// 3. Write a complete capture record to KV pointing to that R2 key
// 4. Optionally populate KV key archive (depends on the specific test)
```

### Task T7: Add backward-compatibility integration test to `test/verify-integration.test.js`

Single test in a new describe block: `GET /v1/verify/{id} -- backward compatibility`

Test: `WACZ without keyId signed with current key verifies successfully`

Build the legacy WACZ using `buildTestWacz` (from verify.test.js helper, adapted) with the current `SIGNING_KEY` public bytes, no `keyId` field, inject into R2, call verify endpoint -- expects `verified: true`.

---

## Risks and Concerns

### Risk 1: `verifyWacz` signature change is a breaking test change

`verifyWacz(waczBytes, publicKeyBytes)` currently takes raw bytes. With versioning, it will need access to the KV archive to resolve historical keys by `keyId`. The new signature is likely `verifyWacz(waczBytes, currentPublicKeyBytes, kvNamespace)` or similar.

Every existing test in `verify.test.js` and `verify-integration.test.js` that calls `verifyWacz` directly will need updating. The pure unit tests (verify.test.js) that don't need KV lookup should pass `null` for the KV argument -- the implementation must handle this gracefully (fall back to current key only, no archive lookup).

**Recommendation**: Keep `verifyWacz` for pure unit testing by adding the KV argument as optional with a default of `null`. Document this in the function signature. The integration path through `handleVerifyCapture` will always pass the real KV.

### Risk 2: `isolatedStorage: false` in vitest.config.js

The KV namespace is shared across tests in the same run. Rotation tests that write to the KV key archive must clean up in `afterEach`. Use a consistent key prefix for test archive entries (e.g., `signing-key:test-`) and delete by prefix in teardown. Failure to clean up will cause cross-test contamination, especially for the `listArchivedSigningKeys` tests.

### Risk 3: keyId derivation must be deterministic and documented

If `keyId` is derived from a hash of the public key bytes, the test for stability (Task T1) will validate this. But if `keyId` is generated with any randomness (timestamp, UUID), the rotation scenario in Task T6 breaks because the test needs to know the `keyId` upfront to populate the KV archive before calling the verify endpoint.

**Hard requirement**: `keyId` must be deterministic given a public key. Tests should encode this: derive the expected `keyId` from the known public bytes and assert it matches what appears in `signedData.keyId`.

### Risk 4: Cache-Control on the new /signing-keys endpoint

The existing `/.well-known/signing-key` endpoint uses `max-age=3600, stale-while-revalidate=86400`. The new `/signing-keys` endpoint containing archived keys should have a shorter or equal TTL. If a key is rotated and the old entry is served from cache, verifiers may use stale key lists.

**Test gate**: Add an explicit test asserting `max-age` is not larger than 3600 on the `/signing-keys` endpoint. This prevents a future change from inadvertently increasing TTL.

### Risk 5: `buildTestWacz` helper duplication

`buildTestWacz` exists in `verify.test.js` and shares overlapping logic with `buildWacz` in `wacz.js`. The rotation tests need to produce WACZs signed with the archived key, which means calling something like `buildTestWacz(archivedPrivKey, archivedPublicKeyBytes)`. This is fine, but the helper needs to accept a `keyId` parameter so it can produce both legacy (no keyId) and versioned (with keyId) test fixtures.

**Recommendation**: Extend `buildTestWacz` signature to `buildTestWacz(privateKey, publicKeyBytes, { keyId = null } = {})`. Tests that pass `keyId` produce versioned WACZs. Tests that omit it produce legacy WACZs. This covers backward-compat scenarios without duplicating the helper.

---

## Additional Agents Needed

None. All test scenarios are clearly bounded by the implementation surfaces (signing.js, wacz.js, verify.js, kv.js, index.js). No new external dependencies or infrastructure is needed for testing -- the existing `@cloudflare/vitest-pool-workers` setup handles everything including KV and R2 simulation.

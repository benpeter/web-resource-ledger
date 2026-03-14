# Domain Plan Contribution: test-minion

## Recommendations

### 1. Tamper Test Architecture: Modify R2, Not KV

The tamper test should modify R2 objects directly, not KV records. Here is why:

The verification endpoint's purpose is to prove artifacts stored in R2 match
the cryptographic hashes in the WACZ bundle. The threat model is "someone (or
something) altered the stored file after capture." Tampering with KV would test
a different scenario (metadata corruption) that is not what the acceptance
criteria describe.

**Concrete approach**: After a capture completes and the WACZ is in R2, read
the WACZ bytes, unzip them with `fflate`, corrupt one inner file (e.g., flip a
byte in `archive/data.warc`), re-zip, and overwrite the R2 key. This simulates
an artifact that has been altered post-capture. The SHA-256 of the WARC file
inside the WACZ will no longer match the hash in `datapackage.json`, so
verification should return `verified: false`.

The existing `wacz.test.js` already demonstrates this exact pattern: it reads
WACZ bytes from R2, unzips with `fflate`'s `unzipSync`, inspects inner files,
and computes hashes. The tamper test mirrors this but writes corrupted bytes
back.

A second tamper variant should corrupt the WACZ file itself at the byte level
(without unzipping) to test the "ZIP is invalid" error path. This is simpler:
just overwrite the R2 key with garbage bytes.

### 2. Full Lifecycle Test: Seed via performCapture, Not Manual KV Advance

The acceptance criteria require `POST -> poll status -> GET /v1/verify/{id}`.
The existing lifecycle smoke test in `capture-integration.test.js` uses
`completeCapture()` to manually advance KV state with fake hashes like
`'sha256:' + 'b'.repeat(64)` and puts ZIP-magic-byte stubs into R2. This is
fine for testing retrieval (which only reads metadata), but **will not work for
verification** because the verify endpoint needs a real, signed WACZ with
correct internal hashes.

**Two approaches, recommended order**:

**Primary (integration test)**: Use `performCapture()` directly (as `wacz.test.js`
does) with `fetchMock` and a `stubRenderer`. This calls `buildWacz()` which
produces a real signed WACZ with correct hashes and a valid Ed25519 signature.
After `performCapture()` completes, the KV record has the real `wacz.key` and
`wacz.bundleHash`, and R2 has the real WACZ file. Then call
`SELF.fetch('https://worker.test/v1/verify/{id}')` and assert `verified: true`.

This avoids the `ctx.waitUntil()` problem entirely. The `performCapture()`
function is just an async function -- calling it directly (with injected
`stubRenderer`) runs synchronously in the test. The existing `wacz.test.js`
already proves this works. The test does not need to go through `POST /v1/captures`
and poll; it can create the capture via `createCapture()` + `performCapture()`,
then verify via `SELF.fetch`.

**Secondary (full HTTP lifecycle test)**: If the acceptance criteria strictly
require `POST -> poll -> verify` going through the HTTP layer, there is a
problem: `ctx.waitUntil()` in miniflare does not guarantee the background task
completes before the next `SELF.fetch` call. The existing smoke test works
around this by manually calling `completeCapture()`. For the verify test, we
would need to either:
  - Call `performCapture()` directly after the POST to force completion, then
    poll and verify through HTTP
  - Accept that the POST test goes through HTTP but the "complete" transition
    happens via direct function call

**Recommendation**: Use the primary approach (direct `performCapture()` call
with `SELF.fetch` for the verify endpoint). This matches the `wacz.test.js`
pattern and tests what matters: the verification logic works against a real
WACZ. Add a comment explaining that the POST->poll->verify lifecycle is
validated by the combination of `capture-integration.test.js` (POST->poll works)
and this test (verify against real WACZ works). A test that stitches both
together through pure HTTP would be an E2E test in a real `wrangler dev`
environment, not a vitest unit/integration test.

### 3. Verification Logic Deserves Separate Unit Tests

Yes, absolutely. The existing codebase follows a clear pattern:
- `signing.test.js` has unit tests for signing functions
- `wacz.test.js` has both unit tests (WARC structure, CDXJ SURT, canonical JSON)
  and integration tests (R2 storage, signature round-trip)

The verification logic should follow the same split:

**Unit tests** (in `test/verify.test.js` or similar):
- Pure function: given a valid WACZ byte array and the server's public key,
  returns `{ verified: true, ... }`
- Pure function: given a WACZ with one corrupted resource hash, returns
  `{ verified: false, reason: ... }`
- Pure function: given a WACZ with an invalid signature, returns
  `{ verified: false, reason: ... }`
- Pure function: given a WACZ with a tampered `datapackage.json` (bundleHash
  mismatch), returns `{ verified: false, reason: ... }`
- Edge: WACZ bytes that are not valid ZIP
- Edge: WACZ missing `datapackage.json`
- Edge: WACZ missing `datapackage-digest.json`

These unit tests construct WACZ byte arrays in-memory (using `fflate`'s
`zipSync`), making them fast and deterministic. No R2, no KV, no HTTP.

**Integration tests** (in `test/verify-integration.test.js`):
- Endpoint returns 200 with `verified: true` for a real capture
- Endpoint returns 200 with `verified: false` after R2 artifact tampering
- Endpoint returns 404 for unknown ID
- Endpoint returns 404 for pending/failed captures
- Endpoint has correct `Cache-Control` header
- Endpoint has security headers
- Rate limiter binding works (if testable in miniflare)

### 4. Edge Cases to Test

Organized by priority (must-test first):

**Must test (acceptance criteria)**:
- Happy path: real capture, verify returns `verified: true`
- Tamper: corrupt WACZ inner file, verify returns `verified: false`

**Must test (correctness)**:
- Capture exists but has no WACZ (signing key was absent during capture):
  The KV record will have `wacz: undefined`. The verify endpoint should return
  404 or a clear "not verifiable" response, not crash. This is a real production
  scenario since `buildWacz()` returns `null` when `SIGNING_KEY` is missing.
- Capture in `pending` state: should return 404 (consistent with retrieval
  endpoint pattern)
- Capture in `failed` state: should return 404 (same)
- Unknown capture ID: should return 404 with RFC 9457 shape
- Malformed capture ID: should return 404 (route does not match)

**Should test (robustness)**:
- WACZ key in KV exists but R2 object is missing (data loss scenario): should
  return `verified: false` or a specific error, not 500
- WACZ in R2 is not valid ZIP: should return `verified: false`, not crash
- WACZ in R2 is valid ZIP but missing `datapackage.json`: `verified: false`
- WACZ has valid structure but signature was made with a different key (key
  rotation scenario): this tests the key-pinning decision from security-minion.
  If the endpoint uses the server's current public key, a capture signed with
  an old key would fail. If it uses the embedded public key, it always passes
  (but trusts the embedded key, which the WACZ comment warns against).
  **This test should be written to validate whichever key-pinning decision the
  security-minion recommends.**

**Consider testing (defense-in-depth)**:
- Response shape assertions: `verified` field is boolean, `capture` and
  `artifacts` fields present
- Security: capture ID not echoed in 404 error detail (matches existing pattern)
- Security: `ip` field absent from verification response
- Cache-Control header value on both 200 and 404 responses
- CORS headers present (if applicable)

### 5. Test Data Structure

Follow the established patterns exactly:

**For integration tests** (`verify-integration.test.js`):

Use a distinct `SEED_ID` prefix (e.g., `cap_` + `'f'.repeat(32)`) to avoid
collisions with other test files since `isolatedStorage: false` is set in
vitest.config.js.

The `beforeEach` should:
1. Clean up KV: `await env.KV.delete(\`capture:${TEST_ID}\`)`
2. Clean up R2 WACZ objects: list + delete (same pattern as `wacz.test.js`)
3. Activate `fetchMock` (needed for `performCapture`'s `captureHeaders` call)
4. Call `createCapture()` + `performCapture()` with `stubRenderer` to produce
   a real, signed WACZ

The `afterEach` should:
1. Deactivate `fetchMock`

For the tamper test specifically:
```js
// In the test body, AFTER beforeEach has created a valid capture:
const record = await getCapture(env.KV, TEST_ID);
const obj = await env.BUCKET.get(record.wacz.key);
const waczBytes = new Uint8Array(await obj.arrayBuffer());

// Corrupt: flip one byte somewhere in the middle
const corrupted = new Uint8Array(waczBytes);
corrupted[corrupted.length - 100] ^= 0xFF;
await env.BUCKET.put(record.wacz.key, corrupted);

// Now verify should fail
const res = await SELF.fetch(`https://worker.test/v1/verify/${TEST_ID}`);
const body = await res.json();
expect(body.verified).toBe(false);
```

**For unit tests** (`verify.test.js`):

Build WACZ byte arrays in-memory using `fflate`'s `zipSync`. Generate a fresh
Ed25519 key pair per test (same pattern as `signing.test.js`). No env bindings
needed -- pure function tests.

```js
// Example structure for unit test
import { zipSync } from 'fflate';
import { canonicalize } from '../src/canonical-json.js';

// Build a minimal valid WACZ in-memory:
const datapackage = { profile: 'data-package', wacz_version: '1.1.1', resources: [...] };
const dpBytes = new TextEncoder().encode(JSON.stringify(datapackage, null, 2));
// ... sign it, build digest, zip everything
const waczBytes = zipSync({ 'datapackage.json': [dpBytes, { level: 0 }], ... });
// Pass to verifyWacz(waczBytes, publicKeyBytes) -> { verified: true }
```

### 6. Test File Organization

Following the existing convention:

| File | Type | Tests |
|------|------|-------|
| `test/verify.test.js` | Unit | Pure verification logic, WACZ parsing, hash checks, signature checks |
| `test/verify-integration.test.js` | Integration | HTTP endpoint, R2/KV seeded state, tamper detection, error responses |

This mirrors the existing split between `test/wacz.test.js` (unit + integration
for WACZ creation) and `test/capture-retrieval.test.js` (integration for
retrieval endpoints).

## Proposed Tasks

### Task 1: Create verify module with pure verification function
- **File**: `src/verify.js`
- **Exports**: `verifyCapture(waczBytes, publicKeyBytes)` -> returns structured
  result with `verified` boolean and per-step details
- **Dependencies**: `fflate` (already in project), `canonical-json.js`,
  `crypto.subtle` for SHA-256 and Ed25519 verify
- **Testability**: Pure function, no I/O -- takes bytes in, returns result

### Task 2: Write unit tests for verification logic
- **File**: `test/verify.test.js`
- **Count**: ~8-10 tests
- **Pattern**: Build WACZ byte arrays in-memory, test each failure mode
- **Should be written BEFORE or alongside the verify module** (TDD-friendly)

### Task 3: Wire up GET /v1/verify/{id} endpoint
- **File**: `src/index.js` (add route + handler)
- **Handler reads KV, fetches WACZ from R2, calls verifyCapture(), returns
  response with Cache-Control headers**
- **Add VERIFY_RATE_LIMITER binding to wrangler.toml**

### Task 4: Write integration tests for verification endpoint
- **File**: `test/verify-integration.test.js`
- **Count**: ~10-12 tests
- **Includes the two acceptance-criteria tests (happy path + tamper detection)**
- **Uses `performCapture()` with `stubRenderer` for real WACZ creation**

### Task 5: Verify the lifecycle stitches together
- **Optional but valuable**: Add one test in `test/capture-integration.test.js`
  that extends the existing lifecycle smoke test to also call the verify
  endpoint. This proves the full POST -> complete -> verify chain works through
  the HTTP layer, even if the "complete" step uses `completeCapture()` directly.
  This test would call verify and expect either `verified: false` (because the
  manually-seeded WACZ is fake) or skip verify assertion if no real WACZ exists.
  Actually -- better to leave this as a separate integration test that uses
  `performCapture()` to get a real WACZ, then verifies through HTTP. This is
  Task 4's happy path test.

## Risks and Concerns

### Risk 1: ctx.waitUntil() timing in full HTTP lifecycle test
**Severity**: Medium
**Detail**: The POST endpoint triggers `performCapture()` via `ctx.waitUntil()`.
In miniflare, the background task may or may not complete before subsequent
`SELF.fetch` calls. The existing tests work around this by manually advancing
state. For the verification test, we NEED a real WACZ (not fake hashes).
**Mitigation**: Call `performCapture()` directly instead of going through POST.
This is the established pattern in `wacz.test.js` and avoids the timing issue
entirely. The test still validates the verify endpoint through HTTP.

### Risk 2: isolatedStorage: false causes test pollution
**Severity**: Low-Medium
**Detail**: `vitest.config.js` sets `isolatedStorage: false` due to SQLite WAL
file issues. All test files share the same KV and R2 namespace. If two test
files use the same capture IDs or WACZ keys, they can collide.
**Mitigation**: Use unique SEED_ID prefixes per test file (existing pattern:
`'a'.repeat(32)`, `'b'.repeat(32)`, etc.). For WACZ keys, which are
content-addressed (based on file hash), the content will differ per test run
since timestamps vary. Clean up in `beforeEach` using the list-and-delete
pattern from `wacz.test.js`.

### Risk 3: Key pinning decision affects test design
**Severity**: Medium
**Detail**: If the verify endpoint uses the server's current public key (from
env.SIGNING_KEY) for verification, the test is straightforward -- the same key
that signed is used to verify. If it uses the embedded public key from the
WACZ's `datapackage-digest.json`, the test needs to verify that the embedded
key matches the expected server key. The security-minion's recommendation here
directly affects how the unit tests are structured.
**Mitigation**: Design the `verifyCapture()` function to accept the public key
as a parameter. Integration tests pass the server's key; unit tests can test
both scenarios. This keeps the function testable regardless of the key-pinning
policy decision.

### Risk 4: WACZ corruption in R2 may not produce the expected failure mode
**Severity**: Low
**Detail**: Flipping random bytes in a ZIP file might make it entirely
unparsable rather than producing a hash mismatch. The test needs to distinguish
between "verification failed because hash mismatch" and "verification failed
because file is corrupt."
**Mitigation**: For the hash-mismatch test, use the surgical approach: unzip
the WACZ, modify one inner file (e.g., append a byte to `archive/data.warc`),
re-zip, and put back. This guarantees the ZIP is still valid but the hash no
longer matches. For the "corrupt file" test, write garbage bytes to test the
error handling path separately.

### Risk 5: fflate re-zip may produce different ZIP bytes
**Severity**: Low
**Detail**: If we unzip with `unzipSync` and re-zip with `zipSync`, the output
bytes may differ from the original even without modification (different
compression, metadata, etc.). This could cause the WACZ hash to change
unexpectedly.
**Mitigation**: The tamper test should only care about inner-file hashes (which
are computed over the uncompressed file contents), not the outer WACZ hash.
Verify that the test's assertion is about `datapackage.json` resource hashes
vs actual file hashes, not about the WACZ-level hash.

## Additional Agents Needed

None. The four specialists already consulted (api-design-minion, security-minion,
test-minion, ux-strategy-minion) cover the planning needs. The verification
logic implementation is straightforward given the existing signing/hashing
utilities. No infrastructure changes beyond the rate limiter binding are needed.

One note: if the security-minion recommends key pinning against an
operator-published key (rather than the embedded key), that decision should be
made before test implementation begins, since it affects which public key the
verification function receives and how unit tests construct test data. This is
already identified as Approval Gate 1 in the meta-plan.

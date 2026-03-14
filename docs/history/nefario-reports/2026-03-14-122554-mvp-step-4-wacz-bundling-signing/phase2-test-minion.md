# Domain Plan Contribution: test-minion

## Recommendations

### 1. Test Granularity -- Unit Tests for Pure Logic, Integration for the Pipeline

The WACZ bundling pipeline introduces several distinct, testable layers. The right strategy is NOT to test everything at integration level. Several components are pure functions with zero side effects and deserve focused unit tests:

- **Canonical JSON serialization** -- pure function, deterministic. Unit test thoroughly.
- **Ed25519 sign/verify round-trip** -- crypto operation, pure aside from key material. Unit test.
- **WARC record construction** -- given HTML bytes, screenshot bytes, headers object, produce correct WARC format. Unit test the byte output.
- **CDXJ index generation** -- given WARC records, produce correct CDXJ lines. Unit test.
- **Manifest (`datapackage.json`) assembly** -- given artifact hashes and metadata, produce correct manifest structure. Unit test the object shape.

Then a single integration test validates the full pipeline: artifacts go in, a correctly structured `.wacz` appears in R2, KV is updated with the WACZ path. This mirrors the existing `performCapture` pattern in `test/capture.test.js` -- the orchestration is tested at integration level while individual steps are tested in isolation.

**Do NOT test ZIP structure independently.** Whatever ZIP library is chosen, trust that it produces valid ZIPs. The integration test that reads the `.wacz` back from R2 and extracts its contents validates the ZIP implicitly. Adding a separate ZIP unit test would be testing the library, not the application.

### 2. Crypto Operations in Miniflare -- Ed25519 Works

The `@cloudflare/vitest-pool-workers` runs tests inside the actual `workerd` runtime (not a Node.js simulation). This means `crypto.subtle` behaves identically to production. Cloudflare Workers support Ed25519 via the Secure Curves API specification. The `workerd` runtime used by Miniflare/vitest-pool-workers provides the same crypto.subtle implementation.

**Recommendation**: Use the standard Secure Curves Ed25519 algorithm name, not the legacy `NODE-ED25519` variant. The standard API is:

```js
const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const signature = await crypto.subtle.sign('Ed25519', privateKey, data);
const valid = await crypto.subtle.verify('Ed25519', publicKey, signature, data);
```

For tests: generate a fresh Ed25519 key pair inside each test (or in a `beforeAll` block). Do NOT use a fixture/hardcoded key. Generated keys are more robust -- they prove the code works with any valid key, not just one specific key. The test key pair never leaves the test process.

For the `SIGNING_KEY` binding in integration tests: add it to the Miniflare bindings in `vitest.config.js`, similar to how `CAPTURE_API_KEY` is already configured. Generate a base64-encoded 32-byte seed and set it as a test binding value. This tests the full key import path.

### 3. Canonical JSON Determinism -- Edge Cases That Matter

The acceptance criteria demand deterministic serialization. Key sorting is the obvious requirement, but these edge cases are worth testing because they have real-world implications for WACZ manifests:

**Must test:**
- Key sorting (alphabetical) at top level
- Key sorting in nested objects (recursive)
- Consistent handling of `null` values (JSON null, not omitted)
- Number representation stability: `1.0` vs `1` vs `1.00` -- JavaScript `JSON.stringify` normalizes these but the canonical function must not introduce platform variance
- Empty objects `{}` and empty arrays `[]`
- Mixed-type arrays `[1, "two", null, {"three": 3}]`

**Should test:**
- Unicode strings (accented characters, CJK, emoji) -- these appear in captured page titles and URLs
- String escaping consistency (e.g., strings containing `"`, `\`, control characters)
- Property ordering when keys are added in different orders (the fundamental determinism guarantee)

**Do NOT test:**
- `undefined` values -- JSON.stringify already strips these; the canonical function should match this behavior
- `BigInt`, `Symbol`, `Date` objects -- these are not valid JSON types and should not appear in the manifest. Do not add defensive handling for them; that is over-engineering.
- Deeply nested structures (>3 levels) -- the manifest has a known, shallow structure. Do not test pathological nesting.

**Test structure**: One test file `test/canonical-json.test.js` with a `describe` block covering these cases. Each case should assert that two different construction orders of the same logical object produce byte-identical output. Also assert that the output is valid JSON (parse round-trip).

### 4. Signing Round-Trip Test Design

The signing round-trip test should:

1. Generate an Ed25519 key pair using `crypto.subtle.generateKey`
2. Create a known `datapackage.json` object
3. Canonicalize it
4. Compute SHA-256 of the canonical bytes
5. Sign the hash with the private key
6. Verify the signature with the public key
7. Assert verification returns `true`

Additionally, a negative test: mutate one byte of the hash (or the manifest), re-verify with the original signature -- assert verification returns `false`. This is cheap to write and proves the verification is not vacuously true.

**Key derivation path test**: The production code imports a raw 32-byte seed from the `SIGNING_KEY` secret and derives the key pair. The round-trip test should also exercise this import path:

1. Generate a key pair
2. Export the private key as raw bytes
3. Base64-encode it (simulating what `wrangler secret put` stores)
4. Import it back using the same code path the Worker uses
5. Sign with the imported key, verify with the original public key

This catches key import/export format mismatches.

### 5. Integration with Existing `performCapture` Pipeline

**Create a separate test file: `test/wacz.test.js`**. Do NOT modify `test/capture.test.js`.

Rationale:
- `test/capture.test.js` currently tests the browser rendering pipeline with 17 tests. Adding WACZ assertions there would mix concerns and make failures harder to diagnose.
- The WACZ bundling is a distinct pipeline stage that runs after artifact storage. It deserves its own test file with its own setup/teardown.
- The existing `stubRenderer` pattern works perfectly -- the integration test calls `performCapture` with a `stubRenderer`, then inspects R2 for the `.wacz` object.

The integration test structure:

```
test/wacz.test.js
  describe('WACZ bundling after capture')
    - it('writes a .wacz object to R2 after successful capture')
    - it('WACZ contains expected files (datapackage.json, archive/*.warc, indexes/*.cdxj, pages/pages.jsonl)')
    - it('datapackage.json contains correct resource hashes')
    - it('datapackage-digest.json contains valid signature')
    - it('KV record includes wacz artifact path')

test/canonical-json.test.js
  describe('canonicalJson')
    - Key sorting tests
    - Nested object tests
    - Edge case tests (null, unicode, numbers, empty containers)
    - Determinism test (different construction order, same output)

test/signing.test.js
  describe('Ed25519 signing round-trip')
    - it('sign then verify returns true')
    - it('verify with tampered data returns false')
    - it('key import from base64 seed produces working key pair')
```

### 6. Test Binding Configuration

Add a test signing key to `vitest.config.js` Miniflare bindings:

```js
miniflare: {
  bindings: {
    CAPTURE_API_KEY: 'test-api-key-for-vitest',
    SIGNING_KEY: '<base64-encoded-32-byte-test-seed>',
  },
}
```

Generate this seed once (not randomly per run) so tests are reproducible. A fixed test seed is fine -- it is not a production key, and reproducibility matters more than uniqueness for test infrastructure.

However, the unit tests in `test/signing.test.js` should generate fresh keys per test run to prove the code works with arbitrary key material. The fixed seed is only for integration tests that need the `SIGNING_KEY` binding.

### 7. What NOT to Test

- **warcio.js internals** -- if we use warcio.js, we trust it produces valid WARC records. We test our usage of it, not its correctness.
- **ZIP library internals** -- same principle.
- **R2 put/get mechanics** -- already tested in `test/capture.test.js`. We add WACZ-specific R2 assertions but do not re-test basic R2 operations.
- **SHA-256 correctness** -- we trust `crypto.subtle.digest`. We test that our code hashes the right bytes, not that SHA-256 itself works.

---

## Proposed Tasks

### Task 1: Create `test/canonical-json.test.js`

**What**: Write unit tests for the canonical JSON serialization function. Cover key sorting (top-level and nested), null values, Unicode strings, number representation, empty containers, string escaping, mixed-type arrays, and the fundamental determinism guarantee (different construction order produces identical bytes). Assert output is valid JSON via parse round-trip.

**Deliverables**: `test/canonical-json.test.js` with 8-12 focused test cases.

**Dependencies**: The `canonicalJson()` function must be implemented as a separate, exported module (e.g., `src/canonical-json.js`) -- not inline in the bundling pipeline. This is the function under test.

### Task 2: Create `test/signing.test.js`

**What**: Write Ed25519 signing round-trip tests. (a) Generate key pair, sign data, verify -- assert true. (b) Tampered data verification -- assert false. (c) Key import from base64-encoded raw seed -- exercise the exact import path the Worker uses with the `SIGNING_KEY` secret.

**Deliverables**: `test/signing.test.js` with 3-4 test cases.

**Dependencies**: The signing module must be implemented as a separate, exported module (e.g., `src/signing.js`) with `sign(privateKey, data)` and `verify(publicKey, signature, data)` functions, plus an `importSigningKey(base64Seed)` function. This enables both unit testing and integration usage.

### Task 3: Create `test/wacz.test.js`

**What**: Integration tests for the WACZ bundling pipeline. Call `performCapture` with `stubRenderer` (reuse the pattern from `test/capture.test.js`), then verify: (a) a `.wacz` object exists in R2, (b) the WACZ contains expected file entries, (c) `datapackage.json` has correct structure and hashes, (d) `datapackage-digest.json` contains a valid Ed25519 signature, (e) KV record is updated with the WACZ path.

**Deliverables**: `test/wacz.test.js` with 5-6 test cases.

**Dependencies**:
- `SIGNING_KEY` binding added to `vitest.config.js` Miniflare bindings
- WACZ bundling implementation integrated into `performCapture` pipeline
- All three unit-tested modules (canonical JSON, signing, WARC/manifest construction) must be implemented
- A way to read/parse the `.wacz` ZIP in the test (either the same ZIP library used in production, or raw R2 bytes parsed in the test)

### Task 4: Update `vitest.config.js` with `SIGNING_KEY` binding

**What**: Add a fixed test signing key seed to the Miniflare bindings so integration tests can exercise the full signing path. Generate a 32-byte seed, base64-encode it, add as `SIGNING_KEY` binding.

**Deliverables**: Updated `vitest.config.js`.

**Dependencies**: None. Can be done first since it is configuration only.

### Task 5: Verify existing capture tests still pass after pipeline modification

**What**: After WACZ bundling is integrated into `performCapture`, run the existing `test/capture.test.js` suite and verify all 17 tests still pass. The WACZ step must not break the existing capture flow. If `performCapture` now requires `SIGNING_KEY` in `env`, the existing tests must still work (either by providing the binding or by making WACZ bundling degrade gracefully when the key is absent).

**Deliverables**: Confirmation that `vitest run test/capture.test.js` passes with zero regressions.

**Dependencies**: WACZ integration into `performCapture` pipeline.

---

## Risks and Concerns

### Risk 1: Ed25519 Algorithm Name in Workers Runtime

The Cloudflare Workers runtime supports Ed25519 via the standard Secure Curves API (`'Ed25519'` as algorithm name) and a legacy `NODE-ED25519` variant. The standard API is the right choice, but if the Workers runtime version used by `@cloudflare/vitest-pool-workers@0.12.21` does not yet support the Secure Curves Ed25519, tests will fail with an unrecognizable algorithm error. **Mitigation**: Verify Ed25519 availability as the very first test written -- a simple `crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])` in a test. If it fails, fall back to the `NODE-ED25519` variant.

### Risk 2: WACZ ZIP Reading in Tests

Integration tests need to read back the `.wacz` from R2 and inspect its contents. This requires either: (a) the same ZIP library used for production to also support reading/extraction, or (b) a test-only dependency for ZIP parsing. If the chosen production ZIP library is write-only (common for lightweight libraries), the test will need a small reader. **Mitigation**: Choose a ZIP library that supports both read and write, or accept a minimal test-only dependency. Alternatively, if the ZIP structure is simple enough (STORE mode, no compression for WARC files), tests could parse the ZIP central directory manually -- but this is fragile and not recommended.

### Risk 3: `ctx.waitUntil()` Timing in Integration Tests

The existing `test/capture-integration.test.js` already shows the challenge: after `POST /v1/captures`, the background `performCapture` may or may not have completed when the test inspects state. Adding WACZ bundling extends the background work. In `test/capture.test.js`, this is not a problem because `performCapture` is awaited directly. The new `test/wacz.test.js` should follow the same pattern -- call `performCapture` directly and `await` it, NOT go through the HTTP endpoint. This avoids timing issues entirely.

### Risk 4: Test Isolation with `isolatedStorage: false`

The existing test infrastructure uses `isolatedStorage: false` with manual cleanup. WACZ tests write additional R2 objects (the `.wacz` file at a content-addressed path `captures/{sha256}.wacz`). The SHA-256 of the WACZ depends on test data, so the R2 key is deterministic for a given test fixture. Cleanup in `beforeEach` must delete the WACZ object in addition to the existing artifact cleanup. If the content-addressed path changes due to implementation details, tests may leave orphaned R2 objects. **Mitigation**: Track the expected WACZ path in a variable and clean it up explicitly. Alternatively, list and delete all objects under `captures/` prefix in cleanup.

### Risk 5: Graceful Degradation When `SIGNING_KEY` Is Absent

If the WACZ bundling step is added to `performCapture` and it requires `SIGNING_KEY`, the 17 existing tests in `test/capture.test.js` may break because they do not provide this binding. The implementation must either: (a) skip WACZ bundling when `SIGNING_KEY` is not configured (graceful degradation), or (b) the test config must provide `SIGNING_KEY` for all tests. Option (a) is preferable for operational resilience (a misconfigured Worker should still capture, even if it cannot sign). But this is an implementation design decision that affects test strategy. **Recommendation**: Design the WACZ step to be optional (skip if `SIGNING_KEY` is absent, log a warning), and only provide `SIGNING_KEY` in test config when WACZ tests need it. This keeps the existing capture tests unmodified.

On reflection, since `vitest.config.js` is shared across all test files and `isolatedStorage: false` means all tests share the same environment, adding `SIGNING_KEY` to the global bindings is the simpler path. The existing capture tests should be unaffected by the presence of an unused binding. The WACZ step should still handle a missing key gracefully (refuse to sign, still complete the capture), but in practice the test environment always has the key.

---

## Additional Agents Needed

None. The current team (security-minion, data-minion, edge-minion, test-minion) covers all the planning dimensions. The signing correctness is security-minion's domain. The WACZ format correctness is data-minion's domain. The runtime feasibility is edge-minion's domain. The test strategy is covered here.

One note: if the implementation produces a `README.md` section for key generation documentation, software-docs-minion should review it during execution (already noted in the metaplan). This does not require a planning consultation.

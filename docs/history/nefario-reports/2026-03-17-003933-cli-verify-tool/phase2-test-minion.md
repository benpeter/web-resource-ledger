# Domain Plan Contribution: test-minion

## Recommendations

### 1. Test runner: `node:test` -- not vitest

Use Node.js built-in `node:test` with `node:assert`. Rationale:

- **Zero dependencies is the whole point of the CLI.** The success criterion is `npx @wrl/verify capture.wacz` running without prior installation. Adding vitest as a devDependency is fine technically, but `node:test` is genuinely zero-cost and available on every Node >=20 (the project's engine floor). The CLI package should model the same lightweight ethos it delivers.
- **The Worker uses vitest because it needs `@cloudflare/vitest-pool-workers`.** That binding is the only reason vitest is there. The CLI has no Workers runtime, no miniflare, no fetchMock. There is nothing vitest provides that `node:test` does not for this package.
- **No consistency value.** The Worker tests and CLI tests will never share a runner configuration. They run in different packages, different CI jobs, different runtimes. Matching the `import { describe, it, expect } from 'vitest'` pattern provides familiarity but no real reuse. `node:test` has `describe`, `it`, and `test`; `node:assert` has `strictEqual`, `deepStrictEqual`, `match`, `throws`. The API surface difference is trivial.
- **Framework risk.** Vitest 3.x had breaking changes in worker pool configuration between minor versions. The CLI does not need to inherit that upgrade surface.

If there is a strong organizational preference for vitest, it works fine without the workers pool -- just use `vitest` with a bare config. But `node:test` is the recommendation.

### 2. Test fixtures: generate in test setup, do not commit binaries

The Worker's `test/verify.test.js` already demonstrates the right pattern: `buildTestWacz()` and `buildTestWaczV2()` construct valid WACZ archives in memory using `fflate.zipSync()`, ephemeral Ed25519 keys from `crypto.subtle.generateKey('Ed25519')`, and synthetic DER timestamp tokens. The CLI test suite should use the same approach.

**Do not commit binary WACZ fixtures.** Reasons:

- Binary fixtures become opaque. When the WACZ format evolves (version bump, new fields in signedData), every committed fixture must be regenerated. Programmatic fixtures make the change in one place.
- Binary diff in PRs is unreadable. Reviewers cannot verify what changed.
- The `buildTestWacz` / `buildTestWaczV2` functions are ~60 lines each. They are cheap to port or extract.
- Each test constructs exactly the corruption or mutation it needs (appended byte, swapped key, modified datapackage). This specificity is impossible with pre-baked binaries.

**However, one class of fixture must be committed: real TSA responses.** For CMS/PKCS#7 chain validation testing, you need a genuine DER-encoded RFC 3161 response from DigiCert (the project's configured TSA) with its full certificate chain. This cannot be synthesized -- the signature is the TSA's, signed by their private key. Commit these as DER files in `packages/verify/test/fixtures/` with documentation of how and when they were obtained.

### 3. CMS chain validation: both synthetic unit tests and real TSA integration test

This is the critical new capability the CLI adds. The Worker explicitly defers CMS verification ("X.509 chain validation is not feasible in Cloudflare Workers"). The CLI does it. Testing strategy must cover both layers:

**Unit tests with synthetic DER fixtures (the 70% layer):**

- Parse a well-formed CMS SignedData structure and extract signer certificates, digest algorithm, encrypted digest.
- Validate that the code rejects: expired certificates, missing intermediate certificates, untrusted root CA, wrong signature algorithm, truncated DER, malformed ASN.1.
- These tests use hand-crafted or programmatically-built DER structures (extending the existing `buildTSTInfo` / `buildTimeStampToken` helpers with certificate and SignerInfo fields).
- Test the X.509 chain-building logic in isolation: given a set of certificates, does the code correctly build leaf -> intermediate -> root?
- Test trust anchor management: what constitutes a "trusted root" for the CLI? Mozilla's CA bundle? A vendored subset? This design decision affects what fixtures are needed.

**Integration test with a real TSA response (the 20% layer):**

- Capture a real WACZ from the staging Worker (`wrl-staging.benpeter.workers.dev`), or use a previously-captured WACZ known to contain a valid DigiCert timestamp token.
- Run the full CLI verification pipeline against it.
- Assert that the CMS signature chain validates to a trusted root.
- This test hits no external services at runtime -- the WACZ is a committed fixture or fetched once during test setup and cached. The point is that the DER bytes inside it are real, not synthetic.
- Mark this test with a `skip` condition or tag if the fixture is not present (e.g., first run before anyone has fetched one). Provide a script to refresh the fixture.

**One committed real-TSA fixture is essential.** The project's CLAUDE.md states: "When adding a feature that depends on an external service, the test suite must include at least one assertion that the integration actually works end-to-end." CMS chain validation depends on real TSA certificate data. A synthetic fixture cannot test whether the code handles DigiCert's actual certificate hierarchy correctly.

### 4. Shared test logic: extract a `test-helpers` module, do not share test files

The Worker's `verify.test.js` and the CLI's tests need the same helpers:

- `buildTestWacz()` / `buildTestWaczV2()` -- construct valid WACZ archives
- DER construction helpers (`writeTLV`, `writeLength`, `concat`, `buildTSTInfo`, `buildTimeStampToken`)
- `buildValidToken()` / `buildMismatchedToken()` -- synthetic RFC 3161 tokens

These are currently inlined in `test/verify.test.js` (lines 432-495) and duplicated in `test/rfc3161.test.js` (lines 11-140). The duplication already exists within the Worker package.

**Recommendation:** Extract these into a shared `test/helpers/` directory within the Worker package. The CLI package can either:

(a) **Copy the helpers** -- simplest, since the CLI is a separate package with its own lifecycle. Copy once, maintain independently. Acceptable given the helpers are stable (~100 lines total) and the WACZ format rarely changes.

(b) **Import from a shared workspace package** -- if the repo uses npm workspaces, create a `packages/test-helpers` internal package. But this adds workspace complexity for ~100 lines of code. YAGNI unless there will be more packages.

Option (a) is the recommendation given the project's lean philosophy. The CLI duplicates the helpers, clearly commented as "mirrors Worker test helpers."

### 5. What the CLI test suite must cover

The CLI adds three categories of functionality beyond what the Worker already tests:

**Category A: CMS/PKCS#7 chain validation (entirely new)**
- Parse CMS SignedData from RFC 3161 token
- Extract signer certificate chain
- Validate leaf certificate signature against issuing CA
- Validate intermediate certificate against root CA
- Reject expired certificates (test with a fixture whose cert has a notAfter in the past)
- Reject chains that do not terminate at a trusted root
- Handle the specific DigiCert certificate hierarchy used by `timestamp.digicert.com`
- Handle missing or malformed certificates in the CMS structure

**Category B: CLI interface (new, but thin)**
- `wrl-verify capture.wacz` with a local file path -- reads file, runs verification, prints human-readable output, exits 0 on pass
- `wrl-verify https://wrl.../v1/verify/cap_xxx` -- fetches WACZ from URL, same verification pipeline
- `--json` flag -- outputs structured JSON to stdout
- Exit code 0 on full pass, non-zero on any failure
- Error messages for: file not found, invalid URL, network failure, non-WACZ file

**Category C: Core verification logic (reused from Worker, must be re-validated)**
- Artifact hash verification (SHA-256 of each resource vs datapackage.json)
- Bundle hash verification (canonical JSON hash vs signedData.hash)
- Ed25519 signature verification (using Node.js `crypto.subtle`, not Workers runtime)
- Timestamp messageImprint verification
- v0.1.0 vs v0.2.0 format detection and handling
- Security invariant: no hash leakage in error messages

Do not skip Category C just because the Worker already tests it. The CLI runs on Node.js, not miniflare. `crypto.subtle` behavior differences between Node.js and Workers are rare but real (especially Ed25519 key import formats). Re-running the existing test scenarios against the CLI's imports validates the port.

### 6. Minimum coverage targets

Given the project philosophy ("test the real boundaries"), focus coverage on critical paths rather than percentage targets:

- **CMS chain validation: 100% branch coverage.** This is the new capability and the security-critical path. Every branch in certificate parsing, chain building, and trust anchor comparison must be exercised.
- **CLI argument parsing and output formatting: 90%+ line coverage.** The CLI is the user-facing surface. Exercise all flag combinations, error paths, and output modes.
- **Core verification logic (verify.js, rfc3161.js, canonical-json.js): validate via test scenario coverage, not percentage.** The test scenarios from the Worker already enumerate the critical paths. Port them. If they all pass, coverage will be high naturally.
- **Integration test: at least one real WACZ with a real TSA timestamp passes full verification.** This is the "test the real boundaries" requirement. It validates the entire pipeline end-to-end with production-shaped data.

Do not set a blanket percentage target. The project explicitly rejects coverage-as-metric ("code coverage measures which lines executed during tests... coverage percentage is not a quality measure").

### 7. Test execution structure

```
packages/verify/
  test/
    unit/
      verify.test.js          -- port of Worker verify.test.js scenarios
      rfc3161.test.js          -- timestamp messageImprint verification
      cms-chain.test.js        -- CMS/PKCS#7 certificate chain validation
      canonical-json.test.js   -- canonicalize() edge cases
      cli-args.test.js         -- argument parsing, flag handling
      cli-output.test.js       -- human-readable and JSON output formatting
    integration/
      real-wacz.test.js        -- end-to-end with a real captured WACZ
      remote-fetch.test.js     -- fetching from a URL (mock HTTP server)
    fixtures/
      digicert-tsa-response.der       -- real TSA response for chain validation
      digicert-tsa-response.README.md -- provenance: when captured, how to refresh
    helpers/
      build-wacz.js            -- buildTestWacz, buildTestWaczV2
      der-builders.js          -- writeTLV, buildTSTInfo, buildTimeStampToken
```

Run with: `node --test test/unit/*.test.js test/integration/*.test.js`

CI configuration: run `node --test` in the `packages/verify` directory. No vitest runner, no special pool, no miniflare. Pure Node.js.

### 8. The `requestTimestamp` function does not port

The Worker's `rfc3161.test.js` tests both `requestTimestamp` (capture-time: sends request to TSA) and `verifyTimestamp` (verification-time: checks stored token). The CLI only needs `verifyTimestamp` plus the new CMS chain validation. Do not port the `requestTimestamp` tests -- they use `cloudflare:test` fetchMock which does not exist in Node.js, and the CLI never requests timestamps.

## Proposed Tasks

### T1: Set up `packages/verify` test infrastructure
- Initialize `node:test` runner in `packages/verify/package.json` (`"test": "node --test test/unit/*.test.js test/integration/*.test.js"`)
- Create `test/helpers/build-wacz.js` and `test/helpers/der-builders.js` by extracting from Worker's `test/verify.test.js`
- Validate that helpers work under Node.js (Ed25519 key generation, `crypto.subtle`, `fflate`)
- **Depends on**: packages/verify directory structure existing

### T2: Port core verification unit tests
- Port the happy-path, tamper-detection, error-handling, and security-invariant tests from Worker's `verify.test.js` to `test/unit/verify.test.js`
- Port timestamp messageImprint tests from Worker's `rfc3161.test.js` (only `verifyTimestamp`, not `requestTimestamp`)
- Adapt from vitest API (`expect().toBe()`) to `node:assert` (`strictEqual()`)
- **Depends on**: T1, core verify.js ported to Node.js

### T3: Write CMS/PKCS#7 chain validation unit tests
- Test DER parsing of CMS SignedData structures
- Test certificate chain building (leaf -> intermediate -> root)
- Test trust anchor validation against bundled root CAs
- Test rejection of expired, untrusted, and malformed certificates
- Test the specific DigiCert certificate hierarchy
- **Depends on**: T1, CMS validation module implemented

### T4: Write CLI interface tests
- Test argument parsing: local file path, remote URL, `--json` flag, `--help`
- Test exit codes: 0 for pass, 1 for verification failure, 2 for input error
- Test human-readable output format (check for key phrases, not exact formatting)
- Test JSON output structure (parse and validate against expected schema)
- Test error messages: file not found, bad URL, network failure
- **Depends on**: T1, CLI entry point implemented

### T5: Obtain and commit real TSA fixture
- Capture a WACZ via the staging Worker (or production) that contains a valid RFC 3161 timestamp
- Extract the DER-encoded TSA response (or capture the full WACZ as fixture)
- Document provenance in `test/fixtures/digicert-tsa-response.README.md`
- Provide a script (`test/fixtures/refresh-fixture.sh`) to re-capture if certificates rotate
- **Depends on**: staging Worker is operational, RFC 3161 timestamps are shipping

### T6: Write end-to-end integration test
- Load the real WACZ fixture from T5
- Run the full verification pipeline (artifact hashes, bundle hash, Ed25519, CMS chain)
- Assert all checks pass including CMS chain validation to trusted root
- Test with `--json` output and validate the complete result structure
- **Depends on**: T2, T3, T4, T5

### T7: Add CI job for CLI tests
- Add a GitHub Actions job that runs `node --test` in the CLI package directory
- Separate from the Worker's vitest job (different runner, different directory)
- Run on push and PR, parallel with Worker tests
- **Depends on**: T1-T6 complete

## Risks and Concerns

### Risk 1: `crypto.subtle` Ed25519 compatibility between Node.js and Workers

Node.js 20+ supports Ed25519 via `crypto.subtle`, but the import/export formats and algorithm name strings may differ subtly from the Workers runtime. The Worker code uses `'Ed25519'` as the algorithm identifier for `importKey`, `sign`, and `verify`. Node.js requires the same string but may behave differently with `'raw'` format key import. **Mitigation**: T2 specifically validates this by running the exact same test scenarios that pass in miniflare under native Node.js. Any incompatibility surfaces immediately.

### Risk 2: Trust anchor selection for CMS chain validation

The CMS chain validation must decide what constitutes a "trusted root CA." Options: (a) bundle Mozilla's root CA list, (b) use Node.js's built-in root CA store, (c) vendor only the DigiCert root CA. Option (b) is simplest but makes test results dependent on the Node.js version's CA bundle. Option (c) is most predictable but breaks if the TSA switches providers. This is a design decision that affects test fixtures. **Mitigation**: the test suite should test the chain validation logic with explicit trust anchors, not rely on system defaults. The integration test (T6) should specify the expected root CA explicitly so it does not depend on the user's Node.js build.

### Risk 3: Real TSA fixture staleness

DigiCert certificates have finite validity periods (typically 1-3 years). The committed TSA response fixture will eventually contain expired certificates. **Mitigation**: T5 includes a refresh script and the README documents the certificate expiry dates. The integration test should check certificate validity and provide a clear error when the fixture needs refreshing, not a cryptic ASN.1 parse failure.

### Risk 4: `fflate` in Node.js vs Workers

The Worker uses `fflate` for ZIP operations. The same library should work in Node.js, but `fflate` historically had minor issues with some Node.js versions regarding `Uint8Array` handling. Alternative: Node.js has `zlib` built-in, but not ZIP-level extraction. Could also use `adm-zip` or `yauzl`. **Mitigation**: T1 validates that `fflate.zipSync` / `unzipSync` work correctly in the target Node.js version. If issues arise, the CLI can vendor a Node-native ZIP solution without affecting the test strategy.

### Risk 5: `atob` / `btoa` availability

The Worker code uses `atob()` and `btoa()` extensively for base64 encoding. These are available in Node.js 16+ as globals, but were not always. Since the engine floor is Node 20, this should be fine. **Mitigation**: the test helper port in T1 will immediately surface any issues.

## Additional Agents Needed

- **security-minion**: Should review the trust anchor selection (Risk 2). The decision of which root CAs to trust for CMS validation has security implications. Trusting too many roots weakens the guarantee; trusting too few creates brittleness if DigiCert rotates intermediates.

- **margo (implementation)**: The CMS/PKCS#7 parsing and X.509 chain validation is the bulk of the new code. The test strategy (T3) cannot be finalized until the implementation approach is known: does the CLI use Node.js `crypto.createVerify()` for RSA signature validation? Does it use a library like `@peculiar/x509` or `pkijs`? Or does it extend the existing hand-rolled DER parser? The test approach differs significantly for each. If extending the hand-rolled parser, many more unit tests for DER edge cases are needed. If using a library, the tests focus on integration with the library's API.

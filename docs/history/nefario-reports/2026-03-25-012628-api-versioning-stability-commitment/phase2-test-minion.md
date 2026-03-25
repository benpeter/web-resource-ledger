## Domain Plan Contribution: test-minion

### Recommendations

#### 1. WRL-API-Version header: extend the existing `expectSecurityHeaders()` helper

The `WRL-API-Version` header is structurally identical to the other "every response must include this" headers already tested in `test/security-headers.test.js`. It is set in the same post-response block (src/index.js lines 614-619) alongside Referrer-Policy, X-Content-Type-Options, X-Frame-Options, HSTS, and Link. Adding it to the existing `expectSecurityHeaders()` helper is the correct approach -- it avoids duplicating the 5-route sampling strategy and keeps the "global headers contract" tested in one place.

However, the helper should be renamed. It was originally scoped to security headers, but with `Link` (terms-of-service) and now `WRL-API-Version`, it has become a "mandatory response headers" helper. Rename to `expectMandatoryHeaders()` or `expectGlobalHeaders()` to reflect its actual purpose.

**How to assert the version value without hardcoding:**

Do NOT hardcode `'1.0.0'` in test assertions. This creates a maintenance burden where every version bump requires updating test files. Instead:

- Assert that the header **exists and matches a semver pattern**: `expect(header).toMatch(/^\d+\.\d+\.\d+$/)`. This verifies the header is present and well-formed on every response.
- Add a **separate, focused test** that reads the version from openapi.yaml (or a shared config constant) and asserts the header value matches it. This tests the coupling, not the specific value. This single test can live in the same file.

This gives you two layers: "header is always present and valid semver" (structural) and "header matches the declared API version" (semantic). The structural tests never break on version bumps. The semantic test breaks only if the source-of-truth and runtime diverge, which is exactly the bug it should catch.

**Concrete approach for the semantic test**: The implementation should expose the API version as an importable constant (e.g., `export const API_VERSION = '1.0.0'` in a `src/version.js` or similar). The test imports that constant and compares it to the response header value. This way:
- The test never hardcodes a version string.
- If the constant and the response header disagree, the test catches it.
- The CI version-match check separately ensures the constant matches openapi.yaml and the git tag.

#### 2. Deprecation headers: unit test the config, integration test the mechanism

The deprecation header system has two testable layers:

**Layer 1 -- Unit test the deprecation config/registry (new test file: `test/deprecation.test.js`)**

The meta-plan describes a declarative deprecation config that middleware reads (rather than per-route logic). This config is the right place for unit tests:

- Given a route marked as deprecated with a sunset date, the deprecation middleware/function returns the correct `Deprecation` and `Sunset` headers per RFC 8594.
- Given a route NOT marked as deprecated, no deprecation headers are set.
- Given an invalid sunset date in config, the system either rejects it at startup or logs an error (fail loudly, per project philosophy).
- The `Deprecation` header value follows RFC 8594 format: `Deprecation: @1234567890` (Unix timestamp) or `Deprecation: true` depending on which RFC 8594 variant api-design-minion selects.
- The `Sunset` header is a valid HTTP-date (RFC 7231).

These are pure function tests -- no SELF.fetch needed. Fast, isolated, no flakiness.

**Layer 2 -- Integration test via SELF.fetch (extend `test/security-headers.test.js`)**

Add a single describe block that verifies the end-to-end mechanism works through the full request pipeline. Since no endpoints are actually deprecated at v1.0.0, this test needs a mechanism to exercise the deprecation path. Two options:

- **Option A (preferred)**: Use a test-only route or configuration override. The vitest config already injects test-specific bindings (CAPTURE_API_KEY, CORS_ORIGINS, etc.). Add a `DEPRECATED_ROUTES` binding in `vitest.config.js` that marks a test path (e.g., `/health`) as deprecated with a future sunset date. The test then hits `/health` and asserts the Deprecation and Sunset headers are present. This tests the real middleware path.
- **Option B (acceptable fallback)**: Test only the absence of deprecation headers on non-deprecated routes (verifying no false positives), and test the deprecation header function in unit tests only. Less coverage but simpler if Option A's config injection is awkward.

I recommend Option A because the project philosophy explicitly states "test the real boundaries" and "integration tests must exercise the real external boundaries."

**Do NOT create a dedicated test file for deprecation integration tests.** The whole point of the security-headers.test.js pattern is that global response headers are tested across representative routes in one place. Adding deprecation header checks to the same helper (when a route is deprecated) or the same file (as a new describe block) keeps the "response header contract" cohesive.

#### 3. CI version-match check: CI-level validation is sufficient; no meta-test needed

The CI version-match check (openapi.yaml version == latest git tag) is a shell script or CI step. Writing a test that validates the check script itself is over-engineering. The CI check is a straightforward comparison of two strings -- if the script has a bug, it will either false-positive (block a valid PR) or false-negative (allow a mismatch). A false-positive is self-correcting (the team notices immediately). A false-negative is caught by other safeguards (the semantic version header test, code review of the PR template checklist).

However, the **semantic version header test** described in recommendation 1 serves as a runtime backstop for the CI check. If CI fails to catch a mismatch between openapi.yaml and the code's version constant, the test catches it. Two independent checks at different layers.

The only CI-adjacent test worth adding: if the version-match check is a shell script in the repo (e.g., `scripts/check-version.sh`), add it to shellcheck linting. But don't write a vitest test for it.

#### 4. Test brittleness risk assessment

Hardcoding the version string in tests is the primary brittleness risk. Mitigations:

- **Structural tests** (semver regex match) never break on version bumps.
- **Semantic test** (imports the version constant) breaks only when there's a real discrepancy.
- **No snapshot tests** for version headers -- snapshots would hardcode the value and break on every bump.
- **CHANGELOG.md validation** is a CI linting concern, not a vitest concern. Don't test changelog format in the Worker test suite.

Secondary brittleness: if the deprecation config format changes, unit tests break. Mitigate by keeping the config shape simple and testing behavior (does the function return the right headers?) not structure (does the config have field X?).

### Proposed Tasks

#### Task 1: Rename `expectSecurityHeaders()` and add WRL-API-Version assertion
- **What**: In `test/security-headers.test.js`, rename `expectSecurityHeaders()` to `expectGlobalHeaders()`. Add assertion that `WRL-API-Version` header exists and matches `/^\d+\.\d+\.\d+$/`.
- **Deliverables**: Updated `test/security-headers.test.js` with all 5 existing route tests automatically covering WRL-API-Version presence. Rename is cosmetic but prevents future confusion about scope.
- **Dependencies**: Requires the implementation to actually set the `WRL-API-Version` header in the post-response block of src/index.js. Tests should be written first (TDD) -- they will fail until the header is added.

#### Task 2: Add semantic version consistency test
- **What**: In `test/security-headers.test.js`, add a new describe block: "WRL-API-Version -- semantic consistency". Import the API version constant from the source module. Hit `/health` via SELF.fetch. Assert `response.headers.get('WRL-API-Version')` equals the imported constant.
- **Deliverables**: One new test that catches version-constant vs. response-header drift.
- **Dependencies**: Requires the implementation to export the version as a constant from a source module (e.g., `src/version.js`). This dependency must be communicated to the implementing agent.

#### Task 3: Create `test/deprecation.test.js` for unit tests of deprecation config
- **What**: Create a new test file that imports the deprecation header function/middleware directly (not via SELF.fetch). Test: (a) deprecated route returns correct Deprecation and Sunset header values, (b) non-deprecated route returns no deprecation headers, (c) header values conform to RFC 8594 format. Use parameterized tests for multiple date/config combinations.
- **Deliverables**: `test/deprecation.test.js` with 3-5 unit tests covering the deprecation header function.
- **Dependencies**: Requires api-design-minion to define the deprecation mechanism (declarative config vs. per-route). The test design follows whichever approach is chosen, but the tests target the function that generates headers, not the route handler.

#### Task 4: Add deprecation integration test to security-headers test file
- **What**: In `test/security-headers.test.js`, add a describe block that exercises the deprecation header mechanism end-to-end. Use a test-specific binding (e.g., `DEPRECATED_ROUTES`) in vitest.config.js to mark a test route as deprecated. Assert that hitting that route returns Deprecation and Sunset headers with correct values. Also assert that hitting a non-deprecated route does NOT return deprecation headers.
- **Deliverables**: New describe block in `test/security-headers.test.js`, updated vitest.config.js with test-specific deprecation binding.
- **Dependencies**: Requires the deprecation middleware to be configurable via binding (same mechanism as CORS_ORIGINS, CAPTURE_API_KEY, etc.). Depends on Task 3 being designed first so unit and integration tests are complementary, not redundant.

#### Task 5: Define testable acceptance criteria for CI version check
- **What**: Document the expected behavior of the CI version-match check so it can be verified during code review: (a) CI fails when openapi.yaml version does not match latest annotated git tag, (b) CI passes when they match, (c) CI handles the "no tags exist yet" case gracefully (first release). These are manual verification criteria for the CI step, not automated vitest tests.
- **Deliverables**: Acceptance criteria documented in the evolution log's `decisions.md` or the implementation PR description.
- **Dependencies**: Requires iac-minion's CI design to be finalized.

### Risks and Concerns

1. **Version constant location**: If the implementing agent does not export the API version as a single importable constant, the semantic consistency test (Task 2) cannot avoid hardcoding. The execution plan must specify that the version be a single source of truth in code, not duplicated across files. I recommend `src/version.js` exporting `API_VERSION`.

2. **Deprecation config injection in tests**: The test vitest.config.js already injects bindings like CORS_ORIGINS and CAPTURE_API_KEY. Adding a `DEPRECATED_ROUTES` test-only binding is consistent with this pattern. However, if api-design-minion chooses a mechanism that doesn't use bindings (e.g., a code-level config file), the integration test approach changes. The test strategy should be revisited after api-design-minion's output is available.

3. **CORS preflight gap**: The CORS preflight (OPTIONS) handler returns a 204 before reaching the post-response header block. Check whether OPTIONS responses also get the WRL-API-Version header. If not, decide whether this is acceptable (OPTIONS is a browser mechanism, not an API call) or a gap. The existing security-headers.test.js does NOT test OPTIONS routes. The CORS test file (test/cors.test.js line 81-89) tests that some security headers appear on preflight but doesn't use the shared helper. This pre-existing inconsistency should be addressed in this task: either add OPTIONS to the security-headers representative routes, or document that OPTIONS responses are intentionally excluded from the version header contract.

4. **Rename ripple effect**: Renaming `expectSecurityHeaders()` to `expectGlobalHeaders()` is a cosmetic change, but verify that no other test files import or reference it. A grep shows it is only used within security-headers.test.js (defined and called in the same file, not exported), so the rename is safe.

5. **Test execution order**: The deprecation integration test (Task 4) uses a test-specific binding. Since vitest.config.js bindings apply to all tests in the pool, adding a `DEPRECATED_ROUTES` binding means all tests see it. The deprecation middleware must be written so that it only adds headers when a route is actually in the deprecated list -- not unconditionally. If the middleware has a bug and adds deprecation headers to all routes, the existing security-headers tests will NOT catch it (they don't assert absence of deprecation headers). Task 4's "non-deprecated route has no deprecation headers" test covers this.

### Additional Agents Needed

None. The four-agent team (api-design-minion, api-spec-minion, iac-minion, test-minion) covers all aspects of this task. The test strategy depends on api-design-minion's deprecation mechanism choice and iac-minion's CI design, but those dependencies are already captured in the meta-plan's consultation sequence.

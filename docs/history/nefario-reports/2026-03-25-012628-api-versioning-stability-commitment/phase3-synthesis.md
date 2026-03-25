## Delegation Plan

**Team name**: api-v1-stability
**Description**: Establish WRL API v1.0.0 with formal versioning, published changelog, deprecation policy, and CI enforcement

### Task 1: OpenAPI spec -- header components, WRL-API-Version references, version bump
- **Agent**: api-spec-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This task modifies 63+ response definitions in the API contract (openapi.yaml). Incorrect header placement or missed references propagate to all downstream consumers. The version bump from 0.8.0 to 1.0.0 is a one-way commitment. Reviewable only before commit.
- **Gate rationale**: |
    Chosen: Add WRLAPIVersion, Deprecation, Sunset header components to components/headers. Reference WRLAPIVersion from all ~63 response headers blocks. Bump info.version to 1.0.0. Only reference Deprecation/Sunset per-endpoint when actually deprecated (not preemptively on all responses).
    Over: (1) Adding Deprecation/Sunset references to all responses now "for completeness" -- rejected because the spec should declare only what the API actually returns today. (2) Using x-global-headers extension instead of per-response $ref -- rejected because no standard tooling respects it.
    Why: The per-response $ref pattern matches how all 9 existing headers are already referenced, and deferring Deprecation/Sunset references keeps the spec honest about current behavior.
- **Prompt**: |
    You are updating the WRL OpenAPI specification to declare the v1.0.0 API contract.

    ## Context

    WRL is a Cloudflare Worker API for web resource archival. The spec is at `openapi.yaml` (currently 4665+ lines, OpenAPI 3.1.0). The project uses Redocly for linting (`npm run lint:api`).

    The existing spec already defines 9 header components in `components/headers` (ReferrerPolicy, XContentTypeOptions, XFrameOptions, StrictTransportSecurity, RetryAfter, XRateLimitLimit, TermsLink, XQuotaLimit, XQuotaUsed, XQuotaRemaining) and references them via `$ref` in every response definition. You will follow this exact pattern.

    ## What to do

    ### Step 1: Add three new header components to `components/headers`

    Add these entries following the existing PascalCase naming convention:

    ```yaml
    WRLAPIVersion:
      description: >
        Semantic version of the WRL API that produced this response. Matches the
        info.version field in this specification. Present on every response.
      schema:
        type: string
        pattern: '^\d+\.\d+\.\d+$'
        example: '1.0.0'

    Deprecation:
      description: >
        Indicates the resource has been deprecated per RFC 9745. Value is a
        Structured Field Date (@timestamp) representing when the resource was
        marked deprecated. Absent on non-deprecated resources.
      schema:
        type: string
        pattern: '^@\d+$'
        example: '@1735689599'

    Sunset:
      description: >
        Date after which the resource may become unresponsive per RFC 8594.
        Value is an HTTP-date (RFC 7231). Present only alongside the Deprecation header.
      schema:
        type: string
        example: 'Sat, 31 Dec 2025 23:59:59 GMT'
    ```

    IMPORTANT RFC distinction: The Deprecation header uses RFC 9745 (published March 2025) with Structured Field Date format (`@unix-timestamp`). The Sunset header uses RFC 8594 with HTTP-date format. These are different RFCs with different date formats. Do NOT conflate them.

    ### Step 2: Reference WRLAPIVersion from ALL response definitions

    Add `WRL-API-Version: $ref: '#/components/headers/WRLAPIVersion'` to every `headers:` block in the spec:

    - All 6 shared response components: `Problem400`, `Problem401`, `Problem403`, `Problem404`, `Problem429`, `Problem503`
    - Every inline response definition (200, 201, 202, 204, 207, 500) across all path operations

    This is approximately 63 insertion points. Use search to find all `headers:` blocks rather than visiting each path manually. After insertion, verify the count of `WRLAPIVersion` references matches the number of `headers:` blocks.

    **Do NOT add Deprecation or Sunset references to any response definition.** Those headers appear only on actually-deprecated endpoints. Since no endpoints are deprecated at v1.0.0, these components are defined for future reference only.

    **CORS OPTIONS responses**: The OPTIONS 204 responses for `/v1/captures` and `/mcp` flow through the same post-response header block as all other responses, so they DO receive the WRL-API-Version header at runtime. However, these OPTIONS responses are not explicitly defined in the spec (CORS preflight is handled as infrastructure, not as documented API operations). Do NOT add spec definitions for OPTIONS responses -- this is consistent with the existing spec which also omits them.

    ### Step 3: Bump version and update examples

    - Change `info.version` from `0.8.0` to `1.0.0`
    - Update the health endpoint's response example: change `build.version` example from `'0.1.0'` to `'1.0.0'`

    ### Step 4: Bump package.json version

    - Change `package.json` `version` from `0.1.0` to `1.0.0`
    - These MUST be identical going forward (CI will enforce this)

    ### Step 5: Validate

    Run `npm run lint:api` (Redocly lint) to verify the updated spec is structurally valid and all `$ref` paths resolve correctly.

    ## Files to modify
    - `openapi.yaml` -- header components, response references, version bump, health example
    - `package.json` -- version bump to 1.0.0

    ## What NOT to do
    - Do NOT add Deprecation/Sunset header references to any response definition
    - Do NOT add OPTIONS response definitions to the spec
    - Do NOT restructure the spec into multiple files
    - Do NOT add custom linting rules or Spectral configuration
    - Do NOT modify any source code files

    ## Acceptance criteria
    - `info.version` is `1.0.0`
    - `package.json` version is `1.0.0`
    - WRLAPIVersion, Deprecation, and Sunset header components exist in `components/headers`
    - Every response definition references WRLAPIVersion (count matches total headers blocks)
    - No response definition references Deprecation or Sunset
    - Health endpoint example shows version `1.0.0`
    - `npm run lint:api` passes cleanly
- **Deliverables**: Updated `openapi.yaml` with 3 new header components, WRLAPIVersion referenced from all responses, version 1.0.0. Updated `package.json` with version 1.0.0.
- **Success criteria**: `npm run lint:api` passes. grep count of `WRLAPIVersion` references matches count of `headers:` blocks in the spec.

### Task 2: Worker implementation -- WRL-API-Version header and deprecation mechanism
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none (can run in parallel with Task 1)
- **Approval gate**: no
- **Prompt**: |
    You are implementing the WRL-API-Version response header and the deprecation header mechanism in the WRL Cloudflare Worker.

    ## Context

    WRL is a Cloudflare Worker (src/index.js). The post-response header block at lines 614-619 sets global headers on every response (Referrer-Policy, X-Content-Type-Options, X-Frame-Options, HSTS, Link/terms-of-service). This is where you will add the version header and deprecation header injection.

    `BUILD_VERSION` is a compile-time define injected by the deploy pipeline from `package.json` version (see `.github/workflows/deploy-production.yml` line 73). In the test environment, `BUILD_VERSION` is NOT defined -- the health endpoint already handles this with `typeof BUILD_VERSION !== 'undefined'` guard at line 648.

    The routes array at line 61 uses regex patterns. The fetch handler iterates routes at lines 573-579, matching on method and pattern.

    ## What to do

    ### Step 1: Create `src/version.js`

    Create a version module that exports the API version as a constant. This gives tests an importable value to assert against without hardcoding version strings.

    ```javascript
    // tva
    // API version constant -- matches openapi.yaml info.version and package.json version.
    // Used by tests for semantic version consistency checks.
    // The runtime WRL-API-Version header reads BUILD_VERSION (injected at deploy time)
    // which equals this value when package.json and openapi.yaml are in sync (CI-enforced).
    export const API_VERSION = '1.0.0';
    ```

    ### Step 2: Add WRL-API-Version header to the post-response block

    In `src/index.js`, after line 619 (the Link/terms-of-service header) and before `return response;`, add:

    ```javascript
    if (typeof BUILD_VERSION !== 'undefined') {
      response.headers.set('WRL-API-Version', BUILD_VERSION);
    }
    ```

    The `typeof` guard is required: in tests and local dev, `BUILD_VERSION` is not defined. When undefined, the header is simply absent. This is the same pattern used by the health endpoint at line 648.

    ### Step 3: Create `src/deprecations.js`

    Create a declarative deprecation config module. This ships EMPTY at v1.0.0 -- no endpoints are deprecated. The module establishes the mechanism for future use.

    ```javascript
    // Declarative deprecation registry.
    // When an endpoint is deprecated, add an entry here. The post-response block
    // in src/index.js reads this config and injects Deprecation, Sunset, and
    // Link headers on matching responses.
    //
    // Key format: 'METHOD /path/template' (human-readable, matched via ROUTE_KEYS lookup)
    // Values:
    //   deprecated: Unix timestamp when the endpoint was marked deprecated (Structured Field Date per RFC 9745)
    //   sunset:     HTTP-date string when the endpoint stops responding (per RFC 8594)
    //   link:       URL to migration documentation
    //
    // Example:
    // 'GET /v1/captures/:id/status': {
    //   deprecated: 1735689599,
    //   sunset: 'Tue, 01 Jul 2025 00:00:00 GMT',
    //   link: 'https://docs.webresourceledger.com/migration/status-endpoint',
    // },

    export const DEPRECATIONS = {};
    ```

    ### Step 4: Add deprecation header injection to the post-response block

    Import `DEPRECATIONS` from `src/deprecations.js`. To match the current request against the DEPRECATIONS keys, you need a mapping from regex patterns to human-readable route keys. Create a `ROUTE_KEYS` map in `src/index.js` that maps each route's regex source to a template string:

    ```javascript
    // Map regex patterns to human-readable route keys for deprecation lookup.
    // Generated from the routes array -- must stay in sync.
    const ROUTE_KEYS = new Map(routes.map(([method, pattern]) => [
      pattern.source,
      `${method} ${pattern.source
        .replace(/\\\//g, '/')
        .replace(/^\^/, '')
        .replace(/\$$/, '')
        .replace(/\([^)]+\)/g, ':param')}`
    ]));
    ```

    Then in the post-response block, after the WRL-API-Version header, add the deprecation header injection. Thread the matched route info through by storing the matched route when found in the routing loop (lines 573-579). Before the loop, declare `let matchedRouteKey = null;`. Inside the loop, when a match is found, compute `matchedRouteKey = ROUTE_KEYS.get(pattern.source) || null;`.

    In the post-response block:

    ```javascript
    if (matchedRouteKey) {
      const dep = DEPRECATIONS[matchedRouteKey];
      if (dep) {
        response.headers.set('Deprecation', `@${dep.deprecated}`);
        response.headers.set('Sunset', dep.sunset);
        // Append deprecation link to existing Link header (RFC 8288 comma-separated)
        const existingLink = response.headers.get('Link') || '';
        response.headers.set('Link', `${existingLink}, <${dep.link}>; rel="deprecation"`);
      }
    }
    ```

    Important: The Link header already contains `rel="terms-of-service"`. When appending a deprecation link, use comma-separation per RFC 8288. Do NOT overwrite the existing Link value.

    ### Step 5: Verify CORS OPTIONS behavior

    Verify that the CORS OPTIONS handlers (lines 411-420 for /mcp, lines 427-440 for /v1/captures) fall through to the post-response block. They do -- the response is created early but no `return` statement prevents reaching lines 614+. The WRL-API-Version header will appear on OPTIONS responses. This is correct -- it is informational and does not affect CORS behavior.

    ## Files to create
    - `src/version.js` -- API version constant
    - `src/deprecations.js` -- empty deprecation registry

    ## Files to modify
    - `src/index.js` -- WRL-API-Version header, deprecation header injection, ROUTE_KEYS map, matchedRouteKey variable in routing loop

    ## What NOT to do
    - Do NOT hardcode the version string in the header (use BUILD_VERSION)
    - Do NOT add a fallback value like `'dev'` when BUILD_VERSION is undefined -- just skip the header
    - Do NOT modify the routes array structure
    - Do NOT add a global Link header for the deprecation policy (this was considered and deferred -- the deprecation policy is discoverable from the repo)
    - Do NOT modify openapi.yaml or package.json (Task 1 handles that)
    - Do NOT write tests (Task 4 handles that)

    ## Acceptance criteria
    - `src/version.js` exists and exports `API_VERSION = '1.0.0'`
    - `src/deprecations.js` exists and exports empty `DEPRECATIONS` object with documented schema
    - WRL-API-Version header is set on all responses when BUILD_VERSION is defined
    - WRL-API-Version header is absent when BUILD_VERSION is undefined (test environment)
    - Deprecation header injection reads from DEPRECATIONS config (currently empty, so no headers added)
    - Link header concatenation uses comma-separation, not replacement
    - ROUTE_KEYS map correctly translates regex patterns to human-readable route keys
    - matchedRouteKey is threaded through from the routing loop to the post-response block
- **Deliverables**: New files `src/version.js`, `src/deprecations.js`. Modified `src/index.js` with version header, deprecation mechanism, route key mapping.
- **Success criteria**: Existing tests pass (`npm test`). Manual inspection confirms the version header and deprecation mechanism are correctly placed in the post-response block.

### Task 3: CHANGELOG.md and DEPRECATION-POLICY.md
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none (can run in parallel with Tasks 1-2)
- **Approval gate**: yes
- **Gate reason**: The deprecation policy is a binding commitment with v1.0.0 -- the 6-month notice period and breaking change definitions become contractual once published. The retroactive changelog involves judgment calls about categorizing pre-1.0 changes. Both are hard to reverse once published and tagged.
- **Gate rationale**: |
    Chosen: 6-month minimum deprecation notice with 30-day emergency clause for security issues. Keep a Changelog 1.1.0 format with retroactive history categorized per SemVer. DEPRECATION-POLICY.md at repo root (alongside TERMS.md and CONTENT-POLICY.md).
    Over: (1) 12-month notice period (GitHub's convention) -- rejected as too restrictive for a v1.0.0 API with a small user base. (2) No retroactive changelog (start fresh at 1.0.0) -- rejected because integrators who used pre-1.0 versions need the migration record. (3) Inline deprecation policy in CHANGELOG.md -- rejected because the policy is a stable document while the changelog grows with every release.
    Why: 6 months balances commitment with agility at WRL's scale. The emergency clause is the safety valve. Retroactive history provides traceability.
- **Prompt**: |
    You are authoring the CHANGELOG.md and DEPRECATION-POLICY.md for WRL's v1.0.0 release.

    ## Context

    WRL is a web resource archival API. It is reaching v1.0.0 -- the formal stability commitment. The API has been through versions 0.1.0 through 0.8.0 (tracked in openapi.yaml). The project already has TERMS.md and CONTENT-POLICY.md at the repo root.

    There is one existing changelog at `packages/verify/CHANGELOG.md` for the verify sub-package -- this is a separate package, not the main API changelog.

    ## What to do

    ### CHANGELOG.md

    Create `CHANGELOG.md` at the repo root following [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) format.

    **File header:**
    ```markdown
    # Changelog

    All notable changes to the WRL API are documented in this file.

    The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
    and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

    Versions before 1.0.0 were pre-release. Breaking changes were shipped as minor
    versions per [SemVer convention](https://semver.org/spec/v2.0.0.html#spec-item-4).
    ```

    **Structure:**
    - `## [Unreleased]` section at top (empty, for future changes)
    - `## [1.0.0] - 2026-03-25` section with this phase's changes
    - Retroactive sections for `0.8.0` through `0.1.0`
    - Version comparison links at the bottom

    **1.0.0 section entries:**
    - Added: WRL-API-Version response header on all responses (semver, matches openapi.yaml version)
    - Added: Deprecation mechanism with Deprecation (RFC 9745) and Sunset (RFC 8594) headers
    - Added: DEPRECATION-POLICY.md with 6-month minimum notice commitment
    - Added: CHANGELOG.md with retroactive history
    - Added: CI enforcement of version sync between openapi.yaml and package.json
    - Added: PR template with API changelog checklist
    - Changed: Version synchronized across openapi.yaml (was 0.8.0), package.json (was 0.1.0), and git tags to 1.0.0

    **Retroactive history:** Read the git log to reconstruct what changed in each version. Use `git log --oneline` and the openapi.yaml version history. The version-to-feature mapping:

    - **0.8.0**: Simplified access model (removed share tokens -- this is a REMOVED entry), FRE 902(13) certificate endpoint, notification preferences, email notifications
    - **0.7.0**: Scheduled captures, content security scanning, capture auth gate, build metadata on health endpoint
    - **0.6.0**: Webhooks, tenant quotas, custom domain support
    - **0.5.0**: Per-tenant API keys, batch capture (207 Multi-Status), KV-to-D1 migration, usage metering
    - **0.4.0**: RFC 3161 timestamp integration
    - **0.3.0**: Partial capture fallback, CORS preflight handling, HSTS preload, X-RateLimit-Limit header, spec-vs-code drift fixes
    - **0.2.0**: List captures endpoint, key versioning/archive, CORS, HSTS, rate-limit headers, staging environment, Terms of Service / Content Policy
    - **0.1.0**: Initial API -- capture endpoint, retrieval, verification, signing key, security headers, OpenAPI spec

    **Categorization rules** (Keep a Changelog categories):
    - **Added**: New endpoint, new request/response field, new header, new auth method
    - **Changed**: Modification to existing endpoint behavior, response format change
    - **Fixed**: Bug correction where implementation deviated from spec
    - **Deprecated**: Feature marked for future removal (none in history)
    - **Removed**: Previously available feature no longer accessible
    - **Security**: Changes addressing vulnerabilities or hardening

    Only document changes to the **API contract** (what integrators see). Skip internal-only changes (CI, docs-only, test-only, refactors that don't change API behavior).

    Include PR/issue references where available: `(#123)` format at end of entries, matching the convention in commit messages.

    Get the actual dates for historical versions from the git log -- find the commits that bumped openapi.yaml version and use those dates.

    **Comparison links at bottom:**
    ```markdown
    [Unreleased]: https://github.com/benpeter/web-resource-ledger/compare/v1.0.0...HEAD
    [1.0.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.8.0...v1.0.0
    [0.8.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.7.0...v0.8.0
    ```
    Note: These comparison links reference git tags that don't exist yet for pre-1.0 versions. The v1.0.0 tag will be created after merge. The links serve as documentation of the intended tag structure. For versions where no tag exists, the links will 404 -- this is acceptable for retroactive history of a pre-1.0 project.

    ### DEPRECATION-POLICY.md

    Create `DEPRECATION-POLICY.md` at repo root. Structure:

    **1. Purpose** -- WRL follows Semantic Versioning 2.0.0. This document defines what constitutes a breaking change, how deprecation is communicated, and minimum notice periods.

    **2. Versioning scheme:**
    - Version communicated via `WRL-API-Version` response header
    - Major version changes require new URL prefix (`/v2/`)
    - Minor/patch changes are backward-compatible, no URL change
    - Version in header matches `info.version` in openapi.yaml

    **3. What counts as a breaking change** (requires major version or deprecation cycle):
    - Removing an endpoint
    - Removing a response field
    - Changing a field's type
    - Changing the meaning of a status code
    - Renaming a field
    - Making an optional request parameter required

    **4. What is NOT a breaking change** (can ship in minor/patch):
    - Adding a new endpoint
    - Adding a new optional request parameter
    - Adding a new field to a response body
    - Adding a new optional header
    - Fixing a bug where behavior didn't match spec
    - Performance improvements
    - New error codes for previously unvalidated inputs

    **5. Deprecation lifecycle:**
    - Minimum 6 months from `Deprecation` header first appearing to `Sunset` date
    - All deprecated endpoints return `Deprecation` header (RFC 9745, Structured Field Date `@timestamp`) and `Sunset` header (RFC 8594, HTTP-date)
    - A `Link` header with `rel="deprecation"` points to migration guide
    - Headers appear on both success and error responses
    - CHANGELOG.md entry in the `Deprecated` section
    - openapi.yaml marks endpoint with `deprecated: true`

    **6. Emergency deprecation:**
    - If an endpoint has a security vulnerability that cannot be patched without breaking backward compatibility, minimum notice is reduced to 30 days
    - Sunset header set accordingly
    - CHANGELOG.md and migration guide published immediately

    **7. Communication channels:** Response headers (machine-readable), CHANGELOG.md, migration guides, openapi.yaml

    **8. What this policy does NOT promise:**
    - Individual notification to API key holders (may be added later)
    - Indefinite support for deprecated endpoints
    - That the 6-month period will never be shortened (reserved for security via emergency clause)

    **9. Standards note:**
    "The Deprecation header follows RFC 9745. The Sunset header follows RFC 8594."

    ## Files to create
    - `CHANGELOG.md` at repo root
    - `DEPRECATION-POLICY.md` at repo root

    ## What NOT to do
    - Do NOT modify the existing `packages/verify/CHANGELOG.md` -- that is a separate sub-package
    - Do NOT modify any source code files
    - Do NOT create migration guides (no endpoints are deprecated)
    - Do NOT promise email notifications to API key holders
    - Do NOT use automated changelog generation -- this is a manually authored document

    ## Acceptance criteria
    - CHANGELOG.md follows Keep a Changelog 1.1.0 format exactly
    - All versions 0.1.0 through 1.0.0 are documented with categorized entries
    - Entries reference PRs/issues where available
    - DEPRECATION-POLICY.md covers all sections listed above
    - RFC references are correct: RFC 9745 for Deprecation, RFC 8594 for Sunset
    - Emergency clause is included with 30-day minimum
    - Breaking vs. non-breaking definitions are clear and complete
- **Deliverables**: `CHANGELOG.md` and `DEPRECATION-POLICY.md` at repo root.
- **Success criteria**: Documents follow the specified format. RFC references are correct. Policy commitments are internally consistent.

### Task 4: Tests -- version header and deprecation mechanism
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2 (requires src/version.js and the implementation in src/index.js)
- **Approval gate**: no
- **Prompt**: |
    You are writing tests for the WRL-API-Version header and the deprecation header mechanism.

    ## Context

    WRL uses vitest with @cloudflare/vitest-pool-workers for testing. Tests run against the Worker via `SELF.fetch()`. The test config is in `vitest.config.js`.

    `BUILD_VERSION` is a compile-time define injected by the deploy pipeline. It is NOT available in the test environment. The health endpoint already handles this with a `typeof BUILD_VERSION !== 'undefined'` guard -- when undefined, the `build` object is absent from the health response, and tests assert this absence (see `test/health.test.js`).

    **Important implication for testing WRL-API-Version**: Since `BUILD_VERSION` is undefined in tests, the WRL-API-Version header will be ABSENT in test responses (the implementation uses the same typeof guard). You cannot test the header value via SELF.fetch in unit tests.

    The version is also available as `API_VERSION` from `src/version.js` -- this is a regular export (not a compile-time define) and IS available in tests.

    The existing `test/security-headers.test.js` has `expectSecurityHeaders()` helper that checks 5 security headers plus the Link/terms-of-service header across 5 representative routes. The helper is defined and used only within this file (not exported).

    The deprecation mechanism uses a declarative config in `src/deprecations.js` (exports `DEPRECATIONS` as an empty object at v1.0.0). The post-response block in `src/index.js` reads this config and injects Deprecation/Sunset/Link headers when a matching route is found. The route matching uses `ROUTE_KEYS` (a Map from regex source to human-readable route key like `'GET /v1/captures/:param'`).

    ## What to do

    ### Step 1: Rename helper and verify no regressions

    In `test/security-headers.test.js`:
    - Rename `expectSecurityHeaders()` to `expectGlobalHeaders()`
    - The helper's assertions stay the same (Referrer-Policy, X-Content-Type-Options, X-Frame-Options, HSTS, Link/terms-of-service)
    - Do NOT add WRL-API-Version to this helper -- the header is absent in the test environment because BUILD_VERSION is not defined

    ### Step 2: Add semantic version consistency test

    In `test/security-headers.test.js`, add a new describe block:

    ```javascript
    describe('WRL-API-Version -- version constant', () => {
      it('API_VERSION matches semver format', async () => {
        const { API_VERSION } = await import('../src/version.js');
        expect(API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
      });

      it('API_VERSION matches openapi.yaml info.version', async () => {
        const { API_VERSION } = await import('../src/version.js');
        const fs = await import('node:fs');
        const spec = fs.readFileSync('openapi.yaml', 'utf8');
        const match = spec.match(/^\s+version:\s*(.+)$/m);
        expect(match).not.toBeNull();
        expect(API_VERSION).toBe(match[1].trim());
      });
    });
    ```

    NOTE: The `node:fs` import may not be available in the Cloudflare Workers test pool. If it is not, use a different approach: read the version from package.json via `import pkg from '../package.json' with { type: 'json' }` (since CI enforces openapi.yaml == package.json, testing against package.json is equivalent). Verify which imports work in the test environment before committing.

    ### Step 3: Create deprecation unit tests

    Create `test/deprecation.test.js` with unit tests for the deprecation header logic. Import the DEPRECATIONS config and any helper functions directly.

    Test cases:
    1. **Empty DEPRECATIONS config produces no headers**: Given a route key that is NOT in DEPRECATIONS, no Deprecation/Sunset headers should be set. (This tests the current v1.0.0 state.)
    2. **Deprecated route produces correct headers**: Add a test-only entry to a copy of the DEPRECATIONS config. Verify the Deprecation header uses `@timestamp` format (RFC 9745 Structured Field Date) and the Sunset header uses HTTP-date format (RFC 7231).
    3. **Link header concatenation**: Given an existing Link header value, verify that deprecation link is appended with comma separation per RFC 8288, not replacing the existing value.
    4. **ROUTE_KEYS map covers all routes**: Import the routes array and ROUTE_KEYS map. Verify every route has a corresponding key in ROUTE_KEYS (no routes are unmapped).

    These should be pure function tests where possible. If the deprecation logic is embedded in the fetch handler (not extracted to a testable function), you may need to test via SELF.fetch with a test-only deprecated route.

    For integration testing with SELF.fetch: Since DEPRECATIONS is a static import, you cannot easily override it per-test. The recommended approach is:
    - Test that NON-deprecated routes do NOT have Deprecation/Sunset headers (positive test of the empty config)
    - Test the ROUTE_KEYS mapping correctness (unit test)
    - Test format correctness of the header generation logic if it is extractable as a function

    Do NOT add a DEPRECATED_ROUTES binding to vitest.config.js -- the deprecation config is a code-level module, not a runtime binding. Keep the test approach consistent with how the feature actually works.

    ### Step 4: Verify existing tests still pass

    Run `npm test` to confirm no regressions from the rename or new tests.

    ## Files to modify
    - `test/security-headers.test.js` -- rename helper, add version consistency tests

    ## Files to create
    - `test/deprecation.test.js` -- unit tests for deprecation mechanism

    ## What NOT to do
    - Do NOT hardcode `'1.0.0'` in test assertions -- use regex patterns or imported constants
    - Do NOT add WRL-API-Version to the expectGlobalHeaders helper (it is absent in test env)
    - Do NOT create snapshot tests for version headers
    - Do NOT test the CI version-sync script in vitest
    - Do NOT modify vitest.config.js bindings
    - Do NOT modify source code (src/) -- only test files

    ## Acceptance criteria
    - `expectSecurityHeaders` is renamed to `expectGlobalHeaders` throughout security-headers.test.js
    - Semantic version consistency test verifies API_VERSION matches semver and matches the spec
    - Deprecation tests verify empty config produces no headers
    - Deprecation tests verify header format correctness (RFC 9745 for Deprecation, RFC 7231 for Sunset)
    - ROUTE_KEYS coverage test ensures all routes are mapped
    - All existing tests continue to pass
    - `npm test` passes cleanly
- **Deliverables**: Updated `test/security-headers.test.js`, new `test/deprecation.test.js`.
- **Success criteria**: `npm test` passes. New tests cover version consistency, deprecation header absence on non-deprecated routes, and ROUTE_KEYS completeness.

### Task 5: CI enforcement -- version sync, changelog warning, PR template
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1 (needs package.json and openapi.yaml at 1.0.0 for the check to pass)
- **Approval gate**: no
- **Prompt**: |
    You are adding CI enforcement for version synchronization and a PR template to the WRL project.

    ## Context

    WRL uses GitHub Actions for CI. The main CI workflow is `.github/workflows/ci.yml`. It has a `test` job that runs on ubuntu-latest with a code-change gate (skips tests for docs-only PRs). The project also has `test-integration` as a separate job.

    The deploy pipelines (`.github/workflows/deploy-production.yml`, `deploy-staging.yml`) already read `package.json` version via `jq -r .version package.json` and inject it as `BUILD_VERSION`.

    There is a `scripts/` directory with existing shell scripts. No PR template exists yet.

    ## What to do

    ### Step 1: Create version-sync check script

    Create `scripts/check-version-sync.sh`:

    ```bash
    #!/usr/bin/env bash
    set -euo pipefail

    PKG_VERSION=$(jq -r .version package.json)
    API_VERSION=$(grep -m1 '^  version:' openapi.yaml | awk '{print $2}')

    if [ "$PKG_VERSION" != "$API_VERSION" ]; then
      echo "::error::Version mismatch: package.json=$PKG_VERSION, openapi.yaml=$API_VERSION"
      exit 1
    fi

    echo "Versions in sync: $PKG_VERSION"
    ```

    Make it executable (`chmod +x`). Run shellcheck on it.

    ### Step 2: Add version-sync step to ci.yml

    Add a step to the `test` job BEFORE the code-change gate. This check must run unconditionally on every PR, even docs-only changes, because version files are metadata that must always be consistent.

    Place it immediately after the checkout step (after `actions/checkout`) and before the "Check for code changes" step:

    ```yaml
    - name: Check version sync
      run: ./scripts/check-version-sync.sh
    ```

    This runs before the code-change gate so it is NOT gated on `steps.changes.outputs.code == 'true'`.

    ### Step 3: Add changelog-update warning to ci.yml

    Add a step to the `test` job that warns when API-affecting files change without a CHANGELOG.md update. This is a WARNING, not a failure. Place it after the version-sync step and before the code-change gate:

    ```yaml
    - name: Check changelog updated
      if: github.event_name == 'pull_request'
      run: |
        BASE_REF="${{ github.event.pull_request.base.sha }}"
        CHANGED=$(git diff --name-only "$BASE_REF"...HEAD)
        if echo "$CHANGED" | grep -qE '^(src/|openapi\.yaml)'; then
          if ! echo "$CHANGED" | grep -q '^CHANGELOG.md'; then
            echo "::warning::API-affecting files changed but CHANGELOG.md was not updated. If this PR changes API behavior, please update the changelog."
          fi
        fi
    ```

    ### Step 4: Create PR template

    Create `.github/pull_request_template.md`:

    ```markdown
    ## Changes

    <!-- Brief description of what this PR does -->

    ## Checklist

    - [ ] Tests pass (`npm test`)
    - [ ] API spec updated if endpoints changed (`openapi.yaml`)
    - [ ] CHANGELOG.md updated if API behavior changed
    - [ ] Version bumped in package.json and openapi.yaml if releasing
    ```

    Keep it minimal. A long template gets ignored.

    ### Step 5: Verify CI locally

    Run the version-sync script locally to verify it passes with both package.json and openapi.yaml at 1.0.0.

    ## Files to create
    - `scripts/check-version-sync.sh` -- version sync check (executable)
    - `.github/pull_request_template.md` -- PR template

    ## Files to modify
    - `.github/workflows/ci.yml` -- add version-sync step and changelog warning step

    ## What NOT to do
    - Do NOT create a separate CI job for the version check (it runs in <1 second)
    - Do NOT make the changelog check a hard failure (warning only)
    - Do NOT add pre-commit hooks
    - Do NOT modify deploy pipelines
    - Do NOT add tag-version enforcement (tags are created manually after merge)
    - Do NOT gate the version-sync check on the code-change condition

    ## Acceptance criteria
    - `scripts/check-version-sync.sh` passes shellcheck and correctly detects version mismatches
    - Version-sync step runs unconditionally in CI (before the code-change gate)
    - Changelog warning fires only on PRs, only when src/ or openapi.yaml changes without CHANGELOG.md changes
    - Changelog check uses `::warning::` (not `::error::`) -- it is non-blocking
    - PR template exists with the 4-item checklist
    - Running `./scripts/check-version-sync.sh` locally succeeds when versions match
- **Deliverables**: `scripts/check-version-sync.sh`, `.github/pull_request_template.md`, updated `.github/workflows/ci.yml`.
- **Success criteria**: Version-sync script passes locally. CI workflow has both new steps in correct position. PR template renders correctly on GitHub.

### Cross-Cutting Coverage

- **Testing**: Task 4 (test-minion) covers all test additions. Phase 6 (post-execution test execution) will run the full suite.
- **Security**: The version header exposes no sensitive information (same version visible in public openapi.yaml). Deprecation headers are static config. Phase 3.5 architecture review by security-minion is sufficient -- no dedicated execution task needed.
- **Usability -- Strategy**: ux-strategy-minion participates in Phase 3.5 review. The version header and deprecation policy are API-consumer-facing; they affect integrator journey coherence. No dedicated execution task needed -- the policy document and changelog structure are reviewed at the approval gate.
- **Usability -- Design**: Not applicable. No user-facing UI changes in this plan.
- **Documentation**: Task 3 produces CHANGELOG.md and DEPRECATION-POLICY.md. Phase 8 (post-execution docs) will assess whether additional documentation updates are needed (e.g., README references to the new documents).
- **Observability**: Not applicable. No runtime services, APIs, or background processes are created. The version header is a static response header, not an observability concern.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - api-spec-minion: The openapi.yaml changes touch 63+ response definitions. api-spec-minion should review that all references are correct and the spec remains internally consistent.
    Review focus: Verify WRLAPIVersion reference count matches total headers blocks. Confirm RFC references in header descriptions are correct. Check that no Deprecation/Sunset references were accidentally added.
- **Not selected**:
  - ux-design-minion: No UI components or visual interfaces produced.
  - accessibility-minion: No web-facing HTML/UI produced.
  - sitespeed-minion: No web-facing runtime code changes that affect loading performance.
  - observability-minion: No runtime components requiring coordinated logging/metrics/tracing.
  - user-docs-minion: The CHANGELOG.md and DEPRECATION-POLICY.md are the user-facing docs, authored directly in Task 3 and reviewed at the approval gate. A separate Phase 3.5 review is not needed; Phase 8 will assess if further docs are needed.

### Decisions

- **Single source of truth for version**
  Chosen: `openapi.yaml info.version` is the intentional declaration; `package.json version` must match (CI-enforced). The deploy pipeline reads package.json for BUILD_VERSION (existing plumbing unchanged).
  Over: Making openapi.yaml the deploy source (api-spec-minion leaned this way) -- rejected because the deploy pipeline already uses `jq -r .version package.json` and changing that requires modifying both deploy workflows for no gain.
  Why: Keeps existing infrastructure untouched. CI enforces the coupling. The "which is primary" distinction matters only for the release workflow (bump openapi.yaml first, then package.json to match), not for runtime behavior.

- **Deprecation config: code-level module vs. runtime binding**
  Chosen: Static code-level module (`src/deprecations.js`) imported by the Worker.
  Over: Runtime binding via wrangler.toml `[vars]` (test-minion suggested `DEPRECATED_ROUTES` binding for testability).
  Why: Deprecation is a code decision, not an operational decision. It should go through code review and CI, not be changeable via environment variables. The static module is simpler to audit, test, and trace through version control.

- **WRL-API-Version header absent in tests vs. fallback value**
  Chosen: Header is absent when BUILD_VERSION is undefined (same pattern as health endpoint).
  Over: Fallback value like `'dev'` when undefined (iac-minion suggested this for local dev).
  Why: A fallback value would make the header always-present but with a misleading value. Better to be absent -- tests that need the version constant import it from `src/version.js` directly. The existing health endpoint test already handles the "build metadata absent in tests" pattern.

- **CORS OPTIONS and WRL-API-Version**
  Chosen: OPTIONS responses DO receive the WRL-API-Version header (they flow through the post-response block). The spec does NOT document OPTIONS responses (consistent with existing spec structure).
  Over: Adding explicit OPTIONS response definitions to the spec, or preventing the header on OPTIONS via conditional logic.
  Why: Both CORS OPTIONS handlers (lines 411-420 and 427-440) create responses early but fall through to the post-response block at lines 614-619. The version header on OPTIONS is harmless and correct. Adding spec definitions for OPTIONS would be a separate concern.

- **RFC 9745 vs. RFC 8594 for Deprecation header**
  Chosen: Use RFC 9745 (March 2025) for the Deprecation header with Structured Field Date format (`@timestamp`). Use RFC 8594 for the Sunset header with HTTP-date format.
  Over: Using RFC 8594 for both (as the original task description stated) -- corrected because RFC 8594 defines only Sunset, not Deprecation.
  Why: api-spec-minion identified the error in the task description. RFC 9745 is the published standard for the Deprecation header. The two headers intentionally use different date formats.

### Risks and Mitigations

1. **63+ insertion points in openapi.yaml**: Missing a WRL-API-Version reference would mean the spec under-declares headers on some responses. **Mitigation**: Task 1 prompt instructs the agent to count references and verify against total headers blocks. Phase 3.5 api-spec-minion review will verify.

2. **Retroactive changelog accuracy**: Categorizing 8 versions of pre-1.0 changes involves judgment calls. **Mitigation**: The changelog is a living document. The approval gate on Task 3 allows the user to review and correct categorizations before merge.

3. **Deprecation policy is a one-way door**: The 6-month notice commitment becomes binding at v1.0.0. **Mitigation**: The emergency clause (30 days for security) provides an escape valve. 6 months is reasonable for WRL's current scale and can only be extended, not shortened, in the future.

4. **BUILD_VERSION undefined in tests**: Tests cannot verify the WRL-API-Version header value via SELF.fetch. **Mitigation**: The semantic consistency test imports `API_VERSION` from `src/version.js` and verifies it matches openapi.yaml. CI version-sync verifies package.json matches openapi.yaml. The deploy pipeline reads package.json for BUILD_VERSION. The chain is: API_VERSION == openapi.yaml version == package.json version == BUILD_VERSION == WRL-API-Version header.

5. **Route matching for deprecation headers**: The ROUTE_KEYS map must stay in sync with the routes array. **Mitigation**: Task 4 includes a test that verifies every route has a corresponding ROUTE_KEYS entry. Any route addition that skips ROUTE_KEYS will cause a test failure.

6. **Spec size growth**: ~126 lines added to a 4665-line spec. **Mitigation**: Manageable for now. A future multi-file split is noted as a backlog item by api-spec-minion.

### Execution Order

```
Batch 1 (parallel):
  Task 1: openapi.yaml + package.json (api-spec-minion)    [APPROVAL GATE]
  Task 2: Worker implementation (api-design-minion)
  Task 3: CHANGELOG.md + DEPRECATION-POLICY.md (api-design-minion)  [APPROVAL GATE]

--- Gate: Task 1 approval (spec changes) ---
--- Gate: Task 3 approval (policy + changelog) ---

Batch 2 (parallel, after Task 2 completes):
  Task 4: Tests (test-minion)  -- blocked by Task 2

Batch 3 (after Tasks 1, 4):
  Task 5: CI enforcement (iac-minion)  -- blocked by Task 1 (needs versions at 1.0.0)

--- Post-execution: git tag v1.0.0 (manual, after PR merge) ---
```

### External Skills

No external skills detected in project.

### Verification Steps

1. `npm test` passes (all existing + new tests)
2. `npm run lint:api` passes (Redocly validates the spec)
3. `./scripts/check-version-sync.sh` passes locally
4. `openapi.yaml info.version` == `package.json version` == `1.0.0`
5. `src/version.js` exports `API_VERSION = '1.0.0'`
6. grep count of `WRLAPIVersion` in openapi.yaml matches total `headers:` block count
7. CHANGELOG.md covers versions 0.1.0 through 1.0.0
8. DEPRECATION-POLICY.md references RFC 9745 and RFC 8594 correctly
9. CI workflow has version-sync step before code-change gate
10. After PR merge and tag creation: `curl -sI https://api.webresourceledger.com/health | grep WRL-API-Version` returns the version header (production verification)

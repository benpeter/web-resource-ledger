## Domain Plan Contribution: api-design-minion

### Recommendations

#### 1. WRL-API-Version header: Use the semver string, not a date

**Recommendation:** Return `WRL-API-Version: 1.0.0` (the semver string from openapi.yaml).

**Rationale:** WRL already uses URL-path versioning (`/v1/...`) for major version selection and has a single active API version. The version header serves a different purpose from URL versioning -- it communicates the *exact release* of the API surface the response came from. A semver string does this more precisely than a date because:

- Semver encodes intent: patch (bugfix), minor (additive), major (breaking). A date string tells you *when* but not *what kind* of change happened.
- The openapi.yaml already uses semver. The git tags will use semver. The package.json uses semver. A date-based header would be a fourth versioning scheme with no anchor to the others.
- Date-based versions (the Stripe pattern) make sense when you ship many breaking changes frequently and want clients to pin to a specific API "snapshot." WRL has one version and plans to keep backward compatibility. Semver is the right tool here.
- SDK clients and integrators can compare the header value against the openapi.yaml version they developed against to detect drift.

**Value source:** The header value MUST come from `BUILD_VERSION`, which the deploy pipeline already injects from package.json at build time. This is not a hardcoded string -- it is a compile-time constant set during `wrangler deploy`. The existing mechanism at deploy-production.yml line 72-73 already does this.

**Implementation location:** Add `response.headers.set('WRL-API-Version', BUILD_VERSION)` inside the post-response header block at src/index.js lines 614-619, guarded by `typeof BUILD_VERSION !== 'undefined'` (same pattern as the health endpoint at line 648). This is the *only* place where global response headers are injected, and it already handles security headers, rate-limit headers, and the Link/terms-of-service header. Adding it here guarantees every response gets the header -- no route-by-route wiring needed.

**typeof guard is required.** In the test environment, `BUILD_VERSION` is not defined (the health test at test/health.test.js line 15 already asserts `body.build` is undefined for exactly this reason). Without the guard, tests that check response headers would get a `ReferenceError`. When the guard evaluates to false (test environment), the header is simply absent -- tests for the header's *value* should be skipped or use a known compile-time define in the test config.

**Header on error responses too.** The post-response block runs after all routes, including 404 catch-all and 405 responses. The version header will appear on every response including errors. This is correct -- clients should know which API version produced the error.

#### 2. Version coupling: openapi.yaml, package.json, and git tags MUST be identical

**Recommendation:** All three MUST carry the same semver string. No divergence.

**Current state:** openapi.yaml says `0.8.0`, package.json says `0.1.0`. These have drifted because package.json was never intentionally maintained as the API version. This task resolves the drift by bumping both to `1.0.0`.

**Going forward, the single source of truth is openapi.yaml.** The release flow is:

1. Developer bumps `info.version` in openapi.yaml (this is the deliberate act of declaring a new API version).
2. package.json `version` is updated to match (it feeds `BUILD_VERSION` via the deploy pipeline).
3. An annotated git tag `v1.0.0` is created.
4. CI verifies all three match on every PR and before every deploy.

**Why not let package.json diverge as a "build number"?** Because BUILD_VERSION is already injected into production responses (health endpoint, and now the WRL-API-Version header). If package.json says `1.0.1-build.47` while openapi.yaml says `1.0.1`, the response header would not match the documented API version. Integrators comparing the header to the spec would see a mismatch. The simplicity of "one version, everywhere" outweighs the hypothetical value of an independent build identifier. If a build identifier is ever needed, use BUILD_COMMIT (the git SHA, already injected).

**Tag format:** `v1.0.0` (with `v` prefix). This is the dominant convention for semver git tags. The existing tag `verify/v0.1.0` is a sub-package tag -- main API tags use the bare `v` prefix.

#### 3. Deprecation and Sunset headers: Declarative config object read by the post-response block

**Recommendation:** Declare deprecation metadata in a static config map, not in individual route handlers. The post-response header block in src/index.js reads this config and injects `Deprecation` and `Sunset` headers when a matching route is deprecated.

**Why declarative config, not per-handler:**

- Route handlers in WRL are pure functions (e.g., `handleCreateCapture`, `handleVerifyCapture`). They return Response objects. If each handler was responsible for adding deprecation headers, every handler would need modification when deprecated, and there would be no central view of what is deprecated.
- The post-response block (lines 614-619) already handles cross-cutting header concerns. It is the natural place for deprecation headers.
- A declarative config makes deprecation state visible in a single place, auditable, and testable without invoking route handlers.
- The openapi.yaml spec can be generated or validated against this config -- they describe the same information.

**Config structure:**

```javascript
// src/deprecations.js
export const DEPRECATIONS = {
  // Example -- no endpoints are deprecated today. This ships empty.
  // When an endpoint is deprecated, add an entry:
  //
  // 'GET /v1/captures/{id}/status': {
  //   deprecated: 1735689599,    // Unix timestamp: @1735689599 (2024-12-31T23:59:59Z)
  //   sunset: 'Tue, 01 Jul 2025 00:00:00 GMT',  // HTTP-date (RFC 7231)
  //   link: 'https://docs.webresourceledger.com/migration/status-endpoint',
  // },
};
```

**Header format per the specs:**

- `Deprecation`: Uses structured field date format per the IETF Deprecation header draft: `Deprecation: @1735689599` (Unix timestamp). This is the current draft-ietf-httpapi-deprecation-header format.
- `Sunset`: Uses HTTP-date format per RFC 8594: `Sunset: Tue, 01 Jul 2025 00:00:00 GMT`.
- `Link`: Points to migration documentation with `rel="deprecation"`: `Link: <https://docs.webresourceledger.com/migration/status-endpoint>; rel="deprecation"`.

**Important:** The Deprecation header is still an IETF draft (draft-ietf-httpapi-deprecation-header), not a finalized RFC. However, it is widely adopted (used by LinkedIn, SAP, and others) and stable enough for use. The deprecation policy document should note this.

**Matching logic in the post-response block:**

```javascript
// Pseudocode for the post-response block
const routeKey = `${request.method} ${matchedPattern}`;
const dep = DEPRECATIONS[routeKey];
if (dep) {
  response.headers.set('Deprecation', `@${dep.deprecated}`);
  response.headers.set('Sunset', dep.sunset);
  // Append to existing Link header (don't overwrite the terms-of-service link)
  const existingLink = response.headers.get('Link') || '';
  response.headers.set('Link', `${existingLink}, <${dep.link}>; rel="deprecation"`);
}
```

**Key implementation detail:** The Link header already contains a `rel="terms-of-service"` link (line 619). When an endpoint is deprecated, the deprecation link must be *appended* to the existing Link header value, not replace it. Multiple link-values in a single Link header are comma-separated per RFC 8288.

**Route matching consideration:** The current route system uses regex patterns and a sequential scan (lines 573-581). The matched pattern is available as the route tuple `[method, pattern, handler]`, but the pattern is a RegExp object, not a string path. The config key needs to be matchable against the request. Two options:

- Option A: Use the pathname string directly as key (e.g., key is a function that tests `method + pathname`). Simple but may not match parameterized paths.
- Option B: Store the regex source or a path template string alongside the deprecation metadata. The post-response block needs to know which route matched.

**Recommended approach:** Thread the matched route pattern (or a route name) through to the post-response block. The simplest way: when a route matches at line 576-579, set a variable `matchedRoute` with the method and pattern, then use that in the post-response block. The DEPRECATIONS config keys should use human-readable path templates (`GET /v1/captures/:id/status`) and the lookup should map from regex to template. This keeps the config readable while allowing exact matching. Since the routes array is static and small (~30 entries), a build-time map from regex to template key is feasible.

#### 4. Deprecation policy: What to commit to

**Recommendation:** Publish `DEPRECATION-POLICY.md` at repo root (alongside TERMS.md and CONTENT-POLICY.md). The policy should commit to:

**Minimum notice period: 6 months.**
- From the date a `Deprecation` header first appears on an endpoint to the `Sunset` date, at least 6 months must pass.
- This is a floor, not a target. Longer notice is encouraged for widely-used endpoints.
- 6 months is appropriate for WRL's scale (small user base, API-key authenticated integrators, no free-tier mass adoption yet). Stripe uses 2+ years; GitHub uses 12 months. 6 months is reasonable for a v1.0.0 commitment with the option to extend later.

**Header behavior commitments:**
- All deprecated endpoints return `Deprecation` and `Sunset` headers on every response.
- The `Deprecation` header contains the date the endpoint was deprecated (structured field date format).
- The `Sunset` header contains the date the endpoint will stop responding (HTTP-date per RFC 8594).
- The `Sunset` date is always at least 6 months after the `Deprecation` date.
- A `Link` header with `rel="deprecation"` points to the migration guide for the specific endpoint.
- These headers appear on both success and error responses from the deprecated endpoint.

**What counts as a breaking change (requiring a new major version or deprecation cycle):**
- Removing an endpoint.
- Removing a response field.
- Changing a field's type (string to number, etc.).
- Changing the meaning of a status code on an endpoint.
- Renaming a field.
- Making an optional request parameter required.

**What is NOT a breaking change (can ship in minor/patch):**
- Adding a new endpoint.
- Adding a new optional request parameter.
- Adding a new field to a response body.
- Adding a new optional header.
- Fixing a bug where the behavior did not match the spec.
- Performance improvements.
- New error codes for previously unvalidated inputs.

**Communication channels:**
- `Deprecation` and `Sunset` response headers (machine-readable, always-on).
- CHANGELOG.md entry in the `Deprecated` section.
- Migration guide linked from the `Link` header.
- openapi.yaml marks the endpoint with `deprecated: true`.

**The policy should NOT promise:**
- Individual notification to API key holders (WRL does not have email addresses for all integrators today; this can be added later when the email notification system is in place for tenants).
- Indefinite support for deprecated endpoints.
- That the 6-month period will never be shortened (reserve the right to sunset earlier for security vulnerabilities, with a separate "emergency deprecation" clause allowing as little as 30 days for security-critical removals).

**Emergency deprecation clause:**
- If an endpoint has a security vulnerability that cannot be patched without breaking backward compatibility, the minimum notice period is reduced to 30 days.
- The `Sunset` header is set accordingly.
- The CHANGELOG.md and migration guide are published immediately.

**Versioning semantics to document:**
- WRL follows Semantic Versioning 2.0.0.
- The version is communicated via the `WRL-API-Version` response header.
- Major version changes (breaking) require a new URL prefix (`/v2/`).
- Minor and patch changes are backward-compatible and do not change the URL prefix.
- The version in the `WRL-API-Version` header matches the `info.version` in openapi.yaml.

### Proposed Tasks

#### Task 1: Create the deprecations module (`src/deprecations.js`)

**What to do:** Create a new module exporting an empty `DEPRECATIONS` config map with the documented schema for future entries. Include JSDoc or inline comments explaining the config format, date formats (structured field for Deprecation, HTTP-date for Sunset), and an example entry (commented out).

**Deliverables:** `src/deprecations.js` with exported `DEPRECATIONS` constant.

**Dependencies:** None. This can be done first.

#### Task 2: Add WRL-API-Version header to the post-response block

**What to do:** In `src/index.js`, inside the post-response header block (after line 617), add:
```javascript
if (typeof BUILD_VERSION !== 'undefined') {
  response.headers.set('WRL-API-Version', BUILD_VERSION);
}
```

**Deliverables:** Modified `src/index.js`.

**Dependencies:** None (BUILD_VERSION injection already exists in deploy pipeline).

#### Task 3: Add deprecation header injection to the post-response block

**What to do:** Import `DEPRECATIONS` from `src/deprecations.js`. In the post-response block, after the version header, look up the matched route in the config. If found, set `Deprecation`, `Sunset`, and append a `rel="deprecation"` link to the existing `Link` header. Thread the matched route information through to the post-response block (currently only `pathname` is available; the matched route tuple index or a route key is needed).

**Deliverables:** Modified `src/index.js` with deprecation header logic. The DEPRECATIONS map ships empty -- no endpoints are deprecated today. The mechanism is testable via a test-only deprecation entry.

**Dependencies:** Task 1 (deprecations module).

#### Task 4: Synchronize version numbers

**What to do:** Bump openapi.yaml `info.version` from `0.8.0` to `1.0.0`. Bump package.json `version` from `0.1.0` to `1.0.0`.

**Deliverables:** Modified openapi.yaml and package.json.

**Dependencies:** None, but should be coordinated with the git tag (Task 6) and changelog (api-spec-minion scope).

#### Task 5: Write DEPRECATION-POLICY.md

**What to do:** Create `DEPRECATION-POLICY.md` at repo root following the commitments outlined in Recommendation 4 above. Structure: purpose, versioning scheme, what counts as breaking, deprecation lifecycle (announce, headers, sunset), minimum notice periods (6 months standard, 30 days security), communication channels, emergency deprecation clause.

**Deliverables:** `DEPRECATION-POLICY.md` at repo root.

**Dependencies:** Task 2 (must reference the WRL-API-Version header), Task 3 (must reference the Deprecation/Sunset header mechanism).

#### Task 6: Add deprecation policy Link header

**What to do:** Add a second `Link` value to the existing global Link header at line 619 pointing to the deprecation policy: `<https://github.com/benpeter/web-resource-ledger/blob/main/DEPRECATION-POLICY.md>; rel="deprecation-policy"`. This uses the same pattern as the existing `rel="terms-of-service"` link.

**Deliverables:** Modified `src/index.js` line 619.

**Dependencies:** Task 5 (the document must exist before linking to it).

**Note:** This is a nice-to-have. The `deprecation-policy` link relation is not standardized. If the team prefers minimal headers, this can be omitted -- the policy is discoverable from the repo root and the deprecation policy document itself. I would lean toward including it since the terms-of-service link already establishes the pattern, and it costs nothing.

#### Task 7: Add WRL-API-Version to openapi.yaml header components

**What to do:** Add `WRL-API-Version` as a component header in openapi.yaml and reference it from all response definitions (same pattern as existing security headers). This is api-spec-minion's scope to implement, but the design decision is: it is a global header, it appears on every response, and its schema is `type: string, pattern: '^\d+\.\d+\.\d+$', example: '1.0.0'`.

**Deliverables:** Handoff to api-spec-minion with the header schema and placement guidance.

**Dependencies:** Task 2 (implementation) and api-spec-minion for spec authoring.

### Risks and Concerns

1. **BUILD_VERSION undefined in test environment.** The `typeof BUILD_VERSION !== 'undefined'` guard means the WRL-API-Version header will be absent in unit tests that do not define it. Tests for the header must either (a) use vitest `define` config to inject a known value, or (b) test the header's presence only in integration/smoke tests where the deploy pipeline provides it. test-minion should address this in their test strategy. The existing health test already handles this pattern by asserting `build` is undefined.

2. **Route matching for deprecation headers.** The current post-response block only has access to `pathname` and `request.method`, not the matched route tuple. Threading the matched route info to the deprecation lookup requires a small refactor: either store `matchedRoute` in a variable before the post-response block, or use a pathname-based lookup in DEPRECATIONS (less clean but simpler). This is a minor implementation concern, not a design risk.

3. **Link header concatenation.** The Link header already has one value (terms-of-service). Adding deprecation links requires proper comma-separated concatenation per RFC 8288. If additional Link values are added in the future (e.g., `rel="service-doc"`), the concatenation logic should be centralized rather than ad-hoc `set('Link', ...)` calls. Consider a small helper that builds the Link header from an array of link objects.

4. **The Deprecation header is still a draft.** The IETF draft (draft-ietf-httpapi-deprecation-header) has not been finalized as an RFC. However, it is stable, widely implemented, and unlikely to change in ways that affect WRL's usage. The deprecation policy should note this: "The Deprecation header follows draft-ietf-httpapi-deprecation-header. If the draft changes before finalization, WRL will adopt the final standard."

5. **Deprecation policy is a one-way door.** Once published with v1.0.0, the 6-month minimum notice period is a binding commitment. Reducing it later would itself be a breaking change of trust. 6 months is a reasonable floor -- long enough to be meaningful, short enough to not block necessary evolution. The emergency clause (30 days for security) provides the escape valve.

6. **Changelog retroactive categorization.** Categorizing all changes from initial release through 0.8.0 involves judgment calls about what was "breaking" during a pre-1.0 period. The standard convention (SemVer spec section 4) is that anything goes before 1.0.0 -- there are no backward-compatibility guarantees. The changelog should note this: "Versions before 1.0.0 were pre-release. Breaking changes were shipped as minor versions per SemVer convention." This is api-spec-minion's scope but the framing matters for the deprecation policy.

### Additional Agents Needed

None. The four-agent team (api-design-minion, api-spec-minion, iac-minion, test-minion) covers all aspects:

- api-design-minion (this contribution): versioning semantics, header design, deprecation mechanism, policy content.
- api-spec-minion: openapi.yaml spec changes, changelog format, version reconciliation.
- iac-minion: CI enforcement, tag workflow, PR template.
- test-minion: test strategy for version header and deprecation headers.

No security-minion consultation is needed during planning. The version header exposes no sensitive information (it is the same version visible in the public openapi.yaml). The deprecation headers are static configuration. A Phase 3.5 security review is sufficient.

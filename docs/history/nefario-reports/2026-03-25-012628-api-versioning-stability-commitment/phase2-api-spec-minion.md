## Domain Plan Contribution: api-spec-minion

### Recommendations

#### 1. openapi.yaml changes beyond the version bump

**Version field**: Bump `info.version` from `0.8.0` to `1.0.0`. This is the canonical declaration that the API surface is stable.

**Additional spec changes required:**

**(a) Add WRL-API-Version header component**

Add a new entry to `components/headers`:

```yaml
WRLAPIVersion:
  description: >
    Semantic version of the WRL API that produced this response. Matches the
    info.version field in the OpenAPI specification. Present on every response.
  schema:
    type: string
    pattern: '^\d+\.\d+\.\d+$'
    example: '1.0.0'
```

This follows the exact pattern established by the existing 9 header components (ReferrerPolicy, XContentTypeOptions, XFrameOptions, StrictTransportSecurity, RetryAfter, XRateLimitLimit, TermsLink, XQuotaLimit, XQuotaUsed, XQuotaRemaining). The naming convention uses PascalCase without hyphens, matching the existing style.

**(b) Add Deprecation and Sunset header components for future use**

```yaml
Deprecation:
  description: >
    Indicates the resource has been deprecated per RFC 9745. Value is a
    Structured Field Date (@timestamp) representing the date the resource
    was marked deprecated. Absent on non-deprecated resources.
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

Important note on the Deprecation header format: The original task description references "RFC 8594" for the Deprecation header, but the Deprecation header is actually defined by RFC 9745 (published March 2025). RFC 8594 defines only the Sunset header. The plan should reference both RFCs correctly: RFC 9745 for `Deprecation`, RFC 8594 for `Sunset`.

The Deprecation header value per RFC 9745 is a Structured Field Date using the `@unix-timestamp` format (Section 3.3.7 of RFC 9651), not the HTTP-date format used by Sunset. This is a critical distinction -- the two headers use different date formats.

**(c) Reference WRL-API-Version from all response definitions**

The spec has two patterns for response headers:

1. **Shared response components** (`components/responses/Problem400`, `Problem401`, `Problem403`, `Problem404`, `Problem429`, `Problem503`) -- 6 shared responses, each with an explicit headers block referencing the 5 security headers. These are referenced ~54 times across path operations.

2. **Inline response definitions** -- every success response (200, 201, 202, 204, 207) and some error responses (500) are defined inline within each path operation, each with their own headers block.

I count 63 `headers:` blocks across the file (shared + inline). The `WRL-API-Version` header must be added to every one of them. This is approximately 63 insertions of:

```yaml
WRL-API-Version:
  $ref: '#/components/headers/WRLAPIVersion'
```

**Do NOT add Deprecation and Sunset to all responses.** These headers should only appear on responses from deprecated endpoints. Since no endpoints are deprecated at v1.0.0, these headers should be defined in `components/headers` only (for future reference) but not referenced from any response definition yet. When an endpoint is deprecated, its specific response definitions get the Deprecation and Sunset header references added. This keeps the spec honest -- it declares exactly what each endpoint returns today, not what it might return in a hypothetical future.

**(d) Update health endpoint build.version example**

The health endpoint's build metadata includes `version: '0.1.0'` in the example. This should be updated to `'1.0.0'` to match the new version.

**(e) Consider adding x-]stability annotation (optional)**

OpenAPI 3.1 supports extensions. Adding `x-stability: stable` to the `info` object or to individual operations signals to tooling and consumers that the API has reached stability. This is optional and non-standard -- it's informational only.

#### 2. Header placement strategy: components/headers is correct

The existing pattern of defining headers in `components/headers` and referencing them via `$ref` from every response is the right approach. This is how the spec already handles all 5 security headers plus the 3 rate-limit/quota headers.

**Why not use a different mechanism:**

- OpenAPI 3.1 does not have a "global response headers" feature. There is no way to declare "this header appears on every response" at the top level. The `$ref` pattern in each response definition is the canonical approach.
- Some spec authors use `x-global-headers` extensions, but these are ignored by all standard tooling (Prism, SDK generators, Redocly, Swagger UI). They add noise without value.
- The repetition is a spec authoring cost, not a runtime or tooling cost. Every response definition explicitly documents its headers, which is what integrators and SDK generators need.

**Future consideration -- split spec into multi-file structure:** With 63+ header blocks each referencing 6+ headers, the single-file spec is approaching a size (4665 lines) where a multi-file structure would improve maintainability. This is out of scope for the v1.0.0 task but should be noted in the backlog. A `paths/`, `schemas/`, `responses/` directory structure with `$ref` to external files would let shared response definitions be authored once and referenced by path. Redocly bundle (already configured via `npm run lint:api`) handles merging.

#### 3. CHANGELOG.md structure and format

**Format**: Follow [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) exactly. The spec is clear and well-adopted.

**File header:**

```markdown
# Changelog

All notable changes to the WRL API are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
```

**Version headers**: Use `## [VERSION] - YYYY-MM-DD` format with links to GitHub comparison at the bottom of the file:

```markdown
## [1.0.0] - 2026-03-XX

...

## [0.8.0] - 2026-03-XX

...

[1.0.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.8.0...v1.0.0
[0.8.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.7.0...v0.8.0
```

**Unreleased section**: Include `## [Unreleased]` at the top. This is where future changes accumulate before the next release. The PR template should instruct contributors to add entries here.

**Issue/PR references**: Yes, include them. The existing packages/verify/CHANGELOG.md does not reference issues, but for the main API changelog, references are valuable because:
- They provide traceability from changelog entry to implementation
- They help integrators find migration details
- The git history has PR numbers in most commit messages already

Format: inline parenthetical at the end of the entry, e.g.:
```markdown
- Batch capture endpoint with 207 Multi-Status responses (#119)
```

This matches the convention used in commit messages throughout the repo.

#### 4. Retroactive changelog categorization

Based on the git history and openapi.yaml version progression, here is the categorization rubric and the retroactive entries. Each version corresponds to a set of features that changed the API surface.

**Categorization rubric (what counts as what):**

| Category | Definition for WRL | Examples |
|----------|-------------------|----------|
| **Added** | New endpoint, new request/response field, new header, new authentication method, new query parameter | New route in openapi.yaml, new schema property, new components/headers entry |
| **Changed** | Modification to existing endpoint behavior, response format change, parameter semantics change | Changed status codes, modified response schema, re-ordered fields |
| **Fixed** | Bug correction where the implementation deviated from documented behavior | Spec-vs-code drift fixes, incorrect error codes, missing headers |
| **Deprecated** | Feature marked for future removal with Deprecation/Sunset headers | (None in history -- first use will be with the deprecation mechanism) |
| **Removed** | Previously available feature no longer accessible | Removed share tokens, removed endpoints |
| **Security** | Changes addressing vulnerabilities or hardening | SSRF prevention, auth enforcement, header hardening |

**Key principle**: The changelog documents changes to the **API contract** (what integrators see), not internal implementation details. Database migrations, CI changes, test additions, documentation-only changes, and internal refactors do not get changelog entries unless they change the observable API behavior.

**Retroactive entries by version:**

The version history from the openapi.yaml and git log maps as follows:

- **0.1.0**: Initial API -- capture endpoint, retrieval, verification, signing key, security headers, OpenAPI spec
- **0.2.0**: List captures endpoint, key versioning/archive, CORS, HSTS, rate-limit headers, staging, ToS/content policy
- **0.3.0**: Partial capture fallback, CORS preflight, HSTS preload, X-RateLimit-Limit, spec-vs-code drift fixes
- **0.4.0**: RFC 3161 timestamp integration
- **0.5.0**: Per-tenant API keys, batch capture, KV-to-D1 migration, usage metering
- **0.6.0**: Webhooks, tenant quotas, custom domain
- **0.7.0**: Scheduled captures, content security scanning, capture auth gate, build metadata on health
- **0.8.0**: Simplified access model (removed share tokens), FRE 902(13) certificate endpoint, notification preferences, email notifications

**1.0.0** will be: version header, deprecation mechanism, stability commitment. The content of 1.0.0 depends on what this phase actually produces.

I recommend the implementation agent draft the full retroactive changelog using the git log, since I can provide the categorization rubric and version boundaries but the exact entries require reading each PR's changes in detail. The rubric above and the version-to-commit mapping I've provided give the structure.

#### 5. Version divergence reconciliation (package.json vs. openapi.yaml)

Currently: `package.json` is at `0.1.0`, `openapi.yaml` is at `0.8.0`.

**Recommendation**: Synchronize both to `1.0.0` at the same time this task ships. Going forward, they must be identical and match the latest annotated git tag.

The divergence exists because `package.json` was never bumped after the initial scaffold, while `openapi.yaml` was bumped with each feature addition. This is a historical artifact, not an intentional design choice. Since v1.0.0 establishes the versioning discipline, it is the natural reconciliation point.

The health endpoint's `build.version` field already reads from `package.json` via the CI `--define` injection. Once `package.json` is bumped to `1.0.0`, the health endpoint will correctly report the version. The `WRL-API-Version` response header should read from the same source of truth (the `API_VERSION` constant that test-minion recommends in `src/version.js`).

**Single source of truth chain**: `openapi.yaml info.version` = `package.json version` = `src/version.js API_VERSION` = git tag = `WRL-API-Version` header value = health endpoint `build.version`. CI enforces the first three are equal; the header and health endpoint read from `src/version.js` at runtime.

#### 6. Redocly configuration update

The current `redocly.yaml` just extends `recommended`. No changes are needed for v1.0.0 specifically, but the `lint:api` npm script (which runs `redocly lint openapi.yaml`) will validate the spec after all changes. Redocly's recommended ruleset already checks for valid `$ref` resolution, required `description` fields, and structural correctness.

If custom rules are desired later (e.g., "every response must include WRL-API-Version header"), that would be a Spectral ruleset addition, not a Redocly change. Out of scope for this task.

### Proposed Tasks

#### Task 1: Add WRL-API-Version, Deprecation, and Sunset header components to openapi.yaml
- **What**: Add three new entries to `components/headers`: `WRLAPIVersion`, `Deprecation`, `Sunset`. Follow the existing naming convention (PascalCase, no hyphens). Include description, schema, pattern, and example for each. Use RFC 9745 format for Deprecation (`@timestamp`), RFC 8594 / RFC 7231 format for Sunset (HTTP-date).
- **Deliverables**: Updated `components/headers` section in openapi.yaml with 3 new header definitions.
- **Dependencies**: None. This is additive and does not depend on design decisions.

#### Task 2: Reference WRL-API-Version from all response definitions
- **What**: Add `WRL-API-Version: $ref: '#/components/headers/WRLAPIVersion'` to every `headers:` block in the spec -- both the 6 shared response components (`Problem400`, `Problem401`, `Problem403`, `Problem404`, `Problem429`, `Problem503`) and every inline response definition across all path operations. This is ~63 insertion points. Do NOT add Deprecation/Sunset references (those come later, per-endpoint, when deprecation occurs).
- **Deliverables**: Every response definition in the spec includes the WRL-API-Version header reference.
- **Dependencies**: Task 1 (header component must exist before referencing it).

#### Task 3: Bump info.version to 1.0.0 and update examples
- **What**: Change `info.version: 0.8.0` to `info.version: 1.0.0`. Update the health endpoint's `build.version` example from `'0.1.0'` to `'1.0.0'`. Also update `package.json` version from `0.1.0` to `1.0.0`.
- **Deliverables**: `openapi.yaml` info.version is `1.0.0`, health endpoint example shows `1.0.0`, `package.json` version is `1.0.0`.
- **Dependencies**: Should be done last among spec changes (Tasks 1-2 first) so the version bump is the final commit, making the git history clean.

#### Task 4: Author CHANGELOG.md at repo root
- **What**: Create `CHANGELOG.md` following Keep a Changelog 1.1.0 format. Include:
  - File header with format and semver references
  - `## [Unreleased]` section (empty, for future use)
  - `## [1.0.0] - YYYY-MM-DD` section with this phase's changes
  - Retroactive sections for `0.8.0` through `0.1.0` categorized per the rubric above
  - Version comparison links at the bottom pointing to GitHub compare URLs
  - Issue/PR references on entries where available from git history
- **Deliverables**: `CHANGELOG.md` at repo root.
- **Dependencies**: The version-to-commit mapping and categorization rubric provided in Recommendation 4 above. The implementing agent will need to read the git log to fill in the specific entries per version. The dates for historical versions should be taken from the merge commit dates of the PRs that bumped the openapi.yaml version.

#### Task 5: Validate spec after all changes
- **What**: Run `npm run lint:api` (Redocly lint) to verify the updated spec is structurally valid. Also manually verify that all `$ref` paths resolve correctly and that the new header components are syntactically correct. If a Prism mock server is available, run `prism mock openapi.yaml` to verify examples still produce valid responses.
- **Deliverables**: Clean Redocly lint output. No broken `$ref` references.
- **Dependencies**: Tasks 1-3 complete.

### Risks and Concerns

1. **63+ insertion points for WRL-API-Version**: Adding a header reference to every response definition is a large, repetitive change. The primary risk is missing one or more response definitions, leading to a spec that claims certain responses include the header but others do not. The implementation should:
   - Use a grep/search approach to find all `headers:` blocks rather than manually visiting each path.
   - After insertion, count the total `WRLAPIVersion` references and verify it matches the number of `headers:` blocks.
   - Run Redocly lint to catch any YAML syntax errors introduced during mass editing.

2. **RFC version confusion**: The task description mentions "Deprecation and Sunset headers per RFC 8594." This conflates two separate RFCs. RFC 8594 defines the Sunset header only. The Deprecation header is defined by RFC 9745 (formerly draft-ietf-httpapi-deprecation-header). The Deprecation header uses Structured Field Date format (`@1234567890`), while Sunset uses HTTP-date format (`Sat, 31 Dec 2025 23:59:59 GMT`). Using the wrong format in either header would be a standards violation. All documentation, code comments, and spec descriptions must reference the correct RFC.

3. **Retroactive changelog accuracy**: Categorizing 8 versions of historical changes retroactively risks errors -- marking something as "Added" when it was really a "Changed", or omitting a change entirely. Mitigation: the changelog is a living document and can be corrected. The initial retroactive entries should focus on API-surface changes (new endpoints, changed response formats, removed features) and explicitly skip internal changes (CI, docs, refactors).

4. **Spec size growth**: The spec is already 4665 lines. Adding ~63 header references adds approximately 126 lines (2 lines per insertion: the header name and the `$ref`). This is manageable but reinforces the case for a future multi-file split. The spec should remain a single file for now since all existing tooling (Redocly lint, the docs site, the openapi reference page) expects a single file.

5. **CORS preflight (OPTIONS) response**: The OPTIONS handler at `/v1/captures` returns a 204 with custom CORS headers but no security headers or TermsLink reference. It also does not flow through the post-response header block in `src/index.js` (it returns before reaching that code -- needs verification). The spec should either:
   - Add WRL-API-Version to the 204 preflight response definition (if the implementation will set it), or
   - Explicitly omit it and document that OPTIONS responses do not carry the version header.
   This should be coordinated with test-minion's concern about the same gap (noted in their Risks item 3).

6. **No oasdiff baseline**: Since there are no annotated git tags for the main API (only `verify/v0.1.0` for the sub-package), there is no clean baseline for breaking change detection. The v1.0.0 tag will serve as the first baseline. After this task, oasdiff can be configured in CI to compare PR changes against the v1.0.0 spec. This is not a blocker but should be captured as a follow-up task.

### Additional Agents Needed

None. The four-agent team covers all domains. The spec changes, changelog format, and header component design are fully within api-spec-minion's domain. The categorization rubric for the retroactive changelog provides sufficient guidance for the implementing agent without needing a documentation specialist during planning.

One coordination note: the api-design-minion's output on the deprecation mechanism (declarative config vs. per-route) does not affect the spec tasks, since no endpoints are deprecated at v1.0.0. The Deprecation and Sunset header components are defined in `components/headers` regardless of the runtime mechanism. When deprecation is first used, the spec changes are per-endpoint (adding `$ref` to specific response definitions) and will follow the same pattern established here for WRL-API-Version.

# Meta-Plan: API Versioning and Stability Commitment (v1.0.0) -- Revised

## Meta-Plan

### Planning Consultations

#### Consultation 1: API Contract and Versioning Design
- **Agent**: api-design-minion
- **Planning question**: How should the `WRL-API-Version` response header work? Should it return the semver string (`1.0.0`) or a date-based version? How should the Deprecation and Sunset headers (RFC 8594) be implemented for future deprecated endpoints -- should deprecation metadata be declared in a config object that middleware reads, or baked into individual route handlers? What's the right coupling between openapi.yaml version, package.json version, and git tags -- must they be identical, or can package.json diverge as an internal build identifier? Finally, what should the deprecation policy document commit to: minimum notice period, header behavior, communication channels, migration support?
- **Context to provide**: Current API surface (openapi.yaml at 0.8.0, ~30 routes in src/index.js across 9 endpoint groups), the central response helpers in src/responses.js (jsonResponse/problemResponse), the post-response header injection block at lines 614-619 of src/index.js where security headers (Referrer-Policy, X-Content-Type-Options, X-Frame-Options, HSTS, Link) are set on all responses. The deploy pipeline already injects BUILD_VERSION from package.json (deploy-production.yml line 59). The health endpoint conditionally exposes build.version when BUILD_COMMIT is defined (src/index.js line 651). No existing deprecation mechanism. Existing policy docs at repo root: TERMS.md, CONTENT-POLICY.md.
- **Why this agent**: This is fundamentally an API design decision. The header semantics, versioning strategy, deprecation mechanism, and deprecation policy content are all API contract concerns. api-design-minion owns API versioning and deprecation policy per the delegation table. The deprecation policy is a single-page document whose content is determined by the API versioning design decisions -- it does not warrant a separate documentation specialist for planning.

#### Consultation 2: OpenAPI Spec and Changelog Format
- **Agent**: api-spec-minion
- **Planning question**: What changes are needed in openapi.yaml to properly declare v1.0.0 -- beyond bumping the info.version field? The spec already has a components/headers section with ReferrerPolicy, XContentTypeOptions, XFrameOptions, StrictTransportSecurity, and TermsLink, all referenced from every response. Should the new headers (WRL-API-Version, and the future Deprecation/Sunset) be added as global header components and referenced from all responses, or declared differently? What's the right structure for CHANGELOG.md following Keep a Changelog format, and how should historical changes (from 0.1.0 through 0.8.0) be retroactively categorized? Should entries reference issues/PRs? How should the changelog scope be determined -- api-design-minion will define the versioning semantics, but the changelog content itself needs a rubric for what counts as Added/Changed/Fixed/Deprecated/Removed/Security.
- **Context to provide**: Current openapi.yaml (version 0.8.0, full spec with components/headers section already defining 5 global header types referenced from all response definitions), the existing packages/verify/CHANGELOG.md as a format reference, the git log showing the full feature history since initial release. No CHANGELOG.md at repo root currently. package.json version is 0.1.0 (diverges from openapi.yaml's 0.8.0).
- **Why this agent**: api-spec-minion owns OpenAPI spec authoring, validation, and contract-first workflows. The spec must be authoritative about what v1.0.0 includes, and the changelog format needs to follow established conventions (Keep a Changelog). The version divergence between package.json (0.1.0) and openapi.yaml (0.8.0) needs a reconciliation recommendation from the spec perspective.

#### Consultation 3: CI Pipeline for Version Enforcement
- **Agent**: iac-minion
- **Planning question**: How should CI enforce that openapi.yaml version matches the latest git tag? The current CI (ci.yml) runs `npm test` and `redocly lint openapi.yaml` in the test job, with a code-change gate that skips tests for docs-only changes. What's the minimal addition -- a shell script step in the existing test job, a dedicated job, or a reusable action? Should the version check be a pre-commit hook, a CI step, or both? How should annotated git tags be created -- manually via `git tag -a`, via GitHub Release UI, or automated on merge to main? The deploy pipeline (deploy-production.yml) already reads package.json version via `jq -r .version` and injects it as BUILD_VERSION. How should the tag, openapi.yaml version, and package.json version stay synchronized? What's the right PR template checklist item to enforce CHANGELOG.md updates -- and should CI also lint for it?
- **Context to provide**: Current CI workflow (ci.yml with test + test-integration jobs, the code-change gate that skips for docs-only changes), deploy-production.yml (already injects BUILD_VERSION from package.json, validates semver format at line 61), deploy-staging.yml (same pattern). The only existing tag is `verify/v0.1.0` (a sub-package tag, not the main API). No PR template exists. No pre-commit hooks exist. The test-minion will need to know where the CI version check runs so it can design test coverage for it.
- **Context boundary**: iac-minion designs the CI enforcement mechanism and tag workflow. api-design-minion decides the version-coupling semantics (what must match what). iac-minion implements that coupling as a CI check.
- **Why this agent**: iac-minion owns CI/CD pipelines and GitHub Actions. The version-tag enforcement, PR template, and tag creation workflow are infrastructure concerns. The existing deploy pipeline's BUILD_VERSION injection creates a coupling point that needs careful handling.

#### Consultation 4: Test Strategy for Version Infrastructure
- **Agent**: test-minion
- **Planning question**: What's the right test strategy for verifying the WRL-API-Version header appears on all responses? The existing security-headers.test.js (test/security-headers.test.js) already tests that Referrer-Policy, X-Content-Type-Options, X-Frame-Options, HSTS, and Link headers are present across 5 representative routes (health 200, captures 401, captures/{id} 404, .well-known 200, catch-all 404) using a shared `expectSecurityHeaders()` helper. Should the WRL-API-Version assertion be added to that existing helper and test file, or does it warrant a separate test file? How should the deprecation header mechanism be tested -- unit tests on the config/middleware, integration tests on specific routes, or both? For the CI version-match check (whatever form iac-minion recommends), should there be a test that validates the check script itself, or is CI-level validation sufficient? Is there a risk of test brittleness if tests hardcode the version string?
- **Context to provide**: Existing test/security-headers.test.js with its `expectSecurityHeaders()` helper pattern, the 5 representative routes it tests, the Cloudflare Workers test harness (using `SELF` from `cloudflare:test` and vitest), the existing test/health.test.js (tests build metadata is undefined in test context -- line 15: `expect(body.build).toBeUndefined()`). 57 test files exist across unit and integration. The test infrastructure uses @cloudflare/vitest-pool-workers for in-worker testing.
- **Context boundary**: test-minion designs the test strategy. The actual response header implementation is done by the executing agent, not test-minion. test-minion should recommend what to test and where, so the execution plan includes testable acceptance criteria.
- **Why this agent**: test-minion owns test strategy and automation. The WRL-API-Version header needs coverage across all response paths, and the deprecation mechanism needs a testing approach defined before implementation. The existing security-headers.test.js pattern is a natural extension point, but test-minion should evaluate whether that's the right approach.

### Cross-Cutting Checklist

- **Testing** (test-minion): Included as Consultation 4. The WRL-API-Version header, deprecation header mechanism, and CI version check all need test strategies defined during planning.
- **Security** (security-minion): Exclude from planning. No new auth surfaces, no user input handling, no new dependencies. The version header is a static string. The deprecation headers are static per-route configuration. Security review in Phase 3.5 is sufficient to catch any header-related information disclosure concerns.
- **Usability -- Strategy** (ux-strategy-minion): Exclude from planning. Removed by user from the revised team. This task produces no user-facing interfaces -- it is API infrastructure consumed by developers reading HTTP headers and documentation. UX strategy review will still occur in Phase 3.5 as a mandatory reviewer.
- **Usability -- Design** (ux-design-minion / accessibility-minion): Exclude from planning. No UI changes. This is API-level infrastructure with no user-facing interfaces.
- **Documentation** (software-docs-minion / user-docs-minion): Exclude from planning. Removed by user from the revised team. The deprecation policy is a single-page document whose content follows directly from api-design-minion's versioning design decisions. The CHANGELOG.md format is owned by api-spec-minion. Documentation review will still occur in Phase 3.5 (ux-strategy-minion) and Phase 8 (documentation assessment).
- **Observability** (observability-minion / sitespeed-minion): Exclude from planning. No new runtime services or performance-critical paths. The version header is a static string addition with no monitoring implications.

### Notable Exclusions

- **software-docs-minion**: Explicitly removed from team by user. The deprecation policy document is a single-page commitment doc whose content is determined by api-design-minion's RFC 8594 decisions -- it does not require a documentation specialist during planning.
- **ux-strategy-minion**: Explicitly removed from team by user. No UX design decisions in scope. Will still participate as a mandatory Phase 3.5 reviewer.
- **devx-minion**: Adjacent (developer onboarding, SDK design) but this task does not create new developer tooling or change the onboarding flow. The changelog and deprecation policy serve integrators, but devx-minion's expertise is in CLI/SDK design rather than API contract documentation.

### Anticipated Approval Gates

1. **API Versioning Design** (api-design-minion output): The WRL-API-Version header semantics, deprecation header mechanism, version-coupling decision (openapi.yaml vs. package.json vs. git tags), and deprecation policy commitments are hard to reverse once shipped. Multiple valid approaches exist (semver string vs. date, declarative deprecation config vs. per-route, identical versions vs. independent versioning). This gates all implementation work. **MUST gate.**

2. **CHANGELOG.md content** (api-spec-minion output): Retroactive categorization of all changes from initial release through 0.8.0 into a Keep a Changelog format is a judgment call about what's "breaking" vs. "added." Once published with v1.0.0, this becomes the historical record. However, it is a document that can be revised. **OPTIONAL gate** -- present for review since it is the first published changelog and establishes the categorization precedent.

### Rationale

This task spans four distinct domains that the revised team covers comprehensively:

- **api-design-minion** determines the contract semantics (header format, deprecation mechanism, version coupling, deprecation policy content) that all other work implements. This is the keystone consultation -- every other agent's work depends on these design decisions.
- **api-spec-minion** ensures the OpenAPI spec correctly declares v1.0.0, adds the new header components, and produces a changelog following Keep a Changelog conventions. Also reconciles the version divergence between package.json (0.1.0) and openapi.yaml (0.8.0).
- **iac-minion** designs the CI enforcement that keeps versions synchronized long-term, creates the PR template with changelog checklist, and determines the tag creation workflow.
- **test-minion** ensures the version header, deprecation headers, and CI version check are verified by the test suite, extending the existing security-headers.test.js pattern.

The removed agents (ux-strategy-minion, software-docs-minion, user-docs-minion) are not needed for planning because: the task produces no user-facing interfaces, the deprecation policy content follows from API design decisions, and the changelog format is a spec concern. All three domains are still covered by mandatory Phase 3.5 review and Phase 8 documentation assessment.

### Scope

**In scope**: Bump openapi.yaml to 1.0.0. Synchronize package.json version. Create CHANGELOG.md at repo root with retroactive history. Write deprecation policy document. Add `WRL-API-Version` response header to all API responses. Add CI check that openapi.yaml version matches latest git tag. Create annotated v1.0.0 git tag. Create PR template with changelog checklist item. Implement Deprecation/Sunset header mechanism for future use (no endpoints are deprecated today).

**Out of scope**: API version negotiation/routing (v2), automated changelog generation tools, SDK versioning, client library generation, actual deprecation of any endpoint.

### External Skill Integration

No external skills detected in project.

# Meta-Plan: API Versioning and Stability Commitment (v1.0.0)

## Meta-Plan

### Planning Consultations

#### Consultation 1: API Contract and Versioning Design
- **Agent**: api-design-minion
- **Planning question**: How should the `WRL-API-Version` response header work in practice? Should it return the semver string (`1.0.0`) or a date-based version? How should the Deprecation and Sunset headers (RFC 8594) be implemented for future deprecated endpoints -- should they be baked into route handlers, middleware, or a declarative config? What's the right coupling between openapi.yaml version, package.json version, and git tags -- should they all be identical or can they diverge?
- **Context to provide**: Current API surface (openapi.yaml at 0.8.0, ~30 routes in src/index.js), the central response helpers in src/responses.js (jsonResponse/problemResponse), the post-response header injection block at the end of the fetch handler (lines 606-620 where Referrer-Policy, X-Content-Type-Options, etc. are set), the deploy pipeline that already injects BUILD_VERSION from package.json. No existing deprecation mechanism.
- **Why this agent**: This is fundamentally an API design decision -- the header semantics, versioning strategy, and deprecation mechanism need to be designed before implementation. api-design-minion owns API versioning and deprecation policy.

#### Consultation 2: OpenAPI Spec and Changelog Format
- **Agent**: api-spec-minion
- **Planning question**: What changes are needed in openapi.yaml to properly declare v1.0.0 -- beyond bumping the version field? Should the spec document the new response headers (WRL-API-Version, Deprecation, Sunset) as global components? What's the right structure for CHANGELOG.md following Keep a Changelog format, and how should historical changes (from 0.1.0 through 0.8.0) be retroactively categorized? Should the changelog reference issues/PRs?
- **Context to provide**: Current openapi.yaml (version 0.8.0, full spec with components/headers section already defining ReferrerPolicy and XContentTypeOptions), the existing packages/verify/CHANGELOG.md as a reference for format, the git log showing the full feature history. No CHANGELOG.md at repo root currently.
- **Why this agent**: api-spec-minion owns OpenAPI spec authoring, validation, and contract-first workflows. The spec needs to be authoritative about what v1.0.0 includes.

#### Consultation 3: CI Pipeline for Version Enforcement
- **Agent**: iac-minion
- **Planning question**: How should CI enforce that openapi.yaml version matches the latest git tag? The current CI (`ci.yml`) runs `npm test` and `redocly lint openapi.yaml`. What's the minimal addition -- a shell script step, a dedicated job, or a reusable action? How should annotated git tags be created -- manually, via GitHub Release UI, or automated on merge to main? What's the interaction with the existing deploy pipeline (deploy-production.yml already reads package.json version via `jq -r .version`)?
- **Context to provide**: Current CI workflow (ci.yml with test + test-integration jobs), deploy-production.yml (already injects BUILD_VERSION from package.json), the existing tag `verify/v0.1.0` (only tag in the repo). No PR template exists.
- **Why this agent**: iac-minion owns CI/CD pipelines and GitHub Actions. The version-tag enforcement, PR template, and tag creation workflow are infrastructure concerns.

#### Consultation 4: Deprecation Policy Document
- **Agent**: software-docs-minion
- **Planning question**: What should the deprecation policy document contain beyond the 6-month minimum notice period? Should it live as DEPRECATION.md at repo root, as a section in an existing doc, or as a docs site page? What commitments should it make about header behavior (Deprecation/Sunset), communication channels, and migration support? How does it relate to the changelog and semantic versioning commitment?
- **Context to provide**: Existing policy docs at repo root (TERMS.md, CONTENT-POLICY.md), the docs site at docs.webresourceledger.com (11ty static site), the engineering philosophy (YAGNI, KISS). The deprecation policy is a commitment to external integrators.
- **Why this agent**: software-docs-minion owns architecture documentation and API docs. The deprecation policy is a published contract that needs careful drafting.

### Cross-Cutting Checklist

- **Testing** (test-minion): Include for planning. The WRL-API-Version header needs test coverage across all response paths (success, error, CORS preflight). The CI version-match check needs its own test/validation. Planning question: What's the right test strategy for verifying the WRL-API-Version header appears on all responses -- a single integration test, unit tests on the response helpers, or both? How should the version-tag CI check be tested?
- **Security** (security-minion): Exclude from planning. No new auth surfaces, no user input handling, no new dependencies. The version header is a static string. Security review in Phase 3.5 is sufficient.
- **Usability -- Strategy** (ux-strategy-minion): ALWAYS include. Planning question: From an integrator's perspective, what signals stability most effectively? Is the API version header sufficient for version negotiation awareness, or should the health endpoint also expose the API version? How should deprecated endpoints communicate the migration path to developers -- just headers, or also response body hints?
- **Usability -- Design** (ux-design-minion / accessibility-minion): Exclude from planning. No UI changes -- this is API-level infrastructure. No user-facing interfaces produced.
- **Documentation** (software-docs-minion): Included as Consultation 4. Additionally, **user-docs-minion**: Include for planning. Planning question: How should the changelog, versioning commitment, and deprecation policy be surfaced to API consumers? Should the docs site get a "Versioning" guide page? Should the changelog be linked from API responses or the docs site?
- **Observability** (observability-minion / sitespeed-minion): Exclude from planning. No new runtime services or performance-critical paths. The version header is a static string addition. No monitoring implications.

### Notable Exclusions

- **devx-minion**: Adjacent (developer onboarding, SDK design) but this task doesn't create new developer tooling or change the onboarding flow. The changelog and deprecation policy serve integrators, but devx-minion's expertise is in CLI/SDK design rather than API contract documentation.
- **frontend-minion**: No UI changes. The WRL-API-Version header is API infrastructure, not a frontend concern.
- **observability-minion**: The version header is a static string injected in the response pipeline. No logging, metrics, or tracing implications.

### Anticipated Approval Gates

1. **API Versioning Design** (api-design-minion output): The WRL-API-Version header semantics, deprecation header mechanism, and version-coupling decision (openapi.yaml vs. package.json vs. git tags) are hard to reverse once shipped. Multiple valid approaches exist (semver string vs. date, declarative deprecation config vs. per-route). This gates all implementation work. **MUST gate.**

2. **CHANGELOG.md content** (api-spec-minion output): Retroactive categorization of all changes from initial release through 0.8.0 into a Keep a Changelog format is a judgment call about what's "breaking" vs. "added." Once published with v1.0.0, this becomes the historical record. However, it's a document that can be revised. **OPTIONAL gate** -- present for review since it's the first published changelog and establishes the categorization precedent.

### Rationale

This task spans four distinct domains: API design (versioning semantics and deprecation mechanism), API spec (OpenAPI 1.0.0 declaration and changelog format), infrastructure (CI enforcement and git tagging), and documentation (deprecation policy). Each specialist contributes expertise that would materially improve the plan:

- **api-design-minion** determines the contract semantics that all other work implements
- **api-spec-minion** ensures the OpenAPI spec and changelog follow best practices
- **iac-minion** designs the CI enforcement that keeps versions in sync long-term
- **software-docs-minion** drafts the deprecation policy that external integrators rely on
- **test-minion** ensures the version header is actually verified in the test suite
- **ux-strategy-minion** ensures the versioning approach serves real integrator needs
- **user-docs-minion** ensures the versioning story is discoverable by API consumers

### Scope

**In scope**: Bump openapi.yaml to 1.0.0. Synchronize package.json version. Create CHANGELOG.md at repo root with retroactive history. Write deprecation policy document. Add `WRL-API-Version` response header to all API responses. Add CI check that openapi.yaml version matches latest git tag. Create annotated v1.0.0 git tag. Create PR template with changelog checklist item. Implement Deprecation/Sunset header mechanism for future use (no endpoints are deprecated today).

**Out of scope**: API version negotiation/routing (v2), automated changelog generation tools, SDK versioning, client library generation, actual deprecation of any endpoint.

### External Skill Integration

No external skills detected in project.

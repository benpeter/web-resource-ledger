## Meta-Plan

**Task**: Audit documentation for drift against recent code changes

**Context**: Web Resource Ledger (WRL) has completed Act 1 ("Solid Foundation") --
10 issues/PRs merged across 8 development phases (0013 through 0020). The
documentation (README, CONTRIBUTING, PRODUCT.md, MVP.md, OpenAPI spec, SECURITY.md)
was largely written before Act 1 and has been partially updated along the way,
but no systematic audit has been performed. Several specific drift signals are
already visible from the initial codebase scan (see Preliminary Findings below).

### Preliminary Findings (from codebase scan)

These are drift signals I identified during initial context gathering. They are
provided to planning consultants as starting points, not an exhaustive list.

1. **README Key Rotation section is stale**: States "old captures will show
   'Verification Failed' until key versioning is implemented" and "Key versioning
   and old-key verification are not yet implemented" -- but PR #54 shipped key
   versioning (Phase 0017). The `/.well-known/signing-key` response now includes
   `keyId` field (not documented). The new `/.well-known/signing-keys` endpoint
   (plural, key archive) exists in code but is not mentioned anywhere in docs.

2. **README Public Key Endpoint section**: Describes response shape as
   `{ algorithm, publicKey }` but code returns `{ algorithm, publicKey, keyId }`.

3. **PRODUCT.md (product vision doc) is frozen**: Still lists "resource manifest
   (CSS/JS/images)" as part of capture definition, "Bundle format TBD", and
   includes features long since decided against (scheduled captures, webhooks,
   multi-tenancy). This is a vision doc, but it should either be clearly marked
   as historical or updated to reflect reality.

4. **MVP.md has stale items**: API surface table shows only 4 endpoints (no list,
   no artifacts, no signing-keys). Technology stack says "Puppeteer API" but the
   project migrated to Playwright (Phase 0014). Says "warcio.js" but the project
   uses a custom WACZ implementation with fflate. Says "Deployment: wrangler deploy
   (manual)" but CI/CD exists. Several "What's Out" items are now in. The "Capture
   ID loss" note says "Resolved: R1 added GET /v1/captures" which is correct but
   the surrounding text still reads as if there's no list endpoint.

5. **OpenAPI spec completeness**: Spec includes `/.well-known/signing-keys`
   (plural) and all 9 routes. This appears current. Need specialist validation
   against actual response shapes (e.g., does the list captures response schema
   include `failedAt`, `error`, `retryable` fields for failed captures?).

6. **CONTRIBUTING.md**: References "wrangler dev" and "npm run dev" but does not
   mention the staging environment (Phase 0018) or smoke tests (`npm run smoke`).

7. **README Setup section**: Does not mention `IP_HASH_SEED` secret (added in
   Phase 0020 for hashed IP logging) or `CORALOGIX_SEND_KEY` (added in Phase
   0015). These are operational secrets a deployer would need.

8. **Staging environment undocumented**: `wrangler.toml` has `[env.staging]`,
   `deploy-staging.yml` workflow exists, `smoke-test.sh` exists -- none of this
   is mentioned in README or CONTRIBUTING.

9. **CORS configuration undocumented**: `CORS_ORIGINS` env var exists in
   wrangler.toml with a comment but is not in README Setup.

10. **Legal section**: README links to TERMS.md and CONTENT-POLICY.md (correct).
    The `Link` header with ToS URL is set on all responses (code). Health endpoint
    returns legal URLs in response body. None of this is documented for API consumers.

### Planning Consultations

#### Consultation 1: API specification accuracy audit
- **Agent**: api-spec-minion
- **Planning question**: Given the 9 routes currently implemented in `src/index.js` and the response shapes visible in the route handlers, what specific discrepancies exist between `openapi.yaml` and the actual code behavior? Pay particular attention to: (a) response schemas for the list captures endpoint (does the spec include `failedAt`, `error`, `retryable` fields for failed captures?), (b) the `/.well-known/signing-key` response shape now including `keyId`, (c) CORS headers on POST responses, (d) the `Link` header on all responses, (e) the `X-RateLimit-Limit` header, (f) `Cache-Control` header values per endpoint. Produce a line-by-line discrepancy list referencing spec line numbers and code locations.
- **Context to provide**: `openapi.yaml`, `src/index.js`, `src/rate-limits.js`, `src/signing.js`, `src/kv.js` (for list captures response shape)
- **Why this agent**: API spec validation is their core competency. They can systematically compare spec vs. implementation in a way that catches subtle schema mismatches (nullable fields, enum values, header definitions).

#### Consultation 2: User-facing documentation gap analysis
- **Agent**: user-docs-minion
- **Planning question**: Walk through the README as a new deployer and as an API consumer. For each section (Usage, Setup, Development, Reference), identify statements that are factually wrong, features that are missing, and instructions that would fail if followed. Cross-reference against the merged PRs listed in Preliminary Findings. Specifically evaluate: (a) whether the Setup section has all secrets a deployer needs, (b) whether the Usage examples show all available endpoints, (c) whether the Key Rotation section reflects key versioning, (d) whether a contributor following CONTRIBUTING.md would know about staging, smoke tests, and the deploy workflow.
- **Context to provide**: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `wrangler.toml`, `package.json`, list of merged PRs (51-57) with titles
- **Why this agent**: User-docs-minion evaluates documentation from the reader's perspective -- what a deployer or API consumer would actually experience trying to follow these docs. They catch gaps that are invisible to someone who already knows the system.

#### Consultation 3: Architecture documentation assessment
- **Agent**: software-docs-minion
- **Planning question**: Assess whether the project's technical documentation (MVP.md, PRODUCT.md, openapi.yaml) accurately represents the current architecture and API surface. MVP.md and PRODUCT.md were written before implementation -- how should they be updated (or archived) now that the system is built and Act 1 is complete? Should MVP.md become a historical artifact (moved to evolution log or marked clearly as "implemented, see backlog.md for current state")? Should PRODUCT.md be updated to reflect the implemented product? What is the right documentation structure going forward given that `docs/backlog.md` now serves as the living roadmap?
- **Context to provide**: `PRODUCT.md`, `MVP.md`, `docs/backlog.md`, `docs/evolution/README.md`, list of all 9 implemented routes
- **Why this agent**: Software-docs-minion understands documentation architecture -- which docs should be living vs. archived, how to prevent the "three sources of truth" anti-pattern, and how to structure docs for a project transitioning from MVP to post-MVP.

### Cross-Cutting Checklist

- **Testing** (test-minion): EXCLUDE from planning. This is a documentation audit -- no executable code is being produced. Tests for the OpenAPI spec (`npm run lint:api`) already exist and will validate spec changes, but that is an execution concern, not a planning one.
- **Security** (security-minion): EXCLUDE from planning. The audit may surface documentation gaps about security features (SSRF prevention docs, CORS docs), but the security features themselves are already implemented and tested. No new attack surface is created by updating docs. security-minion should review the execution plan in Phase 3.5 to ensure we do not accidentally document internal security details that should remain undocumented.
- **Usability -- Strategy** (ux-strategy-minion): INCLUDE (see Consultation 4 below).
- **Usability -- Design** (ux-design-minion, accessibility-minion): EXCLUDE from planning. No UI is being created or modified. README is Markdown rendered by GitHub -- no custom design decisions.
- **Documentation** (software-docs-minion, user-docs-minion): INCLUDE (see Consultations 2 and 3 above). These are the primary domain agents for this task.
- **Observability** (observability-minion, sitespeed-minion): EXCLUDE from planning. No runtime components are being created or modified.

#### Consultation 4: Documentation journey coherence
- **Agent**: ux-strategy-minion
- **Planning question**: Evaluate the documentation from a user journey perspective. A new user arrives at the README -- can they understand what WRL does, try it, set it up, and contribute? Map the information architecture: README -> CONTRIBUTING -> docs/backlog -> docs/evolution. Are there dead ends, circular references, or missing signposts? Is there cognitive overload from stale content (MVP.md, PRODUCT.md) that contradicts the current state? What is the minimum documentation set a single-operator deployment needs vs. what exists today?
- **Context to provide**: `README.md`, `CONTRIBUTING.md`, `PRODUCT.md`, `MVP.md`, `docs/backlog.md`, `TERMS.md`, `CONTENT-POLICY.md`, `SECURITY.md`
- **Why this agent**: ux-strategy-minion evaluates the holistic experience of navigating the docs. They identify where a reader would get confused, lost, or misled -- not individual factual errors (user-docs-minion's job) but structural problems in how information flows.

### Anticipated Approval Gates

1. **Documentation triage and scope decision** (MUST gate, high blast radius): Before execution, the user should approve which documents get updated vs. archived vs. left alone. The key decision is what to do with PRODUCT.md and MVP.md -- update them, archive them to evolution log, or mark them as historical. This decision affects every downstream documentation task. This is hard to reverse because it sets the project's documentation architecture going forward.

2. **OpenAPI spec changes** (OPTIONAL gate): The spec is a contract. Changes to response schemas in `openapi.yaml` could affect any consumers. However, this project is pre-1.0 with no known external consumers, so the blast radius is low. Gate only if the changes are significant (e.g., breaking schema changes, not just adding missing fields).

### Rationale

This task is fundamentally a documentation audit, so the primary specialists are
documentation agents (user-docs-minion, software-docs-minion) and the API spec
specialist (api-spec-minion). The ux-strategy-minion provides the journey
coherence lens that prevents us from fixing individual docs while the overall
information architecture remains broken.

I deliberately excluded code-focused agents (frontend-minion, debugger-minion,
test-minion) because this task produces no code -- only documentation updates.
Security-minion is excluded from planning but will participate in Phase 3.5
review to ensure we do not over-document security internals.

The api-spec-minion is included because the OpenAPI spec is both documentation
and a machine-readable contract, requiring specialized validation that goes
beyond what user-docs-minion would catch.

### Scope

**In scope:**
- README.md -- all sections (Usage, Setup, Development, Reference, Roadmap, Legal)
- CONTRIBUTING.md -- contributor instructions
- PRODUCT.md -- product vision document
- MVP.md -- MVP specification
- openapi.yaml -- API specification accuracy
- SECURITY.md -- security policy
- docs/backlog.md -- only to verify cross-references from other docs are correct
- docs/evolution/README.md -- only to verify the index is complete

**Out of scope:**
- Evolution log phase directories (historical records, not living docs)
- docs/history/ (nefario reports, advisory reports -- historical)
- TERMS.md, CONTENT-POLICY.md (legal documents, recently written in Phase 0018, unlikely to have drifted)
- Code changes (this is a docs audit, not a code audit)
- Creating new documentation that does not exist yet (if gaps are found that need new docs, file issues rather than creating them in this phase)

### External Skill Integration

No external skills detected in project. Neither `.claude/skills/` nor `.skills/`
directories exist in the working directory or the parent repository root.

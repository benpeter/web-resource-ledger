## Meta-Plan

### Planning Consultations

#### Consultation 1: Security model simplification review
- **Agent**: security-minion
- **Planning question**: The current access model requires tenant auth on all capture GET endpoints (GET /v1/captures/{id}, /status, /artifacts/*), with share tokens as a workaround for delegated access. The proposal is to make individual capture access public, relying on 128-bit capture IDs (cap_ + 32 hex) as capability tokens. The list endpoint (GET /v1/captures) would remain tenant-authed to prevent enumeration. WACZ artifacts are already public for independent verification. What are the security implications of this model? Specifically: (a) Is 128-bit entropy sufficient as a capability token for this use case (web archive access, not financial data)? (b) What residual risks exist if capture IDs leak (e.g., Referrer headers, logs)? (c) Are there any edge cases where removing auth from individual capture endpoints creates unexpected attack surface? (d) The share_tokens table and endpoint would be fully removed -- any implications for the D1 migration strategy (the table has FK constraints to captures and tenants)?
- **Context to provide**: `src/auth.js` (auth mechanism), `src/index.js` lines 455-511 (the auth gate being simplified), `SECURITY.md` (current access model documentation), `migrations/0010_share_tokens.sql` (table schema with FK constraints), the proposed endpoint auth matrix from the task
- **Why this agent**: This is fundamentally a security architecture change. The share token system was built as a security mechanism; removing it and weakening the auth boundary requires adversarial review to validate the "capability token" model is sound.

#### Consultation 2: API contract and spec changes
- **Agent**: api-spec-minion
- **Planning question**: The OpenAPI spec (openapi.yaml) currently documents share token authentication (shareToken security scheme), the POST /v1/captures/{captureId}/share endpoint, and ?token= query parameters on capture GET endpoints. How should the spec be updated to reflect the simplified model where individual capture access is public? Specifically: (a) Should the shareToken security scheme be removed entirely or replaced with a note about ID-as-capability? (b) How should the GET capture endpoints document that they are unauthenticated? (c) The spec uses RFC 7807 problem responses for 401 on these endpoints -- those would change to just 404 for not-found. What spec sections need updating? (d) Are there SDK generation implications from removing the share endpoint?
- **Context to provide**: `openapi.yaml` (current spec, especially the share-related sections around lines 50-57, 513-520, 2515-2822), the target endpoint auth matrix
- **Why this agent**: The OpenAPI spec is a contract artifact that downstream consumers (CLI, potential SDKs) depend on. Getting the spec change right in the plan prevents contract drift and ensures the removal is clean across all spec references.

#### Consultation 3: CLI verifier impact assessment
- **Agent**: devx-minion
- **Planning question**: The `@w-r-l/verify` CLI package (packages/verify/) currently handles share tokens in its key-resolver.js (shareTokenFromUrl function, 401 error message suggesting share token usage). With the simplified model, the CLI no longer needs share token support because capture URLs become public. What changes are needed in the verify package? Specifically: (a) Should shareTokenFromUrl be removed or kept as dead-code defense? (b) The 401 error message at line 106-110 of key-resolver.js suggests using share tokens -- this needs updating. (c) Are there any other references in the verify package that assume authed capture access? (d) Should the package version be bumped?
- **Context to provide**: `packages/verify/lib/key-resolver.js` (share token handling), `packages/verify/test/key-resolver.test.js` (related tests)
- **Why this agent**: The CLI is the primary consumer of the capture API for independent verification. Getting the DX right (clear error messages, no references to removed features) is critical for the "anyone can verify" value proposition.

### Cross-Cutting Checklist
- **Testing**: Include test-minion for planning. The capture-retrieval.test.js has extensive tests asserting 401 on unauthenticated access that must flip to 200. The share-token.test.js (entire file) must be removed. The E2E verify-page.spec.js is currently failing. The test changes are substantial and mechanically complex enough to warrant planning input on the approach (update in-place vs. rewrite the retrieval test suite).
- **Security**: ALWAYS include -- covered as Consultation 1 above. This is the core planning question.
- **Usability -- Strategy**: ALWAYS include. The "anyone can verify" value proposition is the entire motivation. ux-strategy-minion should confirm that simplifying the access model actually improves the user journey for third-party verifiers (no auth, no share tokens, just a URL), and flag any journey degradation for tenants who relied on share tokens for controlled sharing.
- **Usability -- Design**: Not needed for planning. No UI components are being designed -- the verify page already exists and its functionality is being restored, not changed. The visual design is unchanged.
- **Documentation**: ALWAYS include. SECURITY.md needs a rewrite of the "Access Model" section. The evolution log needs entries. software-docs-minion should advise on whether the access model simplification warrants an ARCHITECTURE.md update or ADR.
- **Observability**: Not needed for planning. No new runtime components. The logging in the auth gate will be simplified (less code to log), but no new observability requirements emerge.

### Notable Exclusions
- **data-minion**: The share_tokens table removal is a D1 migration, but it is a straightforward DROP TABLE with no data preservation needed. Security-minion covers the FK constraint implications. A database specialist adds no planning value here.
- **frontend-minion**: The verify page (verify-page.js) is not being redesigned -- it already works, and the fix is removing the auth gate that blocks it. No frontend architecture decisions needed.
- **margo**: Governance reviewer triggered unconditionally in Phase 3.5, but not needed for planning. This task is itself a simplification -- removing unnecessary complexity (share tokens, redundant auth). Margo will love it.

### Anticipated Approval Gates

1. **Security model decision** (MUST gate): The core question -- is 128-bit-ID-as-capability acceptable? This gates all downstream work. Hard to reverse (API contract change), high blast radius (every subsequent task depends on this decision). security-minion produces the verdict, user confirms before any code is written.

No other gates anticipated. The remaining work (code changes, spec updates, test updates) is mechanically derived from the approved security model. All changes are additive in simplicity (removing code, removing auth), so they are easy to reverse if needed.

### Rationale

This task is primarily a security architecture simplification with ripple effects across the API spec, tests, CLI package, and documentation. The three planning consultations cover the critical domains:

- **Security** (the core question): Is the simplified model sound?
- **API spec** (the contract): How does the external API change?
- **DX/CLI** (the consumer): How does the verification tool adapt?

The cross-cutting additions (testing, UX strategy, documentation) ensure the plan covers test migration strategy, user journey validation, and documentation updates without needing separate planning consultations -- these agents contribute planning-level input alongside the primary three.

### Scope

**In scope:**
- Remove auth from GET /v1/captures/{id}, /status, /artifacts/* (except WACZ which is already public)
- Keep auth on GET /v1/captures (list) and POST /v1/captures
- Remove the share token system entirely: POST /v1/captures/{id}/share endpoint, share-tokens.js module, share_tokens D1 table (via migration), share token cleanup from cron, share token handling from the auth gate in fetch()
- Update SECURITY.md Access Model section
- Update openapi.yaml (remove share endpoint, share security scheme, update auth docs on capture endpoints)
- Update @w-r-l/verify CLI package (remove share token references)
- Fix verify-page.spec.js E2E test
- Update capture-retrieval.test.js (401 assertions become 200)
- Remove share-token.test.js
- Update test/fixtures.js (remove seedShareToken and share_tokens cleanup)

**Out of scope:**
- Changing the verify endpoint (/v1/verify/{id}) -- already public, unchanged
- Changing capture creation auth (POST /v1/captures) -- stays tenant-authed
- Adding new features (rate limiting on public capture access, etc.) -- YAGNI
- Dashboard UI changes -- the UI uses session auth which is unaffected

### External Skill Integration

No external skills detected in project.

## Meta-Plan

### Planning Consultations

#### Consultation 1: Auth gate architecture and share token design
- **Agent**: security-minion
- **Planning question**: Given the current auth architecture (verifyApiKey in auth.js, verifySession in session.js, verifyAuth dual-mode in index.js), what is the safest way to add an auth gate to GET /v1/captures/{id}, artifact download, and status endpoints while keeping GET /v1/verify/{id} unauthenticated? Specifically: (a) Where should the auth check live -- in the existing fetch() routing logic (like the account route session gate at lines 407-443 of index.js) or inside each handler? (b) For share tokens: what token format, entropy, and storage design minimizes attack surface? The issue specifies 256-bit minimum, URL-safe, time-limited or permanent. Should the token be a random opaque string looked up in D1, or an HMAC-signed payload (like session cookies)? What are the trade-offs for each? (c) How should expired tokens behave (410 Gone per issue spec) vs revoked tokens? (d) What is the threat model for share token enumeration, and does the 256-bit minimum adequately address it? (e) The CLI verify tool (packages/verify/lib/key-resolver.js) currently fetches GET /v1/captures/{captureId}/artifacts/wacz with no auth. The issue says share tokens provide backward compatibility. Should the verification endpoint response include a share token URL, or should the CLI accept a --token flag?
- **Context to provide**: src/auth.js (full), src/session.js (full), src/index.js routing + fetch() handler (lines 57-104, 330-495), packages/verify/lib/key-resolver.js (fetchWaczFromCaptureUrl), SECURITY.md, the D1 schema (captures table has tenant_id), the issue constraints (depends on D1, 256-bit tokens, 410 for expired)
- **Why this agent**: Security is the primary domain -- this is an access control feature. Token format, timing attack surface, enumeration resistance, and the SECURITY.md update all require security expertise. This agent also needs to assess whether returning 404 (vs 403) for cross-tenant access is sufficient to prevent enumeration.

#### Consultation 2: D1 schema design for share tokens
- **Agent**: data-minion
- **Planning question**: Design the D1 migration for the share_tokens table. Consider: (a) What columns are needed? At minimum: token_hash (SHA-256 of the raw token, like api_keys), capture_id (FK to captures), tenant_id (denormalized for audit), created_at, expires_at (nullable for permanent tokens). (b) Should the lookup be by token_hash alone, or token_hash + capture_id? (c) What indexes are needed for the query patterns: lookup by token_hash, cleanup of expired tokens, listing tokens per capture? (d) Should there be a limit on tokens per capture? (e) How does this interact with the existing captures table (tenant_id already there, used for ownership check)?
- **Context to provide**: All migration files (0001-0009), src/db.js (api_keys pattern as reference: hash-based lookup, similar structure), captures table schema
- **Why this agent**: D1 schema design is a hard-to-reverse decision with downstream impact on every query. The api_keys table pattern (hash-based lookup, scope checking) is a good model but share tokens have different query patterns (single-capture scoped, expiry checks).

#### Consultation 3: API design for share token endpoints and auth-gated retrieval
- **Agent**: api-design-minion
- **Planning question**: Design the API surface for: (a) POST /v1/captures/{id}/share -- request body schema (expiresIn duration vs expiresAt timestamp? permanent flag?), response shape (token, shareUrl, expiresAt). (b) How should the share token be passed on retrieval endpoints -- query parameter (e.g., ?token=xxx) as the issue specifies? What parameter name? (c) Should the GET /v1/captures/{id} response include share-related metadata (like a list of active share URLs) or keep it lean? (d) The auth-gated endpoints need to return 404 for cross-tenant access (not 403). How should this be documented in the API so clients can distinguish "capture does not exist" from "you don't have access" -- or is that ambiguity intentional? (e) How should the status polling endpoint (GET /v1/captures/{id}/status) work with auth -- it's used during capture processing, so the tenant who created the capture needs access immediately.
- **Context to provide**: Current handler signatures (handleGetCapture, handleGetCaptureArtifact, handleCaptureStatus), the existing route patterns in index.js, the issue scope constraints
- **Why this agent**: API contract decisions (URL structure, parameter naming, response shapes) affect the CLI tool, any future SDKs, and are hard to change once published. The interaction between auth, share tokens, and the existing public verification endpoint needs careful design.

#### Consultation 4: CLI tool backward compatibility strategy
- **Agent**: devx-minion
- **Planning question**: The npx @w-r-l/verify CLI tool currently fetches captures and WACZ artifacts without authentication (key-resolver.js fetchWaczFromCaptureUrl). After the auth gate, it will get 401s. The issue says share tokens provide backward compatibility. What is the best DX approach? Options: (a) The verify endpoint response could include artifact URLs with share tokens baked in (e.g., the wacz URL in the verify response already has ?token=xxx). (b) The CLI could accept a --token flag. (c) The verification endpoint (GET /v1/verify/{id}) remains public and could be enhanced to return the WACZ bytes directly or include a tokenized download URL. Which approach minimizes disruption for existing users while maintaining security? What version bump (minor vs major) does this require for the npm package?
- **Context to provide**: packages/verify/lib/key-resolver.js (full), packages/verify/lib/cli.js (argument parser and help text), packages/verify/package.json, the verification endpoint handler (handleVerifyCapture)
- **Why this agent**: Developer experience for the CLI tool is critical -- breaking npx @w-r-l/verify would violate the issue's explicit constraint. The DX agent can evaluate the migration path from the tool consumer's perspective.

### Cross-Cutting Checklist
- **Testing**: Include test-minion for planning. The auth gate introduces multiple new code paths (authenticated access, cross-tenant 404, share token valid/expired/invalid, CLI backward compat). Test strategy needs to cover both unit tests (auth middleware, token validation) and integration tests (actual HTTP flows with the worker). Question: What test scenarios are needed to verify tenant isolation (cross-tenant 404), share token lifecycle (create, use, expire), and CLI backward compatibility?
- **Security**: ALWAYS include -- covered as Consultation 1 (primary domain for this task).
- **Usability -- Strategy**: ALWAYS include -- planning question: This feature transitions capture retrieval from "public by default" to "private by default with sharing." What is the impact on the user journey for (a) a tenant retrieving their own captures, (b) a tenant sharing a capture with a third party, (c) a third party verifying a shared capture? Are there cognitive load issues with the share token model (e.g., "why can't I just send the capture URL anymore")?
- **Usability -- Design**: Exclude from planning. No UI components are being modified -- this is purely API-level. The Web UI dashboard (GET /ui) already authenticates via session cookies and will continue to work via the existing verifyAuth dual-mode path.
- **Documentation**: ALWAYS include -- planning question for software-docs-minion: The SECURITY.md needs a significant update (new access model, share token design, threat analysis). What sections should be added or restructured? Should the API documentation (if any exists) be updated to reflect the auth requirements on retrieval endpoints?
- **Observability**: Exclude from planning. The existing logging infrastructure (Coralogix via log()) already covers auth events. New auth checks will use the same patterns. No new runtime components or services are being created.

### Notable Exclusions

- **oauth-minion**: OAuth flows are not being modified. The existing session cookie auth (verifySession) and API key auth (verifyApiKey) are the auth mechanisms. Share tokens are a new, simpler token type -- not an OAuth flow.
- **frontend-minion**: No UI changes needed. The Web UI authenticates via session cookies, which already work through verifyAuth. The auth gate only affects API-level access patterns.
- **edge-minion**: No CDN or edge configuration changes. Share token validation happens at the worker level, not the edge layer.

### Anticipated Approval Gates

1. **Share token design + D1 schema** (MUST gate): Hard to reverse (schema migration) + high blast radius (every subsequent task depends on the token format, storage design, and API contract). This gate should present the security-minion's token design, data-minion's schema, and api-design-minion's endpoint design as a unified decision.

2. **CLI backward compatibility approach** (MUST gate): Hard to reverse (published npm package) + the approach determines whether the verify endpoint response format changes. Must be decided before implementation begins.

### Rationale

This task is primarily a security feature (auth gate + tenant isolation) with a significant data model component (share tokens in D1) and an API design component (new endpoint + modified existing endpoints). The CLI backward compatibility constraint makes this more complex than a straightforward auth gate -- the verify tool currently relies on unauthenticated access to artifacts, so the share token mechanism must be designed to preserve that workflow.

Four specialists are consulted for planning because the task sits at the intersection of their domains:
- security-minion owns the access control design, token format, and threat model
- data-minion owns the D1 schema (hard to reverse)
- api-design-minion owns the API contract (hard to change once published)
- devx-minion owns the CLI tool consumer experience

Cross-cutting agents (test-minion, ux-strategy-minion, software-docs-minion) add planning value by identifying test scenarios, user journey impacts, and documentation structure before implementation begins.

### Scope

**In scope:**
- Auth gate on GET /v1/captures/{id}, GET /v1/captures/{id}/artifacts/{name}, GET /v1/captures/{id}/status
- Tenant isolation: captures accessible only by the owning tenant (cross-tenant = 404)
- Share token creation endpoint: POST /v1/captures/{id}/share
- Share token validation on retrieval endpoints (query parameter)
- Time-limited and permanent share tokens with server-side expiry check
- 410 Gone for expired share tokens
- D1 migration for share_tokens table
- SECURITY.md update with new access model and threat analysis
- CLI tool (packages/verify/) backward compatibility via share tokens
- Existing verifyAuth dual-mode (session + API key) continues to work

**Out of scope:**
- Fine-grained per-capture permissions (read/write/delete)
- Share token revocation API
- Share token usage analytics
- Organization-level sharing
- Changes to the public verification endpoint (GET /v1/verify/{id}) -- stays unauthenticated
- Changes to capture creation endpoints (POST /v1/captures) -- already authenticated
- Changes to the admin API -- already authenticated
- Per-tenant rate limiting changes

### External Skill Integration

No external skills detected in project.

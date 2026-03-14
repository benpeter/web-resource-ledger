# Meta-Plan: MVP Step 8 -- OpenAPI Spec and Security Hardening

## Task Summary

Issue #8 covers five work streams for production hardening of the Web Resource Ledger Cloudflare Worker:

1. **OpenAPI spec completion** -- `openapi.yaml` already exists with substantial coverage (634 lines covering all main endpoints). Needs updating to add the `/.well-known/signing-key` endpoint and the verification endpoint (`/v1/verify/{captureId}`), plus validation that the spec matches the actual implementation.
2. **Security headers** -- Add `Strict-Transport-Security` and `X-Frame-Options: DENY` globally. `X-Content-Type-Options: nosniff` already exists on all responses (line 49 of `src/index.js`). The verify-page already sets `X-Frame-Options: DENY` independently.
3. **DNS pinning verification** -- The SSRF prevention in `src/url-validation.js` already blocks private IPs pre-resolution. The issue asks for a "defense-in-depth check" to verify this works. This is a validation/test task, not new feature code.
4. **Global backpressure** -- 503 with `Retry-After` when Worker concurrency limit is approached. Cloudflare Workers don't expose a concurrency gauge, so this needs investigation into what's actually feasible.
5. **Signing key endpoint** -- `GET /.well-known/signing-key` returning base64-encoded Ed25519 public key. Derives from `getSigningKeys()` in `src/signing.js`. Plus README documentation of key rotation procedure.

## Planning Consultations

### Consultation 1: API Specification Completeness

- **Agent**: api-spec-minion
- **Planning question**: The existing `openapi.yaml` (634 lines) covers `POST /v1/captures`, `GET /v1/captures/{captureId}/status`, `GET /v1/captures/{captureId}`, and `GET /v1/captures/{captureId}/artifacts/{name}` with shared components for RFC 9457 errors, security schemes, and reusable headers. Two additions are needed: (a) the verification endpoint `GET /v1/verify/{captureId}` which returns either JSON or HTML based on Accept header (content negotiation), and (b) the new `GET /.well-known/signing-key` endpoint. What is the right way to spec content-negotiated responses in OpenAPI 3.1? Should the verification response schema cover the HTML response or only the JSON contract? What validation tooling should be added (the issue mentions `openapi-validator` or equivalent CLI)?
- **Context to provide**: Current `openapi.yaml` (full file), `src/index.js` (routes and response shapes), `src/verify-page.js` (HTML response for browsers), `src/signing.js` (key derivation for the new endpoint)
- **Why this agent**: Domain expertise in OpenAPI 3.1 specification authoring, validation tooling selection, and contract-first patterns. The existing spec is already well-structured -- this agent can assess whether it's complete and identify gaps against the implementation.

### Consultation 2: Security Headers and Hardening

- **Agent**: security-minion
- **Planning question**: The Worker already sets `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` globally on all responses (lines 48-49, `src/index.js`). The verify-page independently sets `X-Frame-Options: DENY` and a strict CSP. The issue asks for adding `Strict-Transport-Security` and `X-Frame-Options: DENY` globally. Three questions: (1) What HSTS parameters are appropriate for a Cloudflare Worker (max-age, includeSubDomains, preload)? The backlog (line 89) deferred this from Step 7 noting it's a "global decision." (2) Should we consolidate the verify-page's independent header setting into the global wrapper, or keep it separate since it also sets CSP? (3) The issue mentions "DNS pinning enforcement verified" -- the existing `url-validation.js` already resolves DNS and rejects private IPs before handing URLs to Puppeteer. Is additional enforcement possible given that Cloudflare's Browser Rendering independently re-resolves DNS (the TOCTOU gap documented in the code)?
- **Context to provide**: `src/index.js` (global header setting at lines 48-50), `src/url-validation.js` (SSRF prevention), `src/verify-page.js` (verify page headers including CSP), `src/capture.js` (header fetch with redirect:manual), backlog item about HSTS and TOCTOU
- **Why this agent**: Security expertise for HSTS deployment decisions, header consolidation risk assessment, and evaluating the DNS pinning defense-in-depth claim against the Cloudflare Worker architecture's actual constraints.

### Consultation 3: Backpressure and Edge Architecture

- **Agent**: edge-minion
- **Planning question**: The issue asks for a "global backpressure handler: returns 503 with `Retry-After` header when Worker concurrency limit is approached." Cloudflare Workers have a concurrency model but don't expose a real-time concurrency gauge to the Worker code itself. Rate limiting is already implemented per-IP via Cloudflare's rate limiting bindings (`CAPTURE_RATE_LIMITER` and `VERIFY_RATE_LIMITER` in `wrangler.toml`). What is actually feasible for backpressure in a Cloudflare Worker? Options: (a) Use the existing rate limiter pattern with a global key, (b) Track in-flight requests via a Durable Object counter, (c) Accept that Cloudflare's own 503 handling at the platform level is sufficient and document this, (d) Something else. The project philosophy is YAGNI/KISS -- what's the simplest defense-in-depth that adds real value?
- **Context to provide**: `wrangler.toml` (existing rate limiter configuration), `src/index.js` (request handling flow), project engineering philosophy (Helix Manifesto, YAGNI, KISS)
- **Why this agent**: Expertise in Cloudflare Workers architecture, edge compute concurrency models, and CDN-level backpressure patterns. Needs to assess what's architecturally possible vs. what's over-engineering for this platform.

### Consultation 4: Signing Key Endpoint Design

- **Agent**: api-design-minion
- **Planning question**: The issue asks for `GET /.well-known/signing-key` returning the Ed25519 public key as base64-encoded raw bytes. Design questions: (1) Should this follow RFC 8615 (.well-known URI) conventions? (2) What Content-Type is appropriate for a base64-encoded key (application/octet-stream? text/plain? a JWK JSON envelope for future extensibility)? (3) What caching headers are appropriate -- the key changes only on rotation, so long cache with revalidation? (4) Should the response include any metadata (algorithm, key ID, created date) or just the raw key bytes? The backlog mentions key versioning as a [should] item -- should the endpoint design anticipate that?
- **Context to provide**: `src/signing.js` (key derivation), README.md signing key section, backlog items about key versioning and old key archive endpoint
- **Why this agent**: API design expertise for endpoint semantics, content type selection, caching strategy, and future-proofing decisions within YAGNI constraints.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning -- YES. The issue has an explicit acceptance criterion about `openapi-validator` reporting no errors, and the signing key endpoint needs integration tests. Also need to verify security headers are applied correctly. Existing test suite uses vitest with Cloudflare's vitest-pool-workers.
- **Security**: Include security-minion for planning -- YES. Already included as Consultation 2. This step is fundamentally about security hardening.
- **Usability -- Strategy**: ALWAYS include -- The signing key endpoint enables independent third-party verification. How should this be surfaced to users? The verification page already exists -- does the signing key endpoint need any user-facing discoverability? Planning question: What is the user journey for someone who wants to independently verify a capture? Is the `.well-known` path discoverable enough, or should it be linked from the verification page or API responses?
- **Usability -- Design**: Not needed for planning. No new UI components are being created. The verify-page already exists and won't change meaningfully in this step.
- **Documentation**: ALWAYS include -- software-docs-minion for the OpenAPI spec changes (which is itself documentation), and user-docs-minion for the key rotation procedure in README. Planning question for user-docs-minion: The issue asks for key rotation documentation in the README. The README already has a "Signing Key Setup" section. What should the key rotation procedure cover -- just the commands, or also the operational considerations (cache invalidation, verification of captures signed with old key, downtime window)?
- **Observability**: Not needed for planning. No new runtime services or background processes. The Worker is already in production.

### Anticipated Approval Gates

1. **Backpressure approach decision** (MUST gate) -- Hard to reverse (architectural pattern choice), high blast radius (affects global request handling). Multiple valid approaches exist (platform-level vs. application-level, rate limiter vs. Durable Object vs. documenting platform behavior). This needs user input before implementation.

2. **Signing key endpoint format** (OPTIONAL gate) -- Easy to reverse (additive endpoint), but the format decision (raw base64 vs. JWK) affects downstream consumers. Gate only if the specialist recommends a format that deviates from the issue's explicit "base64-encoded raw bytes" specification.

3. **HSTS parameters** (OPTIONAL gate) -- Easy to reverse but affects all responses. The parameters (max-age, preload) are well-documented best practices, but preload has implications (HSTS preload list submission is permanent). Present as notification unless specialist recommends preload.

### Rationale

This task spans four distinct domains: API specification (api-spec-minion), security hardening (security-minion), edge platform architecture (edge-minion), and API design (api-design-minion). The most uncertain work item is backpressure handling -- the Cloudflare Worker platform may not support what the issue envisions, requiring either creative workarounds or honest scoping to what's feasible. The OpenAPI spec work is the largest by volume but least uncertain, since the spec already exists and just needs completion + validation. The signing key endpoint is straightforward but has design decisions around format and caching that benefit from specialist input.

UX strategy is included because the signing key endpoint serves a specific user journey (independent verification) that should be coherent with the existing verification page and API. Test-minion planning input is valuable because the acceptance criteria include specific validation tooling requirements.

### Scope

**In scope:**
- Completing `openapi.yaml` with verification and signing-key endpoints
- Adding OpenAPI validation to the development workflow
- Adding `Strict-Transport-Security` and `X-Frame-Options: DENY` to global response headers
- Verifying DNS pinning enforcement (documentation/test, not new defense code)
- Designing and implementing backpressure handling (within Cloudflare Worker constraints)
- Implementing `GET /.well-known/signing-key` endpoint
- Documenting key rotation procedure in README
- Updating backlog with resolved items (HSTS was deferred from Step 7)

**Out of scope:**
- TOCTOU gap mitigation (backlog [should], separate effort)
- Key versioning / key ID in signatures (backlog [should], future work)
- Old public key archive endpoint (backlog [should], future work)
- CORS hardening on POST endpoint (backlog [should], separate effort)
- Per-tenant rate limiting (backlog [consider])
- HTML error pages for browsers (backlog [consider])

### External Skill Integration

No external skills detected in project. The `.claude/skills/` and `.skills/` directories do not exist in the working directory. The only global skill (`juli`) is unrelated to this task domain.

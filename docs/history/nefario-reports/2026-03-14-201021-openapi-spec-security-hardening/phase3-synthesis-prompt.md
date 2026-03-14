MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task
MVP Step 8: OpenAPI Spec and Security Hardening for a Cloudflare Worker-based web resource ledger service. All API endpoints exist (Steps 3-7 complete). This step hardens the service for production: formal API specification, security headers, backpressure handling, and a public key endpoint for independent signature verification.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase2-api-spec-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase2-edge-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase2-user-docs-minion.md

## Key consensus across specialists:

### api-spec-minion
Phase: planning
Recommendation: Use OpenAPI 3.1 multiple media types for content negotiation on verify endpoint; add 4 new schemas for verification; use @redocly/cli for validation; JSON envelope for signing-key. Found 5 spec gaps vs implementation.
Tasks: 3 -- Complete verification endpoint spec with content negotiation; Add signing-key endpoint spec; Add @redocly/cli validation and fix 5 spec gaps
Risks: Spec-implementation drift if verify endpoint changes without spec update
Conflicts: Signing-key format (raw base64 vs JSON envelope) needs alignment with api-design-minion

### security-minion
Phase: planning
Recommendation: HSTS max-age=31536000 without preload (one-way door); consolidate X-Frame-Options globally but keep CSP page-specific; DNS pinning is documentation/test task not runtime enforcement
Tasks: 3 -- Add HSTS and X-Frame-Options to global headers; Document DNS pinning TOCTOU as accepted risk; Security review of signing-key endpoint
Risks: HSTS preload is irreversible; CSP consolidation could break verify page
Conflicts: none

### edge-minion
Phase: planning
Recommendation: Global-key rate limiter for capture endpoint only (~5 lines code); detect Browser Rendering 429 in capture.js; document platform 503; skip Durable Objects. Original issue premise is false -- Workers don't expose concurrency gauge.
Tasks: 2 -- Add global rate limiter for capture backpressure; Improve Browser Rendering error handling
Risks: False premise in original issue
Conflicts: none

### api-design-minion
Phase: planning
Recommendation: JSON response {algorithm, publicKey} for signing-key; Cache-Control public max-age=3600 stale-while-revalidate=86400; no key versioning now (forward-compatible); CORS *; no auth; 503 when no key configured
Tasks: 2 -- Implement signing-key endpoint; Add to OpenAPI spec
Risks: Key rotation breaks old capture verification
Conflicts: none

### ux-strategy-minion
Phase: planning
Recommendation: Two audiences (casual/technical); add public key link to verify page crypto details; add signingKeyUrl to verification JSON response; document rotation limitations honestly
Tasks: 3 -- Add public key link to verify page; Add signingKeyUrl to JSON response; Document rotation UX impact
Risks: Key rotation causes false "Verification Failed" on old captures
Conflicts: Wants to elevate key versioning to [must] -- may conflict with YAGNI

### test-minion
Phase: planning
Recommendation: OpenAPI validation as lint step with @redocly/cli (not vitest); two new test files for signing-key (10 cases) and security headers; content negotiation coverage gap
Tasks: 3 -- Add @redocly/cli lint script; Create signing-key tests; Create security-headers tests
Risks: None critical
Conflicts: none

### user-docs-minion
Phase: planning
Recommendation: Cover operational consequences beyond bare commands; prominent warning that rotation breaks old capture verification; brief signing-key endpoint reference
Tasks: 1 -- Add key rotation section to README with warning and signing-key endpoint reference
Risks: Users could rotate keys without understanding irreversibility
Conflicts: none

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. The project uses vanilla JS (no TypeScript), Cloudflare Workers with vitest + @cloudflare/vitest-pool-workers for testing
7. The project follows YAGNI/KISS principles -- lean and mean, minimize dependencies
8. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase3-synthesis.md`

## Key Conflicts to Resolve
1. Signing-key format: Issue says "base64-encoded raw bytes" but api-design-minion and api-spec-minion both recommend JSON envelope {algorithm, publicKey}. The JSON format is forward-compatible and consistent with the rest of the API. Resolve in favor of JSON.
2. Key versioning scope: ux-strategy-minion wants to elevate to [must], but YAGNI says no. Keep as [should] in backlog. Document the limitation honestly.
3. Backpressure approach: edge-minion identified that original issue premise is false. Use global-key rate limiter on capture endpoint as the KISS solution.

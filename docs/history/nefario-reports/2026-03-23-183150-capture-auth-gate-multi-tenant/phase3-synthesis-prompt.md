MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Capture retrieval endpoints require tenant authentication, enforcing that tenants can only access their own captures. The public verification endpoint remains unauthenticated by design. Share tokens allow tenants to grant access to specific captures without exposing their API key.

Success criteria:
- GET /v1/captures/{id} requires a valid tenant API key and returns 401 without one
- Artifact download endpoints (screenshot, WACZ, HTML) require tenant authentication
- Tenant can only retrieve captures belonging to their tenantId; cross-tenant access returns 404 (not 403, to avoid enumeration)
- Public verification endpoint (GET /v1/verify/{id}) remains unauthenticated
- POST /v1/captures/{id}/share generates a share token (time-limited or permanent, tenant's choice)
- Share token appended as query parameter grants read access to that specific capture and its artifacts
- Existing capture IDs remain accessible via share tokens for backward compatibility
- SECURITY.md updated with the new access model, share token design, and threat analysis

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase2-data-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase2-devx-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase2-software-docs-minion.md

## Key consensus across specialists:

## Summary: security-minion
Phase: planning
Recommendation: Route-level auth gate in fetch() following existing admin/account patterns. Opaque random tokens (stk_ prefix, 256-bit, D1 hash lookup). HMAC-signed tokens rejected (non-revocable, adds secret complexity). Token propagation to artifact URLs when accessed via share token. Expired=410, revoked=401.
Tasks: 8 -- D1 migration; auth gate in fetch(); tenant isolation in handlers; share token creation endpoint; share token revocation; CLI --token flag; SECURITY.md update; tests
Risks: Immediate breakage of existing unauthenticated access; share token in URL query string visible in logs; race condition between gate deploy and token creation endpoint
Conflicts: Disagrees with devx-minion on CLI approach (security wants --token flag, devx wants HMAC-signed waczUrl from verify endpoint). Disagrees with api-design-minion on 410 vs 404 for expired tokens.

## Summary: data-minion
Phase: planning
Recommendation: share_tokens table with token_hash PK (SHA-256, 64 chars), capture_id FK, tenant_id denorm, expires_at nullable, revoked flag, label. Lookup by token_hash alone (PK probe). Per-capture limit of 20 at application layer.
Tasks: 4 -- Migration 0010; CRUD in db.js; share token verification in auth.js; expired token cleanup cron
Risks: Token format ambiguity between share tokens and API keys (distinct prefix needed: wrl_share_ vs wrl_live_). Permanent tokens as liability.
Conflicts: none

## Summary: api-design-minion
Phase: planning
Recommendation: POST /v1/captures/{id}/share with expiresIn (seconds, optional). Response 201 with token, shareUrl, expiresAt. Query param ?token=wrl_share_... for retrieval. No share metadata in capture response (YAGNI). Cross-tenant 404 is intentional ambiguity. Allow share creation on pending+complete captures.
Tasks: 6 -- D1 migration; share endpoint; auth gate on retrieval; token propagation to artifact URLs; keep verify public; SECURITY.md update
Risks: Verify CLI breaking change; share token in query string logs; recommends 404 for expired tokens instead of 410.
Conflicts: Disagrees with security-minion on expired token response (api-design wants 404 everywhere, security accepts 410 for expired). Disagrees with devx-minion on HMAC tokens. Agrees with security on opaque tokens.

## Summary: devx-minion
Phase: planning
Recommendation: Enhance verify endpoint to include HMAC-signed waczUrl for CLI zero-config backward compat. No --token flag needed. Minor version bump (0.2.0). Two distinct token types: ephemeral HMAC (verify flow) and persistent share tokens (user-facing, D1).
Tasks: 5 -- Add waczUrl to verify response; accept HMAC token on artifact endpoints; update CLI; version bump; share token endpoint
Risks: Two token mechanisms confuse developers; HMAC secret rotation; old CLI versions break silently; verify endpoint becomes WACZ download vector.
Conflicts: Major conflict with security-minion on token approach. Security wants opaque-only tokens; devx wants HMAC-signed ephemeral tokens for verify flow.

## Summary: test-minion
Phase: planning
Recommendation: Three-layer test strategy (unit 70%, integration 20%, E2E 10%). Rewrite capture-retrieval.test.js for auth gate. New share-token.test.js. Preserve verify tests unchanged.
Tasks: 8 -- Rewrite retrieval tests; new share token tests; preserve verify tests; cross-tenant list tests; DB unit tests; update fixtures; E2E tests; status polling auth tests
Risks: Accidentally auth-gating verify endpoint; leaking capture existence via 403; breaking legacy auth path.
Conflicts: none

## Summary: ux-strategy-minion
Phase: planning
Recommendation: Frame as "captures are private by default." Share URL generation should be effortless (POST returns complete URL). Verify URL is the escape valve for third-party verification. Auto-share via tenant config could reduce friction.
Tasks: 3 -- Ensure share endpoint returns complete URL; consider auto-share config; verify endpoint stays public
Risks: Three-step friction increase for sharing (was: copy URL, now: create token + construct URL + send). Migration concern: existing shared capture URLs break.
Conflicts: none

## Summary: software-docs-minion
Phase: planning
Recommendation: SECURITY.md needs restructure: Access Model (3 paths), Share Token Design, Threat Analysis. README has 8+ references to "ID as access secret" needing update. OpenAPI needs auth on 3 retrieval endpoints, new share token scheme, new endpoint.
Tasks: 4 -- SECURITY.md restructure; README updates; OpenAPI spec updates; CLI documentation
Risks: Pervasive "ID as secret" language across multiple files. CLI tool artifact fetching will break.
Conflicts: none

## KEY CONFLICTS REQUIRING RESOLUTION

### Conflict 1: CLI Backward Compatibility -- HMAC ephemeral tokens vs --token flag
- **security-minion**: Opaque tokens only. CLI gets --token flag. Verify endpoint does NOT include download URLs (would leak tokens on public endpoint).
- **devx-minion**: HMAC-signed ephemeral waczUrl in verify response. No --token flag. Zero-config DX preserved.
- **api-design-minion**: Sides with security on opaque tokens. CLI should accept share URLs with ?token= and propagate.

### Conflict 2: Expired token response -- 410 Gone vs 404
- **Issue spec**: 410 Gone
- **security-minion**: Accepts 410 for expired (intentionally shared), 401 for revoked
- **api-design-minion**: Prefers 404 everywhere (no information leak)

### Conflict 3: Token prefix -- stk_ vs wrl_share_
- **security-minion**: stk_ prefix
- **data-minion**: wrl_share_ prefix
- **api-design-minion**: wrl_share_ prefix (consistent with wrl_live_ for API keys)

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve the conflicts above -- choose one approach for each and document the rationale
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format with complete, self-contained prompts
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase3-synthesis.md

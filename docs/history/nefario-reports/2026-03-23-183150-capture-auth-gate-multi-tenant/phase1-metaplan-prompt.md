MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
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

Scope:
- In: Auth gate on capture retrieval, tenant isolation enforcement, share token generation and validation, SECURITY.md update, backward compatibility via share tokens
- Out: Fine-grained per-capture permissions (read/write/delete), share token revocation API (future enhancement), share token usage analytics, organization-level sharing

Constraints:
- Depends on R24 (tenant identity) for authentication on retrieval endpoints
- Depends on R30 (D1) for share token storage and lookup
- Share tokens must be cryptographically random (minimum 256 bits) and URL-safe
- Time-limited tokens checked server-side; expired tokens return 410 Gone
- Must not break the npx @w-r-l/verify CLI tool, which accesses artifacts for verification
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/validated-shimmying-kettle

## Codebase Context

### Current Auth Architecture
- src/auth.js: API key verification (SHA-256 hashed, D1 lookup, scope checking, legacy fallback)
- src/session.js: Session cookie auth (OAuth, HMAC-signed cookies, D1 session table)
- verifyAuth() in index.js: tries session first, then API key. Returns { tenantId, scopes, authMethod }

### Currently PUBLIC Endpoints (no auth):
- GET /v1/captures/{id} — metadata retrieval (capture ID acts as access secret)
- GET /v1/captures/{id}/artifacts/{name} — screenshot, HTML, WACZ download
- GET /v1/captures/{id}/status — polling for capture progress
- GET /v1/verify/{id} — verification endpoint (rate-limited per IP)
- GET /.well-known/signing-key(s) — public key distribution

### D1 Schema
- captures table has tenant_id column (already indexed: idx_captures_tenant_created)
- api_keys table links key_hash to tenant_id and scopes
- sessions table links id_hash to tenant_id
- No share_tokens table yet

### CLI Tool Impact
- packages/verify/ — npx @w-r-l/verify tool
- Fetches GET /v1/captures/{id} then GET /v1/captures/{id}/artifacts/wacz
- No auth headers — relies on public access
- Must continue working via share tokens after auth gate is added

### Rate Limiting
- VERIFY_RATE_LIMITER: 60 req/min per IP
- No rate limiter currently for capture retrieval

## External Skill Discovery
No external skills detected in .claude/skills/ or .skills/.

## Instructions
1. Read relevant files to understand the codebase context
2. Analyze the task against your delegation table
3. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
4. For each specialist, write a specific planning question that draws on their unique expertise
5. Return the meta-plan in the structured format
6. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase1-metaplan.md

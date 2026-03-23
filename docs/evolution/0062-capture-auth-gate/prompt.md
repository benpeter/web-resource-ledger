# Phase 0062: Capture Auth Gate for Multi-Tenant

Issue: #110 — R33: Capture auth gate for multi-tenant

## Task Description

Capture retrieval endpoints require tenant authentication, enforcing that tenants can only access their own captures. The public verification endpoint remains unauthenticated by design. Share tokens allow tenants to grant access to specific captures without exposing their API key.

## Success Criteria

- GET /v1/captures/{id} requires a valid tenant API key and returns 401 without one
- Artifact download endpoints (screenshot, WACZ, HTML) require tenant authentication
- Tenant can only retrieve captures belonging to their tenantId; cross-tenant access returns 404 (not 403, to avoid enumeration)
- Public verification endpoint (GET /v1/verify/{id}) remains unauthenticated
- POST /v1/captures/{id}/share generates a share token (time-limited or permanent, tenant's choice)
- Share token appended as query parameter grants read access to that specific capture and its artifacts
- Existing capture IDs remain accessible via share tokens for backward compatibility
- SECURITY.md updated with the new access model, share token design, and threat analysis

## Scope

- In: Auth gate on capture retrieval, tenant isolation enforcement, share token generation and validation, SECURITY.md update, backward compatibility via share tokens
- Out: Fine-grained per-capture permissions (read/write/delete), share token revocation API (future enhancement), share token usage analytics, organization-level sharing

## Constraints

- Depends on R24 (tenant identity) for authentication on retrieval endpoints
- Depends on R30 (D1) for share token storage and lookup
- Share tokens must be cryptographically random (minimum 256 bits) and URL-safe
- Time-limited tokens checked server-side; expired tokens return 410 Gone
- Must not break the npx @w-r-l/verify CLI tool, which accesses artifacts for verification

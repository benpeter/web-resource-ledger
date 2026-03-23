You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

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

## Your Planning Question

Given the current auth architecture (verifyApiKey in auth.js, verifySession in session.js, verifyAuth dual-mode in index.js), what is the safest way to add an auth gate to GET /v1/captures/{id}, artifact download, and status endpoints while keeping GET /v1/verify/{id} unauthenticated? Specifically:
(a) Where should the auth check live -- in the existing fetch() routing logic (like the account route session gate at lines 407-443 of index.js) or inside each handler?
(b) For share tokens: what token format, entropy, and storage design minimizes attack surface? The issue specifies 256-bit minimum, URL-safe, time-limited or permanent. Should the token be a random opaque string looked up in D1, or an HMAC-signed payload (like session cookies)? What are the trade-offs for each?
(c) How should expired tokens behave (410 Gone per issue spec) vs revoked tokens?
(d) What is the threat model for share token enumeration, and does the 256-bit minimum adequately address it?
(e) The CLI verify tool (packages/verify/lib/key-resolver.js) currently fetches GET /v1/captures/{captureId}/artifacts/wacz with no auth. The issue says share tokens provide backward compatibility. Should the verification endpoint response include a share token URL, or should the CLI accept a --token flag?

## Context
Read these files for full context:
- src/auth.js (full auth verification)
- src/session.js (session management)
- src/index.js (routing, fetch handler, especially lines 57-104, 330-495)
- packages/verify/lib/key-resolver.js (CLI artifact fetching)
- SECURITY.md
- migrations/0001_initial_schema.sql (captures table with tenant_id)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: security-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-a5gRQ7/capture-auth-gate-multi-tenant/phase2-security-minion.md

You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Phase 0062 added tenant auth to all capture GET endpoints, which broke the public verify page, CLI verifier, and the "anyone can verify" value proposition. The proposal is to simplify the access model:

1. Auth gate only on `GET /v1/captures` (list endpoint) — tenant isolation for enumeration
2. Remove auth from individual capture access — `GET /v1/captures/{id}`, `/status`, `/artifacts/*` become public again
3. Remove share token system entirely — `POST /v1/captures/{id}/share` endpoint, share-tokens.js, related tests
4. Remove share token cleanup from cron handler
5. Update SECURITY.md with the simplified access model
6. Update OpenAPI spec — remove share endpoint and token auth docs
7. Fix verify-page.spec.js E2E test

Security model after this change:
| Endpoint | Auth |
|----------|------|
| GET /v1/captures (list) | Tenant auth required |
| GET /v1/captures/{id} | Public (128-bit ID = capability) |
| GET /v1/captures/{id}/status | Public |
| GET /v1/captures/{id}/artifacts/* | Public |
| POST /v1/captures | Tenant auth required |
| GET /v1/verify/{id} | Public (unchanged) |

## Your Planning Question
The current access model requires tenant auth on all capture GET endpoints (GET /v1/captures/{id}, /status, /artifacts/*), with share tokens as a workaround for delegated access. The proposal is to make individual capture access public, relying on 128-bit capture IDs (cap_ + 32 hex) as capability tokens. The list endpoint (GET /v1/captures) would remain tenant-authed to prevent enumeration.

Specifically:
(a) Is 128-bit entropy sufficient as a capability token for this use case (web archive access, not financial data)?
(b) What residual risks exist if capture IDs leak (e.g., Referrer headers, logs)?
(c) Are there any edge cases where removing auth from individual capture endpoints creates unexpected attack surface?
(d) The share_tokens table and endpoint would be fully removed — any implications for the D1 migration strategy (the table has FK constraints to captures and tenants)?

## Context
Read these files for current implementation:
- src/auth.js (auth mechanism)
- src/index.js (route definitions and auth gates)
- SECURITY.md (current access model documentation)
- migrations/0010_share_tokens.sql (table schema with FK constraints)
- src/share-tokens.js (share token module)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase2-security-minion.md`

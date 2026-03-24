MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
## Context

Phase 0062 added tenant auth to all capture GET endpoints, which broke:
- The public verify page (can't fetch capture URL/artifacts)
- The CLI verifier (`npx @w-r-l/verify` gets 401 on WACZ download)
- The "anyone can verify" value proposition

The root issue: capture IDs have 128 bits of entropy (cap_ + 32 hex). They are effectively capability tokens. Adding auth on top is a second indirection for a problem that doesn't exist. Share tokens (also added in 0062) are redundant.

## Changes

1. **Auth gate only on `GET /v1/captures`** (list endpoint) — tenant isolation for enumeration
2. **Remove auth from individual capture access** — `GET /v1/captures/{id}`, `/status`, `/artifacts/*` become public again
3. **Remove share token system** — `POST /v1/captures/{id}/share` endpoint, share-tokens.js, related tests
4. **Remove share token cleanup** from cron handler
5. **Update SECURITY.md** with the simplified access model
6. **Update OpenAPI spec** — remove share endpoint and token auth docs
7. **Fix verify-page.spec.js E2E test** — currently failing because of this

Subsumes #162 (WACZ public access) and partially addresses #167 (verify page rendering).

## Security model after this change

| Endpoint | Auth |
|----------|------|
| `GET /v1/captures` (list) | Tenant auth required |
| `GET /v1/captures/{id}` | Public (128-bit ID = capability) |
| `GET /v1/captures/{id}/status` | Public |
| `GET /v1/captures/{id}/artifacts/*` | Public |
| `POST /v1/captures` | Tenant auth required |
| `GET /v1/verify/{id}` | Public (unchanged) |
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/rippling-mapping-graham

## External Skill Discovery
No external skills found in .claude/skills/ or .skills/.

## Instructions
1. Read relevant files to understand the codebase context
2. No external skills discovered.
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase1-metaplan.md`

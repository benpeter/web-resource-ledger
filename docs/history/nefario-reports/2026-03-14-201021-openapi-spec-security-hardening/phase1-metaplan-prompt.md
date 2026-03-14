MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
## Goal
Fully specified API, hardened service, and public key endpoint.

## Context
All API endpoints exist (Steps 3-7 complete). This step hardens the service for production: formal API specification, security headers, backpressure handling, and a public key endpoint for independent signature verification.

## Work Items
- [ ] `openapi.yaml` documents all four endpoints (`POST /v1/captures`, `GET /v1/captures/{id}/status`, `GET /v1/captures/{id}`, `GET /v1/verify/{id}`) with request/response schemas, RFC 9457 error shapes, auth requirements, and rate limit annotations
- [ ] Security headers added to all responses: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- [ ] DNS pinning enforcement verified: Worker refuses to proceed if pre-resolution returns a private IP (defense-in-depth check)
- [ ] Global backpressure handler: returns 503 with `Retry-After` header when Worker concurrency limit is approached
- [ ] `GET /.well-known/signing-key` returns current Ed25519 public key (base64-encoded raw bytes) with appropriate caching headers
- [ ] Key rotation procedure documented in README: `wrangler secret put SIGNING_KEY` + `wrangler deploy` + update `/.well-known/signing-key` cache

## Acceptance Criteria
- `openapi-validator` (or equivalent CLI tool) reports no errors against `openapi.yaml`
- `curl -I https://<worker-url>/health` shows `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY` headers
- `GET /.well-known/signing-key` returns the Ed25519 public key as base64

## Dependencies
- Blocked by: #3 (needs endpoints to exist before speccing them)
- Blocks: none

## Technical Notes
- Can be started in parallel with Steps 6 and 7 once Step 3 endpoints are stable — the spec can be drafted incrementally and finalized at the end
- The `/.well-known/signing-key` endpoint enables independent third-party verification without trusting the API response — document this use case in the README
- Security headers should be applied in a single middleware-style wrapper in the Worker entry point, not duplicated per-route
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan
(see your Core Knowledge for the output format).

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF (see External Skill Integration in your Core Knowledge)
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-RcvJmc/openapi-spec-security-hardening/phase1-metaplan.md`

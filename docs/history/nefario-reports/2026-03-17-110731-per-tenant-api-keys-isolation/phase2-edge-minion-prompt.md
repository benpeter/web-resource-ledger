You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Read the full task description from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/prompt.md

## Your Planning Question
The advisory specifies a dedicated `ADMIN_RATE_LIMITER` binding (5/min) with rate check before auth.
1. What wrangler.toml changes are needed for both production and staging (new rate limiter binding, namespace IDs)?
2. How should admin routes interact with the existing per-IP rate limiters (the capture and verify limiters are already defined with namespace IDs 1001-1003 and 2001-2003)?
3. Should admin endpoints have CORS handling or are they always server-to-server?
4. What security headers should admin responses include (the existing global headers pipeline adds Referrer-Policy, X-Content-Type-Options, etc.)?
5. Do the admin routes need a separate rate limit group for X-RateLimit-Limit headers (currently only `capture` and `verify` groups exist in `getRateLimitGroup`)?
6. What namespace IDs should be used for the new admin rate limiter (production and staging)?

## Context
Read these files: `wrangler.toml`, `src/index.js`, `src/rate-limits.js`

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: edge-minion

### Recommendations
### Proposed Tasks
### Risks and Concerns
### Additional Agents Needed

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BWG9Hx/per-tenant-api-keys-isolation/phase2-edge-minion.md`

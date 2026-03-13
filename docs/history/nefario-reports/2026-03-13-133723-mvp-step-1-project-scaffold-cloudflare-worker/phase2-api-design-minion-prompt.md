You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Scaffold a Cloudflare Worker project for the WRL (Web Resource Ledger) MVP. This is Step 1 — nothing exists yet. Deliverables: wrangler.toml, vanilla JS Worker entry point with route dispatch, GET /health endpoint, RFC 9457 error utility, Vitest + @cloudflare/vitest-pool-workers test infrastructure.

Key constraints:
- Plain JavaScript, not TypeScript
- Helix Manifesto: YAGNI, KISS, Lean and Mean
- Cloudflare-native serverless stack
- Manual deploy via `wrangler deploy` (no CI/CD)

## Your Planning Question

For a vanilla JS Worker growing to ~8 routes across 4 endpoints (POST /v1/captures, GET /v1/captures/{id}/status, GET /v1/captures/{id}, GET /v1/verify/{id}, plus GET /health), what is the simplest route dispatch pattern without a router library? Should the RFC 9457 error utility be a separate module or inline? What content-type and status code conventions should be established now so all 7 subsequent implementation steps follow them consistently?

## Context

Full API surface from docs/MVP.md:
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | /v1/captures | API key required | Submit URL for capture (202) |
| GET | /v1/captures/{id}/status | None | Poll progress |
| GET | /v1/captures/{id} | None | Retrieve metadata |
| GET | /v1/verify/{id} | None | Public verification |

Plus GET /health (this step) and eventually GET /.well-known/signing-key (Step 8).

RFC 9457 error shape: `{ type, title, status, detail }` with `Content-Type: application/problem+json`

Step 7 adds content negotiation (Accept: text/html serves HTML instead of JSON for verify endpoint).

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Awa7DQ/mvp-step-1-project-scaffold-cloudflare-worker/phase2-api-design-minion.md`

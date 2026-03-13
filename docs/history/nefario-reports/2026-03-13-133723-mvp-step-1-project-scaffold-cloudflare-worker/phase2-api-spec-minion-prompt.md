You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Scaffold a Cloudflare Worker project for the WRL (Web Resource Ledger) MVP. This is Step 1 — nothing exists yet. Deliverables: wrangler.toml, vanilla JS Worker entry point with route dispatch, GET /health endpoint, RFC 9457 error utility, Vitest + @cloudflare/vitest-pool-workers test infrastructure.

Key constraints:
- Plain JavaScript, not TypeScript
- Helix Manifesto: YAGNI, KISS, Lean and Mean
- Cloudflare-native serverless stack

## Your Planning Question

What is the minimal RFC 9457 `application/problem+json` shape for this API? Should `type` values be URIs (e.g., `about:blank` or `urn:wrl:error:not-found`) or short strings? Should the utility return a full Response object or just the JSON body? What `type` URI scheme makes sense for a small single-worker API? Should we include optional fields like `instance` now or keep to the 4 required fields?

## Context

4 MVP endpoints and their error cases:
- 404: Unknown capture ID (GET /v1/captures/{id}, GET /v1/verify/{id})
- 401: Missing or invalid API key (POST /v1/captures)
- 422: Invalid URL (POST /v1/captures)
- 503: Backpressure/overloaded (global handler, Step 8)
- 405: Method not allowed (any endpoint with wrong method)

RFC 9457 requires: type, title, status, detail
Content-Type: application/problem+json

This utility will be used by all 7 subsequent implementation steps. It needs to be simple enough that every route handler can call it with minimal ceremony.

KISS constraint: the simplest thing that's spec-compliant.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-spec-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-Awa7DQ/mvp-step-1-project-scaffold-cloudflare-worker/phase2-api-spec-minion.md`

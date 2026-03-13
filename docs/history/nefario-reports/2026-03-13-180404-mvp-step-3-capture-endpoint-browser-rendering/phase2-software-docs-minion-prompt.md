You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build a capture endpoint with isolated browser rendering and KV-backed status tracking for a Cloudflare Worker ("wrl"). New API endpoints:
- POST /v1/captures (accepts URL, returns 202 with capture ID)
- GET /v1/captures/{id}/status (returns capture status)

## Your Planning Question

1. OpenAPI spec timing -- should we write the spec contract-first (before implementation) or alongside implementation?
2. What documentation artifacts need updating when these endpoints are added?
3. How to model RFC 9457 error responses and custom JSON successes in OpenAPI?

## Context

- Project is at MVP Step 3. Steps 1-2 are complete (scaffold + URL validation).
- `src/responses.js` defines the RFC 9457 problem response shape: `{ type, status, title, detail }`.
- The 202 response includes capture ID and status URL.
- Status response returns `{ status: "pending"|"complete"|"failed" }`.
- Project follows Helix Manifesto: lean, minimal.
- No OpenAPI spec file exists yet.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: software-docs-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-software-docs-minion.md`

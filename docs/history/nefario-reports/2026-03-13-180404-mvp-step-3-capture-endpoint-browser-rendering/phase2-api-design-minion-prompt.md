You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build a capture endpoint with isolated browser rendering and KV-backed status tracking for a Cloudflare Worker ("wrl"). This includes:
- POST /v1/captures: validate URL via existing SSRF module, check Authorization: Bearer header, return 202 Accepted
- API key from CAPTURE_API_KEY env var
- Capture ID: cap_ + crypto.randomUUID() (hyphens stripped)
- Browser Rendering with screenshot (PNG) and rendered HTML capture
- KV status tracking: pending -> complete/failed
- GET /v1/captures/{id}/status endpoint
- RFC 9457 error responses throughout
- Platform rate limiting (~10/min, ~3 concurrent per IP)

## Your Planning Question

Two new endpoints joining the route table:
1. Exact 202 response body shape -- absolute vs relative status URL? Include additional metadata?
2. Status response -- minimal `{ status }` or include metadata like timestamp, URL?
3. How should `validateUrl()` failures map to HTTP responses via existing `problemResponse()`? The module returns `{ ok: false, status, detail }`.
4. Should rate limit headers be included (backlog [should])?

## Context

Existing codebase:
- `src/index.js` uses a route table: `const routes = [['GET', /pattern/, handler]]`
- `src/responses.js` has `problemResponse(status, detail)` for RFC 9457 and `jsonResponse(body, status)`.
- `validateUrl()` returns `{ ok: false, status: 400|422, detail: string }` on failure.
- Issue specifies: 202 body must include capture ID and status URL, and must state caller is responsible for preserving the capture ID.
- Issue specifies: RFC 9457 404 for unknown capture IDs on status endpoint.
- Backlog: rate limit headers [should], CORS [should].

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-api-design-minion.md`

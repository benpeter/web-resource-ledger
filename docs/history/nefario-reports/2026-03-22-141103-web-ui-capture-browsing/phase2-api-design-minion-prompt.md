You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build a browser-based Web UI for WRL (Web Resource Ledger) capture submission and browsing, served from the existing Cloudflare Worker using vanilla HTML/JS/CSS (no frameworks). Views: capture submission form, capture list, capture detail, auth gate. Must work on mobile.

## Your Planning Question
The UI will consume these endpoints: POST /v1/captures (auth), GET /v1/captures (auth, paginated), GET /v1/captures/:id (no auth), GET /v1/captures/:id/status (no auth), GET /v1/captures/:id/artifacts/screenshot (no auth). Two questions: (1) Since the UI is served from the same Worker origin, same-origin fetch() bypasses CORS entirely. Do we need any CORS changes? (2) The list response includes { items: [{ id, status, url, createdAt, completedAt }], pagination: { offset, limit, total } }. Is this sufficient for a useful list view, or does the UI need fields like thumbnail URLs or verification status that would require API changes?

## Context
Read these files:
- src/index.js (handleListCaptures near line 754, handleGetCapture near line 984, handleCaptureStatus near line 1239)
- src/db.js (rowToCapture function, listCaptures function)
- src/responses.js (response helpers)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nflVKQ/web-ui-capture-submission-browsing/phase2-api-design-minion.md`

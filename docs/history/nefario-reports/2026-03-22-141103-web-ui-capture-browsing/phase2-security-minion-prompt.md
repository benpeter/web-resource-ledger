You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build a browser-based Web UI for WRL (Web Resource Ledger) capture submission and browsing, served from the existing Cloudflare Worker using vanilla HTML/JS/CSS (no frameworks). Views: capture submission form, capture list, capture detail, auth gate. Must work on mobile.

## Your Planning Question
The current auth model is Bearer token API keys (SHA-256 hashed, stored in D1). The UI needs browser-based access to authenticated endpoints (POST /v1/captures, GET /v1/captures). Three options: (a) User pastes API key into a form, stored in localStorage/sessionStorage, sent as Bearer header via fetch(). (b) Session-based auth -- exchange API key for a short-lived session cookie. (c) Something else. What are the security implications of each? Consider: XSS risk with localStorage keys, CSRF with cookies, the existing CSP, and the fact that if the UI is served from the same Worker origin as the API, CORS is not needed at all. Also: should the CORS_ORIGINS config change, or is same-origin sufficient?

## Context
Read these files:
- src/auth.js (full auth implementation)
- src/index.js (CORS handling, getAllowedOrigin function near line 41)
- src/verify-page.js (CSP headers on existing HTML page)
- docs/backlog.md (parking lot item: "[consider] OAuth for web UI")

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nflVKQ/web-ui-capture-submission-browsing/phase2-security-minion.md`

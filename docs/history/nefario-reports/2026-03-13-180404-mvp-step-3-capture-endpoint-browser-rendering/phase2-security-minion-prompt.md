You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build a capture endpoint with isolated browser rendering and KV-backed status tracking for a Cloudflare Worker ("wrl"). This includes:
- POST /v1/captures: validate URL via existing SSRF module, check Authorization: Bearer header, return 202 Accepted
- API key from CAPTURE_API_KEY env var
- Capture ID: cap_ + crypto.randomUUID() (hyphens stripped)
- Browser Rendering: navigate to DNS-pinned IP, capture screenshot (PNG) and rendered HTML
- Browser isolation: fresh incognito context, 30s timeout, 50MB page limit, 200 subresource cap
- HTTP response headers captured via separate Workers fetch to DNS-pinned URL
- KV status tracking: pending -> complete/failed
- GET /v1/captures/{id}/status endpoint
- Platform rate limiting (~10/min, ~3 concurrent per IP) via wrangler.toml

## Your Planning Question

The pipeline chains API key auth, Browser Rendering with untrusted URLs, and a separate `fetch` for HTTP headers. What security boundaries between stages? Specifically:
1. Re-validate URL before the fetch call or trust prior result?
2. Are incognito context + timeout + size limits sufficient browser isolation?
3. Timing-safe API key comparison approach?
4. Capture ID enumeration or status oracle risks in KV?

## Context

Existing codebase:
- `src/url-validation.js` exports `validateUrl(rawUrl, resolvers)` which returns `{ ok: true, url, ip }` or `{ ok: false, status, detail }`. Does DNS pre-resolution and SSRF checks.
- `src/responses.js` has `problemResponse(status, detail)` for RFC 9457 and `jsonResponse(body, status)`.
- `wrangler.toml` has bindings: R2 BUCKET, KV, BROWSER (Browser Rendering).
- Backlog security items: TOCTOU gap mitigation, content security scanning, security monitoring.
- Capture ID uses crypto.randomUUID() (cryptographic randomness) - the ID IS the access secret.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-z2mJgp/mvp-step-3-capture-endpoint-browser-rendering/phase2-security-minion.md`

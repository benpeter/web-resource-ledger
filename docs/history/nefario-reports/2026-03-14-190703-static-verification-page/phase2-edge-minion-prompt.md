You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Browser-accessible verification page for non-technical users. Content negotiation in the existing Cloudflare Worker: if `Accept` header includes `text/html`, serve HTML instead of JSON for `GET /v1/verify/{id}`. Single self-contained HTML string with inlined CSS and vanilla JS. `<noscript>` fallback. No external dependencies, no frameworks, no build step. Zero external HTTP requests from the page.

## Your Planning Question
The `handleVerifyCapture` handler currently always returns JSON. What is the cleanest pattern for adding `Accept: text/html` content negotiation within this handler? Should the HTML rendering be inline in `index.js`, extracted to a separate module (e.g., `src/verify-page.js`), or handled as a template string factory? Consider: the Worker already has a single-file routing pattern; we want to avoid bloating `index.js` with a large HTML template. Also consider security headers — the HTML response needs different Content-Type and potentially different CSP headers than JSON.

## Context
Read the following files to understand the codebase:
- `src/index.js` (routing pattern, `handleVerifyCapture`)
- `src/responses.js` (response helpers)
- `src/verify.js` (verification logic)
- `wrangler.toml` (Worker config)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: edge-minion

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
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ILArQV/static-verification-page/phase2-edge-minion.md`

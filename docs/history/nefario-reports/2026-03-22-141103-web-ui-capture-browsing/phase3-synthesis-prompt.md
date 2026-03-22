MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Build a browser-based Web UI for WRL (Web Resource Ledger) capture submission and browsing. The UI is served from the existing Cloudflare Worker using vanilla HTML/JS/CSS (no frameworks). Success criteria: capture submission form, capture list view, capture detail view, auth flow (API key input), works on mobile, no JS frameworks.

Source: GitHub Issue #47

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nflVKQ/web-ui-capture-submission-browsing/phase2-frontend-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nflVKQ/web-ui-capture-submission-browsing/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nflVKQ/web-ui-capture-submission-browsing/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nflVKQ/web-ui-capture-submission-browsing/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nflVKQ/web-ui-capture-submission-browsing/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nflVKQ/web-ui-capture-submission-browsing/phase2-software-docs-minion.md

## Key consensus across specialists:
- frontend-minion: Hash-based routing with single /ui Worker route; one JS module per view in src/ui/; polling via setTimeout respecting Retry-After
- security-minion: sessionStorage + Bearer header (not cookies); strict CSP; textContent-only rendering; same-origin eliminates CORS changes
- api-design-minion: No CORS changes needed; list response sufficient as-is; optional hasWacz boolean
- ux-strategy-minion: Combined form+list view; inline auth gate with sessionStorage; compact table/stacked cards; reuse verify page design; empty state = the form itself
- test-minion: Three-tier testing -- Vitest worker tests (80%+), optional client-side unit tests, 3-4 E2E Playwright tests
- software-docs-minion: Inline-first docs; light README section; no OpenAPI changes

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. No external skills to integrate.
7. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nflVKQ/web-ui-capture-submission-browsing/phase3-synthesis.md`

## Execution Constraints
- This is a Cloudflare Worker project using vanilla JS (no TypeScript, no build step)
- The project has a design system in src/design-system.css and src/design-system.js
- The existing verify-page.js serves HTML and is the pattern to follow
- The Worker uses D1, R2, KV, Browser API bindings
- Auth is Bearer token API keys (SHA-256 hashed, stored in D1)
- Routes are regex patterns in src/index.js
- All src files are plain .js
- The project philosophy: YAGNI, KISS, lean and mean, no frameworks
- Agent for execution: frontend-minion (sonnet model, bypassPermissions mode)
- Keep task count reasonable (3-5 tasks ideal for this scope)
- Budget 1-2 approval gates maximum

## Key Architecture Decisions to Lock In
1. **Routing**: Hash-based client-side routing (#/captures, #/captures/:id) with single GET /ui Worker route
2. **Auth**: sessionStorage + Bearer header via fetch() -- no cookies, no sessions, no backend auth changes
3. **File structure**: src/ui/ directory with one module per view, assembled by shell module (like verify-page.js pattern but modular)
4. **Polling**: setTimeout respecting Retry-After, cap at 120s, backoff
5. **CORS**: No changes needed (same-origin)
6. **API**: Existing endpoints sufficient; hasWacz boolean is nice-to-have, not required
7. **Testing**: Vitest unit tests on HTML generators (primary); E2E deferred to follow-up if needed

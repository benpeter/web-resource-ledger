You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Optimize capture pipeline: consent timeout, graceful consent failure, adaptive settle.
The current fixed 3s settle delay (SETTLE_DELAY_MS) after page load needs to become adaptive, exiting early when network activity quiets while still capping at 3s.

## Your Planning Question

Design the adaptive settle delay for Cloudflare Workers Browser Rendering (Playwright).
The current approach is a fixed `setTimeout(r, 3000)` after page.goto load event.
The new approach should:
1. Monitor actual network activity after the load event
2. Exit early when no requests have been in-flight for a short quiescence period (e.g., 500ms)
3. Cap at 3000ms maximum regardless of activity
4. Work within Cloudflare's constrained Worker runtime
5. Not be fooled by persistent connections (analytics beacons, ad trackers, websockets)

Key context:
- Playwright's page.waitForLoadState('networkidle') waits for 500ms of no network connections, but it hangs indefinitely on sites with persistent connections (the reason it was replaced with load + fixed settle)
- The route() handler already intercepts all requests for subresource counting
- The Worker has a 30s ctx.waitUntil budget total

Read src/capture.js for the current implementation. Focus on lines 358-459 (defaultRenderer).

## Context

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/optimize-capture-timeline

## Instructions
1. Read src/capture.js to understand the current settle delay and route handler
2. Propose a concrete approach for adaptive settling using Playwright APIs available in Cloudflare's runtime
3. Consider edge cases: sites with persistent connections, slow-loading analytics, websocket upgrades
4. Provide specific code shape recommendations
5. Return your contribution in the structured format

## Domain Plan Contribution: debugger-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-H6iVro/optimize-capture-timeline/phase2-debugger-minion.md

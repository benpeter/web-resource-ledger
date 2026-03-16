You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet -- you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Switch navigation wait strategy from networkidle to load + settle delay in src/capture.js.

Currently `page.goto()` uses `waitUntil: 'networkidle'` which burns 20s of the 30s `ctx.waitUntil` budget waiting for network silence that never comes on ad-heavy sites. The fix: switch to `waitUntil: 'load'` with a post-load settle delay (~3s).

### Constraints
- Use `waitUntil: 'load'` with a post-load settle delay (~3s)
- Must fit within 30s `ctx.waitUntil` hard limit
- NAV_TIMEOUT_MS should be restored to 25s (or justified if kept at 20s)
- Staged fallback from #53 must remain functional

## Your Planning Question

Given the 30s `ctx.waitUntil` hard limit and the pipeline stages (navigation + settle, consent dismissal at 8s, screenshots, WACZ build, R2/KV writes), what is the optimal settle delay duration and where exactly should it be placed in `defaultRenderer()`? Should the settle delay use `page.waitForTimeout()`, `page.waitForLoadState('networkidle')` with a short timeout as a "best effort" settle, or a custom idle detection approach? What are the tradeoffs of each for ad-heavy sites like tagesschau.de and adobe.com?

## Context

Read the full source at:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/load-settle-strategy/src/capture.js (focus on defaultRenderer, lines 343-495)

The 30s budget breakdown currently:
- NAV_TIMEOUT_MS = 20s (networkidle timeout)
- Consent dismissal: 8s hard timeout
- Post work: ~2s (screenshots, WACZ, R2/KV)

With the new strategy (load + settle):
- page.goto('load') should fire in 2-5s for typical sites
- Settle delay: ~3s target
- This frees up significant budget for downstream work

## Instructions
1. Read src/capture.js to understand the current flow
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: debugger-minion

### Recommendations
<your expert recommendations for the settle delay implementation>

### Proposed Tasks
<specific tasks for the execution plan>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<any specialists not yet involved who should be, and why, or "None">

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-SJRIzw/load-settle-strategy/phase2-debugger-minion.md

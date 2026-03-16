You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet -- you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Switch navigation wait strategy from networkidle to load + settle delay in src/capture.js.

Currently `page.goto()` uses `waitUntil: 'networkidle'` which burns 20s of the 30s `ctx.waitUntil` budget. The fix: switch to `waitUntil: 'load'` with a post-load settle delay (~3s). NAV_TIMEOUT_MS will be restored to 25s.

## Your Planning Question

The change from `networkidle` to `load` affects render metadata values in test fixtures (`test/fixtures.js`) and several assertions in `test/capture.test.js`. Should the consent renderers in fixtures.js simply change `waitUntilReached` from `'networkidle'` to `'load'`, or should we add a new renderer variant for the settle-delay behavior? Are there test gaps -- should we add coverage for verifying the settle delay is applied? The error messages referencing "20 seconds" also need updating if NAV_TIMEOUT_MS changes.

## Context

Read the full test files at:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/load-settle-strategy/test/capture.test.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/load-settle-strategy/test/fixtures.js
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/load-settle-strategy/src/capture.js

Key observations:
- fixtures.js has renderers with `waitUntilReached: 'networkidle'` (lines 42, 55)
- capture.test.js line 751: `expect(record.render.waitUntilReached).toBe('networkidle');`
- capture.test.js line 600-605: `enrichedStubRenderer` has `waitUntilReached: 'networkidle'`
- Error messages reference "20 seconds" (lines 141, 290, 508, 713)
- NAV_TIMEOUT_MS is changing from 20000 to 25000

## Instructions
1. Read the test files to understand the current test structure
2. Apply your domain expertise to the planning question
3. Identify all assertions and fixtures that need updating
4. Return your contribution in this format:

## Domain Plan Contribution: test-minion

### Recommendations
<your expert recommendations for test changes>

### Proposed Tasks
<specific tasks for the execution plan>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<any specialists not yet involved who should be, and why, or "None">

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-SJRIzw/load-settle-strategy/phase2-test-minion.md

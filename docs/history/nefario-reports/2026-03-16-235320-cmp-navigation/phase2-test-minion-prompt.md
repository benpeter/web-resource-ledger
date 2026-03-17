You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Fix cross-domain navigation block to allow CMP consent iframes. The route handler in capture.js currently blocks ALL cross-domain navigation requests using `isNavigationRequest()`. This blocks CMP iframes from loading. The fix narrows blocking to main-frame only using `route.request().frame() === page.mainFrame()`.

## Your Planning Question

The route handler (inside `defaultRenderer()`) has zero direct test coverage -- all unit tests use injectable renderer stubs. How should we test the frame-check logic? Options: extract routing into a testable function, or integration tests? What scenarios need coverage: main-frame cross-origin block, iframe cross-origin allow, same-origin allow, BBC redirect? Should we test the routing logic in isolation or rely on integration tests?

## Context

Key files to read:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/cmp-navigation/src/capture.js (lines 340-395 for defaultRenderer and route handler)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/cmp-navigation/test/capture.test.js (existing test patterns)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/cmp-navigation/test/fixtures.js (test fixtures)

The project follows the Helix Manifesto: YAGNI, KISS, test the real boundaries. Mocking the browser is explicitly warned against in CLAUDE.md.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: test-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-E0Ctd0/cmp-navigation/phase2-test-minion.md

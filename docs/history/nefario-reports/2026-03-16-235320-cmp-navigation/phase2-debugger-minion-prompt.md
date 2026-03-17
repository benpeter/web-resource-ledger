You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Fix cross-domain navigation block to allow CMP consent iframes. The route handler in capture.js currently blocks ALL cross-domain navigation requests using `isNavigationRequest()`. The fix uses `route.request().frame() === page.mainFrame()` to only block top-level (main-frame) cross-domain navigations.

## Your Planning Question

The proposed fix uses `route.request().frame() === page.mainFrame()`. In `context.route()` callbacks (registered before page creation at line 392): (1) Does `request.frame()` resolve correctly for requests after page creation? (2) How does Playwright handle the BBC 301 redirect (bbc.com -> bbc.co.uk) -- is the redirect seen as a main-frame navigation request in the route handler? (3) Any edge cases where `request.frame()` returns null? (4) Is there a timing issue where the `page` variable is not yet assigned when the route callback fires?

## Context

Key files to read:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/cmp-navigation/src/capture.js (lines 355-395 for context creation, route registration, and page creation order)

Important: The route is registered at the context level (line 367: `await context.route('**/*', async (route) => {...})`), BEFORE the page is created (line 392: `const page = await context.newPage()`). The `page` variable is used inside the route callback to check `page.mainFrame()`. This means the callback closure captures `page` before it's assigned.

The project uses @cloudflare/playwright which is a fork of Playwright.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: debugger-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-E0Ctd0/cmp-navigation/phase2-debugger-minion.md

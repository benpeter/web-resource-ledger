You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build a browser-based Web UI for WRL (Web Resource Ledger) capture submission and browsing, served from the existing Cloudflare Worker using vanilla HTML/JS/CSS (no frameworks). Views: capture submission form, capture list, capture detail, auth gate. Must work on mobile.

## Your Planning Question
The existing verify-page.js has two test files: verify-page.test.js (tests the HTML generator function) and verify-html.test.js (tests the rendered HTML structure). For a multi-view UI with client-side routing, auth state, and polling, what is the right test strategy? Should we continue with the Vitest pattern (unit tests on generator functions), add integration tests via Playwright for the full browser experience, or both? The existing integration tests (test/integration/) use real Playwright browser captures. How much coverage should the UI get at each level?

## Context
Read these files:
- test/verify-page.test.js (existing unit test pattern)
- test/verify-html.test.js (existing HTML structure test pattern)
- test/integration/ directory (existing Playwright integration tests)
- vitest.config.js or similar test config

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: test-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nflVKQ/web-ui-capture-submission-browsing/phase2-test-minion.md`

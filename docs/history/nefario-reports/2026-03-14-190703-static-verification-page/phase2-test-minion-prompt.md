You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Browser-accessible verification page for non-technical users. Content negotiation in existing Cloudflare Worker: if `Accept` header includes `text/html`, serve HTML instead of JSON for `GET /v1/verify/{id}`. Single self-contained HTML string with inlined CSS and vanilla JS. `<noscript>` fallback. No external dependencies, no frameworks, no build step. Zero external HTTP requests from the page.

## Your Planning Question
The content negotiation logic and HTML page behavior need test strategy before implementation. How should HTML responses be tested in vitest with cloudflare workers test runner? Can `<noscript>` be tested programmatically? Should we unit-test the HTML string generation, integration-test the content negotiation at the HTTP level, or both? What edge cases matter: malformed Accept headers, Accept: */*, Accept: text/html,application/json? How do we test that the rendered HTML contains the right verification data without a browser DOM?

## Context
Read the following files for test patterns:
- `test/` directory — existing test files and patterns
- `vitest.config.js` — test configuration
- `package.json` — test scripts and dependencies
- `src/index.js` — what needs to be tested

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
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
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ILArQV/static-verification-page/phase2-test-minion.md`

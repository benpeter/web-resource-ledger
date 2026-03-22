You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Build a browser-based Web UI for WRL (Web Resource Ledger) capture submission and browsing, served from the existing Cloudflare Worker using vanilla HTML/JS/CSS (no frameworks). Views: capture submission form, capture list, capture detail, auth gate. Must work on mobile.

## Your Planning Question
The UI will be served inline from a Cloudflare Worker (template strings in JS modules, same pattern as verify-page.js at ~800 lines). The design system already exists (design-system.css with tokens, buttons, inputs, cards, tables, badges, alerts, disclosure, data-grid). The constraint is vanilla HTML/JS/CSS -- no frameworks, no build step. Given that we need three views (capture form, capture list, capture detail) plus an auth gate, what is the right client-side routing approach? Specifically: (a) Should we use hash-based routing (#/captures, #/captures/:id) or path-based routing with Worker-side catch-all? (b) How should the JS be structured within Worker template strings to keep each "page" maintainable at scale? (c) What is the right progressive enhancement strategy for the status polling UX (capture submission -> poll status -> show result)?

## Context
Read these files:
- src/verify-page.js (existing 800-line HTML-in-JS pattern)
- src/design-system.css (full component library)
- src/design-system.js (CSS as JS export)
- src/index.js (routes array, first 50 lines)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: frontend-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nflVKQ/web-ui-capture-submission-browsing/phase2-frontend-minion.md`

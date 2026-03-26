You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Automate the vendored autoconsent update process via a GitHub Action. Weekly cron + manual dispatch, version check, npm update, regenerate vendor script, run tests + battery, open PR if tests pass.

## Your Planning Question
The vendoring process is currently manual and undocumented. We need a script that reads `autoconsent.playwright.js` from `node_modules/@duckduckgo/autoconsent`, wraps it as a string export in `src/vendor/autoconsent-script.js`, and updates `AUTOCONSENT_VERSION` in `src/consent.js`. Should this be shell or Node? It must be idempotent and work both locally and in CI. The current vendor file is a single `export default "..."` wrapping ~3700 lines of JS as an escaped string literal.

## Context
Read these files for codebase context:
- `src/vendor/autoconsent-script.js` (first 5 lines — the header/format)
- `src/consent.js` (first 35 lines — AUTOCONSENT_VERSION)
- `package.json` — current autoconsent version
- Check `node_modules/@duckduckgo/autoconsent/` for the source file layout

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/streamed-munching-dragon

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: devx-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nkBysh/autoconsent-update-pipeline/phase2-devx-minion.md`

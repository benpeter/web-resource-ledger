You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Automate the vendored autoconsent update process via a GitHub Action. Weekly cron + manual dispatch, version check, npm update, regenerate vendor script, run tests + battery, open PR if tests pass.

## Your Planning Question
The pipeline runs `npm test` (vitest with workerd runtime, ~8 GB memory) and `npm run test:battery` (live captures against staging, several minutes). What runner type is needed? Should the battery be a separate job or same-job step? What timeout and failure handling strategy — should battery failures block the PR or just be reported as a comment?

## Context
Read these files for codebase context:
- `package.json` — test scripts
- `scripts/test-battery.js` — battery test implementation
- `.github/workflows/ci.yml` — existing CI patterns and runner config
- `.github/workflows/e2e-tests.yml` — E2E test patterns

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/streamed-munching-dragon

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nkBysh/autoconsent-update-pipeline/phase2-test-minion.md`

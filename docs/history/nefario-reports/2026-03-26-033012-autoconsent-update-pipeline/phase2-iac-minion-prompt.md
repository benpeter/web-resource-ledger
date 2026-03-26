You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Automate the vendored autoconsent update process via a GitHub Action. Weekly cron + manual dispatch, version check, npm update, regenerate vendor script, run tests + battery, open PR if tests pass.

## Your Planning Question
What is the best approach for a GitHub Actions workflow that (a) runs on weekly cron + manual dispatch, (b) compares installed vs latest npm package version, (c) runs npm install, a vendoring script, unit tests, and a test battery against staging, and (d) opens a PR only if tests pass? Key sub-questions: how to handle the staging API key secret, what permissions the workflow needs for PR creation and comments, and whether to use `peter-evans/create-pull-request` or `gh pr create`. The repo uses pinned action SHAs — the plan must follow that convention.

## Context
Read these files for codebase context:
- `.github/workflows/ci.yml` — existing CI patterns, pinned SHAs
- `package.json` — dependencies and scripts
- `scripts/test-battery.js` — battery test script (uses WRL_KEY env var)
- `src/consent.js` — AUTOCONSENT_VERSION constant

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/streamed-munching-dragon

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: iac-minion

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-nkBysh/autoconsent-update-pipeline/phase2-iac-minion.md`

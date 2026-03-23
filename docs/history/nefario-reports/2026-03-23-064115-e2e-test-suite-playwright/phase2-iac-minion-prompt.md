# Phase 2: iac-minion Planning Prompt

You are contributing to the PLANNING phase of a multi-agent project. You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

A Playwright-based end-to-end test suite validates the complete WRL user journey against a running staging environment. We need a GitHub Actions workflow (`e2e-tests.yml`) to run these tests, separate from the existing unit test workflow.

## Your Planning Question

Design the `e2e-tests.yml` GitHub Actions workflow. Key questions:

(a) How should Playwright browser binaries be cached to avoid download on every run?

(b) What secrets need to be configured in GitHub Actions for staging access (API key, admin key, OAuth test credentials)?

(c) Should the workflow depend on a successful deployment to staging first, or assume staging is always available?

(d) What's the right trigger -- push to main, PR, manual dispatch, or some combination?

(e) How should test artifacts (screenshots, traces) be uploaded and retained?

(f) Should the workflow use Playwright's built-in sharding for parallelism or is that overkill for 6 tests?

## Context

Read these files for context:
- .github/workflows/ci.yml (existing CI pattern with code-change detection)
- package.json (current deps)
- wrangler.toml (staging env section)

Staging URL: wrl-staging.benpeter.workers.dev
Staging secrets stored in: 1Password WRL vault (Staging item)
Existing smoke test: scripts/smoke-test.sh

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/swift-sprouting-music

## Instructions
1. Read the context files listed above
2. Apply your domain expertise to the planning questions
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and why
5. Return your contribution in this format:

## Domain Plan Contribution: iac-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks for the execution plan>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<or "None">

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase2-iac-minion.md`

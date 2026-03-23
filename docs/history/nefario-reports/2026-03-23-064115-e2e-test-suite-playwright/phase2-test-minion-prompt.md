# Phase 2: test-minion Planning Prompt

You are contributing to the PLANNING phase of a multi-agent project. You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

A Playwright-based end-to-end test suite validates the complete WRL user journey against a running environment (staging). The suite covers signup through verification, batch operations, webhooks, quota enforcement, and public share links. It runs as a separate CI workflow, catching integration regressions that unit tests miss.

Key success criteria:
- Playwright test suite in `tests/e2e/` directory
- 6 user journey tests (signup->capture->verify, batch capture, scheduled capture, webhook delivery, quota enforcement, public verification)
- All tests pass against staging environment (wrl-staging.benpeter.workers.dev)
- Tests complete within 5 minutes total
- Test failures produce screenshots and trace files as artifacts
- Tests are independent (no ordering dependency, can run in parallel)

Critical scope finding: Two tests reference features that don't exist:
1. Scheduled captures -- no cron trigger, no scheduling API exists
2. Share link generation -- no share link API; verify page is already public

## Your Planning Question

Given that WRL is a Cloudflare Workers app tested against a remote staging environment (not a local dev server), what is the right Playwright project configuration? Specifically:

(a) How should auth state be managed across tests -- should the OAuth signup flow run once in a global setup and share session cookies, or should each test independently authenticate via API key?

(b) The OAuth flow involves GitHub OAuth with PKCE and browser redirects -- should we mock GitHub's OAuth endpoint or test against real GitHub (which requires a test GitHub account and real credentials)? Note: the existing `env._githubFetch` injection point only works in-process (vitest), NOT when hitting the real staging Worker over HTTP.

(c) How should the webhook delivery test create a publicly reachable endpoint for callback verification?

(d) What is the recommended approach for the scheduled capture test given that the feature does not exist?

(e) How should test isolation work when all tests hit a shared staging environment with real D1/R2/KV state?

(f) What documentation should be embedded alongside the tests -- a README in `tests/e2e/` explaining how to run locally, required env vars, interpreting results?

## Context

Read these files for context:
- package.json (current deps, scripts)
- vitest.config.js or vitest.config.ts (existing test config)
- test/fixtures.js (auth helpers, GitHub OAuth stubs)
- scripts/smoke-test.sh (existing staging smoke test)
- wrangler.toml (staging env config -- see [env.staging] section)
- src/oauth.js (OAuth flow with env._githubFetch injection point)
- src/index.js (route table -- all API endpoints)
- src/webhook-dispatch.js (webhook delivery with retry schedule)
- src/quotas.js (quota enforcement)
- src/verify-page.js (public verification page)

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/swift-sprouting-music

## Instructions
1. Read the context files listed above
2. Apply your domain expertise to the planning questions
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so and why
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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase2-test-minion.md`

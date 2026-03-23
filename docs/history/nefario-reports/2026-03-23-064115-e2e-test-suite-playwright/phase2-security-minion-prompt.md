# Phase 2: security-minion Planning Prompt

You are contributing to the PLANNING phase of a multi-agent project. You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

A Playwright-based e2e test suite for WRL (a Cloudflare Workers web archival service) needs to authenticate against a remote staging environment. The tests exercise OAuth signup, API-key-based capture, webhook delivery, and quota enforcement.

## Your Planning Question

The e2e tests need to authenticate against staging. Several approaches exist:

(a) Use the admin API to create a test tenant and API key as part of test setup -- this requires the staging ADMIN_KEY in CI secrets.

(b) Pre-provision a dedicated test tenant and store its API key in CI secrets.

(c) For OAuth tests, create a dedicated GitHub OAuth test account or use the existing `env._githubFetch` injection point to mock GitHub's response (but this only works in unit tests, not when hitting the real staging Worker).

What are the security implications of each approach? What secrets should be in GitHub Actions, and how should test cleanup prevent credential leakage or staging data accumulation?

(d) The webhook test receiver (however implemented) will handle HMAC-signed payloads -- what are the security requirements for that receiver (e.g., should the webhook secret be rotated per test run, or is a static test secret acceptable for staging)?

## Context

Read these files for context:
- src/oauth.js (OAuth flow with env._githubFetch injection -- only works in-process)
- test/fixtures.js (existing auth helpers)
- wrangler.toml ([env.staging] section, GITHUB_CLIENT_ID for staging is Ov23li0lii7I7Y43lbUs)
- src/auth.js (API key verification)
- src/admin.js (admin key operations)
- src/webhook-signing.js (HMAC signing for webhook delivery)

Staging has separate D1/R2/KV from production. Secrets stored in 1Password WRL vault (separate Production and Staging items).

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/swift-sprouting-music

## Instructions
1. Read the context files listed above
2. Apply your security domain expertise to the planning questions
3. Identify risks, dependencies, and requirements
4. Return your contribution in this format:

## Domain Plan Contribution: security-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks for the execution plan>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<or "None">

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase2-security-minion.md`

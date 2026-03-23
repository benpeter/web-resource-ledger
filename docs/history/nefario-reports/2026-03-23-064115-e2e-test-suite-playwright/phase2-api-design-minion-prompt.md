# Phase 2: api-design-minion Planning Prompt

You are contributing to the PLANNING phase of a multi-agent project. You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

The webhook delivery test in WRL's e2e test suite needs a publicly reachable endpoint for callback verification.

## Your Planning Question

The webhook delivery test needs a publicly reachable endpoint that can:
(a) Receive POST requests from the staging Worker
(b) Intentionally return 5xx on first attempt to test retry behavior
(c) Succeed on retry
(d) Allow the test to verify the delivered payload and HMAC signature

Three options:
1. Deploy a lightweight Cloudflare Worker as a test webhook receiver with configurable behavior (fail-then-succeed)
2. Use webhook.site or similar SaaS
3. Use a tunnel (ngrok/cloudflared) from the CI runner

Which approach best balances reliability, security, and simplicity?

What about the HMAC signature verification -- should the test receiver validate signatures, or should the Playwright test fetch the delivery log from the receiver and verify client-side?

**Critical constraint**: The webhook retry schedule uses delays of 60s, 300s, 900s. The entire test suite budget is 5 minutes. How can we test retry behavior without waiting for real queue delays?

## Context

Read these files for context:
- src/webhook-dispatch.js (delivery flow with HMAC signing, retry schedule)
- src/webhook-signing.js (SIGNATURE_HEADER, TIMESTAMP_HEADER format)
- src/webhooks.js (CRUD + ping endpoint)
- wrangler.toml (queue config -- webhook queue with max_retries: 3)

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/swift-sprouting-music

## Instructions
1. Read the context files listed above
2. Apply your API design expertise to the planning questions
3. Identify risks, dependencies, and requirements
4. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks for the execution plan>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<or "None">

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wXsjF2/e2e-test-suite-playwright/phase2-api-design-minion.md`

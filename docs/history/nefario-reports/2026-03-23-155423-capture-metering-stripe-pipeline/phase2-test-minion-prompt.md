You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Wire WRL's D1 usage counters into Stripe's meter events API for billing. Test coverage needed for: hourly batch reporting, idempotent meter event submission, free-tier deduction, tiered pricing calculation, dashboard endpoint extension, reconciliation logging, retry on failure.

## Your Planning Question

What test strategy covers the billing pipeline? Boundaries: (1) Idempotent meter reporting with mocked stripeRequest, (2) reconciliation logic, (3) extended dashboard endpoint, (4) cron-triggered batch reporting. How to test hourly reporting in the existing vitest/miniflare setup? What edge cases are critical for a billing-critical path?

## Context

Key codebase files to read:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/test/stripe.test.js (existing Stripe tests)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/test/billing.test.js (existing billing tests)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/test/usage-counters.test.js (existing usage counter tests)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/test/account-usage.test.js (existing account usage tests)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/vitest.config.js (test configuration)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/stripe.js (reportMeterEvent function)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/quotas.js (FREE_CAPTURE_LIMIT = 200)

Test infrastructure:
- Vitest with miniflare for Cloudflare Workers simulation
- D1 in-memory database for testing
- Tests use vi.useFakeTimers() for time control
- Stripe API calls are mocked via vi.mock or globalThis.fetch interception

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

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/phase2-test-minion.md

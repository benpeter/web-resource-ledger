You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Wire WRL's D1 usage counters into Stripe's meter events API for billing. Usage records reported to Stripe for the captures meter at least hourly. First 200 captures/month are free and not reported to Stripe. Idempotent reporting with retry on failure, logged to Coralogix.

## Your Planning Question

What is the best mechanism for hourly batch reporting of D1 usage counters to Stripe's meter events API within Cloudflare Workers constraints? Options: (a) second cron trigger at hourly frequency, (b) piggybacking on the existing per-minute cron with modular hour detection, (c) per-capture real-time reporting via ctx.waitUntil in the queue consumer. Consider: idempotency key generation strategy, retry/failure handling, whether a new KV or D1 table tracks last-reported counts. The existing cron trigger fires every minute for scheduled captures -- can we share it or need a separate one?

## Context

Key codebase files to read:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/wrangler.toml (cron triggers, queue architecture, env bindings)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/scheduler.js (existing cron handler)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/stripe.js (existing reportMeterEvent function)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/index.js lines 195-220 (queue consumer calling incrementUsage)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/db.js lines 748-801 (incrementUsage, getUsage)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/quotas.js (FREE_CAPTURE_LIMIT = 200)

Existing infrastructure:
- Cloudflare Workers with D1 (SQLite), KV, R2, Queues
- Cron trigger fires every minute for scheduled captures
- Queue consumer increments usage_counters in D1 after each capture
- reportMeterEvent() exists in stripe.js but is never called
- usage_counters table: tenant_id, period (YYYY-MM), capture_count, storage_bytes, api_call_count

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
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

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/phase2-iac-minion.md

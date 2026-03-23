You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Wire WRL's D1 usage counters into Stripe's meter events API for billing. Track reported vs actual counts for idempotent reporting and reconciliation. First 200 captures/month free (not reported to Stripe). Metering data reconcilable within 1% tolerance.

## Your Planning Question

What data model additions support idempotent Stripe meter event reporting with reconciliation? Key decisions: (1) Track "last reported capture count" per tenant/period in a new D1 table, new columns, or KV? (2) Idempotency key structure -- {tenantId}:{period}:{captureCount} vs {tenantId}:{period}:{timestamp}? (3) Reconciliation query design (D1 vs Stripe within 1%). (4) Free-tier deduction (first 200) -- computed at reporting time or tracked separately?

## Context

Key codebase files to read:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/migrations/0002_usage_counters.sql (usage_counters table: tenant_id, period, capture_count, storage_bytes, api_call_count)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/migrations/0006_billing.sql (billing columns on tenants table: stripe_customer_id, billing_status, payment_method_added_at)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/db.js lines 748-801 (incrementUsage, getUsage functions)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/quotas.js (FREE_CAPTURE_LIMIT = 200, getEffectiveQuota, checkQuota)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/stripe.js (reportMeterEvent function -- unused currently)

Existing data model:
- usage_counters table: (tenant_id, period) PK, capture_count, storage_bytes, api_call_count
- tenants table: id, stripe_customer_id, billing_status, payment_method_added_at
- Period format: YYYY-MM
- FREE_CAPTURE_LIMIT = 200
- Paid tenants have unlimited captures (Infinity quota), free tenants capped at 200

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: data-minion

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

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/phase2-data-minion.md

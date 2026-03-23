You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Extend the existing consumption dashboard endpoint to show tiered pricing, current charges, and invoice threshold progress. The issue states: "Dashboard endpoint (or web UI panel) shows: captures this period, current charges, applicable price tier, threshold progress."

## Your Planning Question

How should GET /v1/account/usage be extended to include: current charges based on volume discount tiers (free 1-200, EUR 0.05 201-10k, EUR 0.035 10k-100k, EUR 0.015 100k+), applicable price tier indicator, invoice threshold progress, and projected charges? Should tier calculation be server-side (derived from capture count) or fetched from Stripe's upcoming invoice API? What about backward compatibility with existing response shape?

## Context

Key codebase files to read:
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/account.js lines 446-551 (existing handleAccountGetUsage handler and response shape)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/quotas.js (FREE_CAPTURE_LIMIT = 200, quota logic)
- /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl/src/stripe.js (Stripe API helper)

Existing response shape of GET /v1/account/usage:
```json
{
  "tenantId": "...",
  "period": "2026-03",
  "billingStatus": "free|active|grace_period|blocked",
  "hasPaymentMethod": true/false,
  "gracePeriodEnd": null|"ISO8601",
  "captures": { "used": 150, "limit": 200|null, "remaining": 50|null },
  "storageBytes": { "used": ..., "limit": ..., "remaining": ... },
  "resetsAt": "ISO8601"
}
```

Volume discount tiers (from Stripe sandbox config):
- 1-200: free (not billed)
- 201-10,000: EUR 0.05/capture
- 10,001-100,000: EUR 0.035/capture
- 100,001+: EUR 0.015/capture

Invoice threshold: EUR 5 minimum before finalization

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

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

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/phase2-api-design-minion.md

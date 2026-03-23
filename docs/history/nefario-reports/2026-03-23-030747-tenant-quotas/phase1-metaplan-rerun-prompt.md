MODE: META-PLAN

You are creating a revised meta-plan after a team adjustment.

## Task

<github-issue>
**Outcome**: Tenants are subject to usage quotas (captures/month, storage GB) based on their tier. Quota checks happen before expensive operations (browser launch), and tenants can see their usage in the web UI.

**Success criteria**:
- Default quotas defined per tier: free (e.g., 100 captures/month, 1 GB storage), pro (e.g., 5000 captures/month, 50 GB)
- Quota check runs before browser session creation in the capture pipeline
- Exceeding quota returns 429 with `{ "error": "quota_exceeded", "detail": "monthly capture limit reached", "limit": N, "used": N }`
- Per-tenant quota overrides stored in D1 (operator can grant custom limits)
- Web UI usage dashboard shows current period usage vs. quota with a progress bar per metric
- Usage dashboard updates on page load (not real-time; reads from D1 usage counters)
- Quota enforcement is best-effort (eventual consistency of usage counters means slight overages are acceptable)
- Tier assignment is stored per tenant in D1 and defaults to "free" on auto-provisioning

**Scope**:
- In: Tier-based default quotas, pre-capture quota check, 429 quota_exceeded response, per-tenant D1 overrides, web UI usage dashboard, tier field on tenant record
- Out: Automatic tier upgrades (manual or via billing), storage cleanup/eviction on quota breach, per-endpoint API call quotas (only captures and storage for now), quota alerts/notifications

**Constraints**:
- Depends on R25 (usage metering) for counter data and R21 (per-tenant rate limiting) for the rate limit infrastructure
- Quota check must not add >10ms latency to the capture request (single D1 read, cached if possible)
- Must handle race conditions gracefully -- two concurrent captures from the same tenant near quota limit may both proceed; slight overages are acceptable
</github-issue>

## Original Meta-Plan
Read the original meta-plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-b9rn1q/tenant-quotas/phase1-metaplan.md

The original meta-plan was produced for the original team. Use it as context for the revised plan, not as a template to minimally edit.

## Team Adjustment
Added: ux-strategy-minion, software-docs-minion. Removed: none.

Revised team: data-minion, api-design-minion, iac-minion, frontend-minion, security-minion, ux-strategy-minion, software-docs-minion

## Constraints
- Keep the same scope and task description
- Preserve external skill integration decisions unless the team change removes all agents relevant to a skill's domain
- Generate planning consultations for ALL agents in the revised team
- Re-evaluate the cross-cutting checklist against the new team
- Produce output at the same depth and format as the original
- Do NOT change the fundamental scope of the task
- Do NOT add agents the user did not request (beyond cross-cutting requirements)
- Design planning questions as a coherent set -- each question should address aspects that no other agent on the team covers, and questions should reference cross-cutting boundaries where relevant

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/validated-wondering-avalanche

## Instructions
Write your complete revised meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-b9rn1q/tenant-quotas/phase1-metaplan-rerun.md

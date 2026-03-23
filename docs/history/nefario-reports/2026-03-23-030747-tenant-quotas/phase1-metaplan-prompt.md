MODE: META-PLAN

You are creating a meta-plan -- a plan for who should help plan.

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

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/validated-wondering-avalanche

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are discovered, include an "External Skill Integration" section in your meta-plan.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as ORCHESTRATION or LEAF
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution -- planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-b9rn1q/tenant-quotas/phase1-metaplan.md

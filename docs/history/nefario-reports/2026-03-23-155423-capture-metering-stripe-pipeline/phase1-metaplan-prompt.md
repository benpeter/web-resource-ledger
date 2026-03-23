MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
**Outcome**: Usage counters from WRL's metering system feed into Stripe's single capture meter, producing accurate invoices at period end. Tenants see their consumption and current charges on a dashboard. Volume discounts apply automatically at higher usage levels. Invoices are only generated when the €5 threshold is reached.

**Success criteria**:
- Usage records reported to Stripe for the captures meter at least hourly
- Volume discount tiers applied automatically: €0.05 (201-10k), €0.035 (10k-100k), €0.015 (100k+)
- First 200 captures/month are free and not reported to Stripe as billable usage
- Dashboard endpoint (or web UI panel) shows: captures this period, current charges, applicable price tier, threshold progress
- Invoice threshold enforced: Stripe invoice finalization deferred until accumulated charges >= threshold; sub-threshold balances roll over
- Invoices generated automatically at billing period end (if threshold met) with a single line item showing capture count and tiered pricing
- Usage reporting is idempotent (duplicate reports don't double-count)
- Metering data reconcilable: internal counters match Stripe usage records within 1% tolerance
- Failed usage report submissions retried and logged to Coralogix

**Scope**:
- In: Usage record submission to Stripe API (captures only), consumption dashboard data endpoint, volume discount tier configuration, invoice threshold logic, retry on submission failure, reconciliation logging
- Out: Storage or API call metering to Stripe (observability only, not billed), real-time billing, custom invoice templates, credit system

**Constraints**:
- Depends on R25 (metering infrastructure) for the usage counters that feed Stripe
- Depends on R29 (Stripe integration) for customer/meter setup
- Stripe usage records must include idempotency keys to prevent double-billing
- Usage reporting must not be in the capture request hot path; use async submission
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/phase1-metaplan.md

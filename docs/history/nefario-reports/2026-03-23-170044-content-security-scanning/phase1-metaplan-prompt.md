MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
**Outcome**: WRL checks URLs against Google Safe Browsing before capture and periodically re-scans existing captures, preventing the platform from being used to archive or serve known-malicious content. Flagged captures are quarantined with metadata preserved but artifact access restricted.

**Success criteria**:
- Submitted URLs checked against Google Safe Browsing API before capture begins
- Known-malicious URLs rejected with HTTP 422 and a clear error message indicating the threat type
- Background job (Cron Trigger) re-scans existing capture URLs periodically (e.g., daily)
- Flagged captures quarantined: metadata remains accessible, artifact download returns 451 with explanation
- Quarantine status visible in capture metadata (`status: "quarantined"`, `quarantineReason`)
- Coralogix alert fires when flagged-capture count exceeds threshold (e.g., >5 in 24h)
- Safe Browsing API failures degrade gracefully: capture proceeds with `safeBrowsing: "unavailable"` in metadata, not silently skipped
- API key for Safe Browsing stored as Worker secret

**Scope**:
- In: Pre-capture URL screening, background re-scan via Cron Trigger, quarantine status and artifact restriction, Coralogix alerting, graceful degradation on API failure
- Out: Content-level scanning (only URL reputation), tenant appeal/unquarantine workflow, real-time threat feed beyond Safe Browsing, scanning of non-URL content

**Constraints**:
- Depends on R28 (scheduled captures) because recurring captures amplify the abuse surface that this feature mitigates
- Google Safe Browsing Lookup API v4 has quota limits; batch lookups where possible
- Pre-capture check must not add >200ms to capture latency (use Update API with local cache if Lookup API is too slow)
- Quarantine must not delete artifacts; legal/compliance may require preservation
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/cosmic-nibbling-petal

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
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-UZYthD/content-security-scanning/phase1-metaplan.md`

MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

## Backend fixes batch

Small backend improvements that individually don't warrant a full phase session.

### 1. Skip approaching_limit dispatch when already sent (#187)
Captures between 161–200 currently execute unnecessary D1 queries to check if the approaching_limit email was already sent. Short-circuit the `dispatchNotification` call when the notification was already sent this billing period. Eliminates ~2 wasted D1 round-trips per capture for free-tier tenants in the post-notification window.

### 2. Set descriptive Content-Disposition filenames for capture downloads (#181)
Download responses should include a `Content-Disposition` header with a descriptive filename (e.g., `capture-example.com-2026-03-24.wacz`) instead of opaque UUIDs. Filename should include captured domain and date at minimum.

## Constraints
- All existing tests must pass
- New behavior must have test coverage

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/jolly-cooking-dijkstra

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
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9QE2y7/backend-fixes-batch/phase1-metaplan.md

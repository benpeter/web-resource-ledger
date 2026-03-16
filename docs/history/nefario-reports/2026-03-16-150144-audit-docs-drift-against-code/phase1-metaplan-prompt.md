MODE: META-PLAN

You are creating a meta-plan -- a plan for who should help plan.

## Task
Audit documentation for drift against recent code changes

**Outcome**: All project documentation accurately reflects the current state of the codebase after recent issues and PRs, so that developers and users aren't misled by stale instructions, outdated API references, or missing coverage for new features.

**Success criteria**:
- Each recent issue/PR is checked for documentation impact (new features, changed behavior, removed functionality)
- Every identified drift is catalogued with the specific doc file, what's wrong, and the issue/PR that caused it
- All identified documentation gaps are fixed or filed as issues
- README, API docs, and any user-facing guides match current behavior

**Scope**:
- In: All documentation in the repo (README, docs/, inline API docs, configuration references), recent closed issues and merged PRs as the change source
- Out: Evolution log history (those are historical records, not living docs), external documentation hosted outside this repo

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/post-act-1-docs-overhaul

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are discovered, include an "External Skill Integration" section in your meta-plan (see your Core Knowledge for the output format).

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as ORCHESTRATION or LEAF (see External Skill Integration in your Core Knowledge)
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution -- planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ieySxD/audit-docs-drift-against-code/phase1-metaplan.md

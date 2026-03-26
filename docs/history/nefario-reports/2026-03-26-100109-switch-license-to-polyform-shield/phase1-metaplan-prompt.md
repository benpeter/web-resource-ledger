MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
Switch license from Apache 2.0 to PolyForm Shield 1.0.0

**Outcome**: WRL is relicensed under PolyForm Shield 1.0.0, so the source remains fully public but competitors cannot use the code to offer a competing web capture service. No time-based conversion — the protection is permanent.

**Success criteria**:
- LICENSE file contains PolyForm Shield 1.0.0 text
- package.json license field updated to `PolyForm-Shield-1.0.0`
- README references the new license accurately
- CONTRIBUTING.md updated if it references the old license
- No other files still claim Apache 2.0
- Evolution log phase documents the switch with rationale

**Scope**:
- In: LICENSE file, package.json, README, CONTRIBUTING.md, any files referencing "Apache 2.0", evolution log entry
- Out: Adding per-file license headers, CLA setup, license scanning CI

**Constraints**:
- PolyForm Shield 1.0.0 (not FSL, not BSL, not CC)

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are discovered, include an "External Skill Integration" section in your meta-plan (see your Core Knowledge for the output format).

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
5. For each specialist, write a specific planning question that draws on their unique expertise
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-TxlCaJ/switch-license-to-polyform-shield/phase1-metaplan.md`

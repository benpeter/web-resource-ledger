MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

Eliminate silent catch blocks — fail loudly on unexpected errors

All `catch` blocks in the codebase either log the error or handle a specific, named error type. Silent error swallowing (`catch {}` / `catch { /* continue */ }`) is eliminated. Degraded features report distinct status values so operators can distinguish "service unavailable" from "misconfigured."

### Success criteria

- `wacz.js` TSA catch block logs the error to Coralogix and sets `timestampStatus: 'error'` (distinct from `'skipped'` when TSA_URL is not configured and `'present'` on success)
- Audit all other `catch` blocks in `src/` for the same pattern — fix any that silently swallow
- Verification page and API responses surface the three-way status (`present`/`skipped`/`error`)
- No bare `catch {}` or `catch { }` blocks remain in `src/`

### Scope

**In:** Error handling in existing catch blocks, timestampStatus semantics, log entries for degraded paths
**Out:** New retry logic, circuit breakers, alerting rules, changes to the capture pipeline flow

### Context

Issue #66 (DigiCert TSA HTTPS misconfiguration) shipped and was invisible because the `catch` block in `wacz.js:109-113` silently swallows ALL errors — connection refused, DNS failure, misconfigured URL — and sets the same `timestampStatus: 'absent'` as when TSA is intentionally not configured. Operators had no way to distinguish "working as designed" from "broken."

CLAUDE.md now includes the principle: "Fail loudly, degrade intentionally — silent catch blocks are forbidden."

## Working Directory

/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/fail-loudly-2

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
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-XVBmSU/fail-loudly-2/phase1-metaplan.md

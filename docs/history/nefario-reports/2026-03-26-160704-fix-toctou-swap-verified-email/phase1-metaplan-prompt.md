MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
## Context

During Phase 0084 (#199) architecture review, security-minion identified a TOCTOU (time-of-check-time-of-use) gap in `swapVerifiedEmail()` in `src/db.js`.

## Problem

`swapVerifiedEmail()` (line ~1400 of `src/db.js`) executes:
```sql
UPDATE notification_preferences
SET email = pending_email, pending_email = NULL, email_verified = 1
WHERE tenant_id = ? AND pending_email IS NOT NULL
```

The POST handler in `src/email-verify.js` (line 427) cross-checks `prefs.pendingEmail !== email` before calling `swapVerifiedEmail()` (line 441). However, `swapVerifiedEmail()` does not include `AND pending_email = ?` in its WHERE clause.

If `pending_email` changes between the cross-check and the swap (e.g., another request changes the pending email), the wrong email gets promoted.

## Fix

Add `AND pending_email = ?` to the WHERE clause in `swapVerifiedEmail()` and pass the expected email as a parameter. Return `{ ok: false }` if no rows were updated.

## Risk Assessment

- **Likelihood**: Very low. Requires concurrent requests to the same tenant's D1 database. Single-tenant D1 makes this extremely unlikely in practice.
- **Impact**: Medium. Wrong email gets promoted to verified status.
- **Priority**: Low. The existing cross-check catches the common case. Fix when convenient.

## References

- Security review: `docs/evolution/0084-email-verify-tests/decisions.md`
- Test documenting the gap: `test/email-verify.test.js` (stale token test with TOCTOU comment)
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/precious-stirring-creek

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan.

## Codebase Context

The fix touches exactly two source files:
- `src/db.js` line ~1400: `swapVerifiedEmail()` function — add `AND pending_email = ?` parameter
- `src/email-verify.js` line ~441: caller of `swapVerifiedEmail()` — pass the expected email

And one test file:
- `test/email-verify.test.js` line ~343: existing TOCTOU comment to update/remove once fixed

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
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-bocoBm/fix-toctou-swap-verified-email/phase1-metaplan.md`

MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

Add tests for email verification flow (email-verify.js).

Phase 0080 (#195) added the email verification flow with `src/email-verify.js` (token module + GET/POST verification handlers) and the resend handler in `src/notifications.js`. The existing `test/notifications.test.js` was updated for the pending-email PUT behavior, but `email-verify.js` itself has no dedicated test file.

What needs testing:
1. Token generation/verification round-trip
2. Token expiry (reject tokens older than 24 hours)
3. Token replay protection (token for email A cannot verify email B)
4. Domain separation (unsubscribe tokens rejected by verify, and vice versa)
5. Tampered payload/HMAC rejection
6. GET /v1/notifications/verify-email — valid/invalid/expired/missing token renders correct page; always returns 200
7. POST /v1/notifications/verify-email — valid token swaps pending_email to email atomically; invalid token shows error; email mismatch rejects
8. POST /v1/account/notifications/resend-verification — requires session + CSRF; returns 429 within 60s cooldown; returns 400 when no pending_email
9. Notification continuity — notifications continue to old email while verification is pending

Files involved:
- `src/email-verify.js` — token functions + GET/POST handlers
- `src/notifications.js` — resend handler, PUT handler pending-email path
- `test/notifications.test.js` — existing tests (extend or create new file)

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/linear-chasing-alpaca

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan.

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
5. For each specialist, write a specific planning question
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-DWNuqs/email-verify-tests/phase1-metaplan.md`

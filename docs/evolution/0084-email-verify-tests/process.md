# Process — Phase 0084: Email Verify Tests

## TL;DR

A focused test-writing phase that added 31 tests for the email verification flow (issue #199). Two specialists planned (test-minion, security-minion), five mandatory reviewers approved the plan, one execution agent wrote the tests. The security-minion found a TOCTOU gap in `swapVerifiedEmail()` — deferred to a separate issue (#222) since this phase was scoped to tests only. Total: ~25 minutes wall clock.

## Phase 1: Meta-Plan

Nefario identified two specialists for planning:

- **test-minion**: Test strategy, file organization, mocking approach for 24h expiry
- **security-minion**: Token security properties, attack vectors, coverage gaps

Notable exclusions: no UX, docs, observability, or infrastructure specialists needed for a pure test-writing task. Lucy approved the team without adjustment.

## Phase 2: Specialist Planning

Both specialists ran in parallel and returned within ~2 minutes.

**test-minion** recommended:
- Single `test/email-verify.test.js` (matching the `notifications.test.js` pattern)
- Backdated `ts` field + real HMAC signing for expiry tests (proven pattern, no `vi.useFakeTimers()`)
- Resend tests in the new file (group by feature, not URL prefix)
- ~25 tests across 5 describe blocks

**security-minion** recommended:
- Bidirectional domain separation tests (all 3 cross-domain pairs — verify/unsubscribe, verify/session, unsubscribe/verify)
- TOCTOU race condition in `swapVerifiedEmail()` — `WHERE clause` lacks `AND pending_email = ?`
- Skip timing attack tests (platform guarantee)
- Malformed token edge cases (dot-only, multi-dot, missing fields)

**Where they disagreed**: security-minion wanted a production code fix (SQL WHERE clause) alongside the tests. test-minion scoped to tests only. Resolved in synthesis.

## Phase 3: Synthesis

Nefario produced a single-task plan with no approval gates. Key conflict resolution:

**TOCTOU fix**: Deferred. The SQL fix is valid but out of scope for #199. The stale-token test documents the common case, and the TOCTOU requires concurrent requests to exploit — extremely unlikely in single-tenant D1. A GitHub issue (#222) was created to track the fix.

**Static analysis "no email logging" test**: Skipped. Regex scanning source code is fragile. Better enforced by code review convention.

## Phase 3.5: Architecture Review

Five mandatory reviewers, no discretionary:

| Reviewer | Verdict | Key Finding |
|----------|---------|-------------|
| security-minion | ADVISE | TOCTOU needs a tracked issue, not just a comment |
| test-minion | APPROVE | All 9 scenarios covered, approaches sound |
| ux-strategy-minion | APPROVE | Test structure follows natural mental model |
| lucy | ADVISE | Evolution log obligations must be met by orchestrator |
| margo | APPROVE | Proportional scope, good discipline on cuts |

No BLOCKs. The security-minion ADVISE about the tracked issue was addressed by creating #222.

## Phase 4: Execution

Single test-minion agent on sonnet, bypassPermissions mode. The agent:
1. Read all 7 context files
2. Wrote `test/email-verify.test.js` (351 lines)
3. Ran tests — all 31 passed on first try
4. Discovered a subtlety: the resend rate limit test needed to backdate `verification_sent_at` between two PUT calls to avoid the 60-second rate limiter

## Post-Execution

- Code review: 3 reviewers launched (code-review-minion, lucy, margo)
- Tests: 31/31 pass, full suite 1561 pass with no regressions
- Documentation assessment: 0 items (no user-facing changes)

## Human Interventions

None in autonomous mode. All decisions were made by Lucy as the gate proxy:
- Team approval: APPROVE (no adjustment)
- Reviewer approval: auto-approved (no discretionary reviewers)
- Execution plan approval: APPROVE

## Where to Read More

- Evolution log: `docs/evolution/0084-email-verify-tests/`
- Specialist contributions: companion directory alongside the nefario report
- TOCTOU issue: #222

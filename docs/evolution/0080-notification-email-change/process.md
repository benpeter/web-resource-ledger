# Phase 0080: Process

## TL;DR

Nefario orchestration with 4 planning specialists, 5 mandatory reviewers, 3 code reviewers. The central design decision — pending-email vs replace-and-verify — was resolved during planning when data-minion and security-minion provided opposing recommendations. The human approved the synthesis without changes. One code review finding (dead function) was flagged by all 3 code reviewers independently. Total: 3 execution tasks, 1 gate, all tests passing.

## What happened

### Planning phase

Four specialists were consulted:

- **security-minion**: Designed the HMAC token with domain separation, expiry, and email binding. Recommended replace-and-verify approach (overwrite email immediately). Also identified email bombing risk and proposed KV-based rate limiting.
- **api-design-minion**: Designed the endpoint structure. Key insight: verification emails use GET+POST like unsubscribe because email scanners pre-fetch GET URLs. Recommended auto-send on PUT rather than a separate trigger endpoint.
- **data-minion**: Recommended the pending-email approach. Core argument: notifications must never go dark because a user typed a new email. Proposed `pending_email` and `verification_sent_at` columns.
- **frontend-minion**: Designed the verification status UI. Identified the visibilitychange pattern (already used by ui-poll.js) for cross-tab verification detection.

### The central conflict

security-minion recommended replace-and-verify (simpler, but creates a notification blackout). data-minion recommended pending-email (more complex, but no blackout). The synthesis chose pending-email because:

1. The dispatch pipeline suppresses ALL notifications when emailVerified is false
2. A capture failure during the verification window would go unreported
3. Pending-email is the standard SaaS pattern (GitHub, Stripe)
4. security-minion's other recommendations (token design, rate limiting, GET+POST) apply regardless

The human approved without changes.

### Architecture review

5 mandatory reviewers, 0 discretionary:
- **security-minion**: ADVISE — flagged missing email format validation on pending_email and recommended omitting unsubscribe from verification email
- **test-minion**: ADVISE — flagged 9 test gaps including the existing test at notifications.test.js:188 that contradicts pending-email design
- **ux-strategy-minion**: APPROVE — endorsed the pending-email decision
- **lucy**: ADVISE — flagged missing evolution log docs and dead updateEmailDisplay function
- **margo**: APPROVE — confirmed proportionality

### Execution

3 tasks in sequence:
1. **data-minion**: D1 migration + db.js functions (no gate)
2. **security-minion**: Backend verification flow — gated. Human approved.
3. **frontend-minion**: UI verification status block

### Code review

3 reviewers (code-review-minion, lucy, margo). All 3 independently flagged the dead `updateEmailDisplay` function. code-review-minion also caught `escapeHtml(token)` being used in a URL context (should be `encodeURIComponent`). Both fixed.

### Test results

6 existing tests updated for pending-email behavior, 1 UI test updated for new feedback copy. Full suite: 60 files, 1510 tests passing.

## Where to read more

- Specialist contributions: `docs/history/nefario-reports/` (report for this session)
- Scratch files copied to companion directory alongside the report

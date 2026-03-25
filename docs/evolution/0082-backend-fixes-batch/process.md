# Phase 0082: Backend fixes batch — Process

## TL;DR

Two small backend fixes shipped in ~15 minutes of orchestration time. One planning specialist (api-design-minion), five mandatory reviewers, two parallel execution agents. Zero approval gates, zero blocks. The batch pattern worked well for low-risk fixes — the orchestration overhead was proportional to the complexity.

## What Happened

### Planning (Phase 1-2)

Nefario identified this as a minimal-specialist task. Only api-design-minion was consulted for planning, addressing two questions: (1) where to place the notification short-circuit (call site vs dispatch layer), and (2) Content-Disposition filename format conventions.

api-design-minion proposed 4 tasks (extract period helper, add dedup check, build filename helper, wire handler). Nefario consolidated these to 2 tasks during synthesis — the helper extraction was a 1-line inline computation and the filename helper/wiring were inseparable in practice.

Lucy approved the single-specialist team without adjustment. The meta-plan correctly identified that the codebase context was clear enough for one specialist's input plus cross-cutting review.

### Architecture Review (Phase 3.5)

Five mandatory reviewers, no discretionary additions. Two produced ADVISE verdicts:

- **security-minion** caught that the `createdAt` date value went into the Content-Disposition header without sanitization. While the value is expected to be a well-formed ISO date from D1, the principle of not trusting DB values in HTTP headers is sound. One-line fix added to the task prompt.

- **test-minion** warned about test spy wiring — the `runConsumer()` helper passes the bare `env` object, so a naive spy on `dispatchNotification` wouldn't connect to the queue execution path. Also requested coverage for the `screenshot-before` artifact which has unique suffix logic.

lucy, margo, and ux-strategy-minion all APPROVED. The plan was proportional to the problem.

### Execution (Phase 4)

Two iac-minion agents ran in parallel. Both modified `src/index.js` but in completely separate sections (lines 306-328 for notification, lines 1720-1810 for filenames). No merge conflicts.

Task 1 (notification skip) completed with +10 lines in index.js and +50 lines in test/notification-triggers.test.js. The implementation followed the plan exactly — call-site `checkNotificationSent()` before `dispatchNotification()`, with debug-level logging on the skip path.

Task 2 (filenames) completed with +38/-6 lines in index.js and +44 lines in test/capture-retrieval.test.js. The `buildArtifactFilename()` function handles www stripping, ASCII sanitization, date sanitization (per security advisory), and graceful fallback.

All 1530 tests passed on the combined changes.

### Code Review (Phase 5)

Three reviewers: code-review-minion (ADVISE), lucy (APPROVE), margo (APPROVE).

The code-review-minion's ADVISE flagged a pre-existing test at notification-triggers.test.js:233-248 that asserts `Math.floor(FREE_CAPTURE_LIMIT * 0.79) < Math.floor(FREE_CAPTURE_LIMIT * 0.8)` — a tautological arithmetic check that never exercises production code. This was pre-existing, not introduced by this PR. Noted but not fixed (out of scope).

## Agent Arguments and Disagreements

No disagreements. The task was small and well-scoped enough that all specialists converged on the same approach. The only substantive contribution beyond the obvious was security-minion's date sanitization advisory, which was uncontroversial.

## Human Interventions

None. This was run in autonomous mode. Lucy served as the gate decision-maker for team approval, reviewer approval, and execution plan approval — all approved without changes.

## What Was Deliberately Left Alone

- The internal dedup inside `dispatchNotification()` was explicitly not removed, even though the call-site check makes it redundant for the approaching_limit path. It serves as a race-condition safety net.
- The pre-existing vacuous test flagged by code-review-minion was not fixed — out of scope for this issue.
- The certificate download endpoint still uses `certificate-{captureId}.pdf` — it could benefit from domain+date too, but wasn't in the issue scope.

## Where to Read More

- Evolution log: `docs/evolution/0082-backend-fixes-batch/`
- Nefario report: `docs/history/nefario-reports/2026-03-25-234231-backend-fixes-batch.md`
- Working files: `docs/history/nefario-reports/2026-03-25-234231-backend-fixes-batch/`

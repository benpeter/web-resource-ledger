# Outcome

- `classifyBotCheck()` and `readBotCheckSignals()` in `src/capture.js`; the
  check sits after `detectRenderFailure`.
- `recordAttemptError()` and `failCaptureAfterRetries()` in `src/db.js`;
  the dead-letter handler and the catastrophic path use them.
- Dashboard: `submit_failReason()` and the `.capture-fail-reason` style.
- Docs: "Why Captures Fail" in `limits.md`, webhook example updated.
- Tests: `test/failure-reasons.test.js` (23 tests), red first; four older
  tests in `capture.test.js` updated to the new messages. 1756 unit tests pass.
- Not changed: the four existing challenge-page captures from #317 stay as
  they are. A note on their verify pages is a separate item.

## Task: Short-circuit approaching_limit notification dispatch (#187)

### Problem
Free-tier tenants get an `approaching_limit` notification when their capture count hits 80% of the monthly limit. Currently, every capture from count 161-200 calls `dispatchNotification()`, which internally runs 2 D1 queries (load prefs + check dedup) before discovering the notification was already sent. That is ~40 wasted round-trips per tenant per month.

### What to do
Add a call-site pre-check in `src/index.js` using the existing `checkNotificationSent()` function from `src/db.js`. This is a 1-query short-circuit that avoids entering `dispatchNotification()` entirely when the notification was already sent this period.

**DO NOT remove the internal dedup inside `dispatchNotification()`.** It is a correctness guard against race conditions.

### Implementation steps

**Step 1: Add import** - In `src/index.js`, add `checkNotificationSent` to the existing `db.js` import.

**Step 2: Add short-circuit in the queue consumer** - In `src/index.js`, find the approaching_limit block (around lines 306-328). Insert a dedup check after `if (newCount >= threshold) {` and before the `dispatchNotification` call. Compute period as `YYYY-MM` format (must match what `dispatchNotification()` uses internally in `src/email-dispatch.js`). If `checkNotificationSent()` returns true, log at debug level and skip. Otherwise, proceed with existing dispatch.

### Tests
Add tests in `test/notification-triggers.test.js` in the existing describe block.

**IMPORTANT advisory from test-minion**: The `runConsumer()` helper passes the bare `env` object. To verify the short-circuit, you need to check that no messages are enqueued to EMAIL_QUEUE, or spy on `dispatchNotification` import. Check how existing tests verify notification dispatch and follow that pattern. Import `markNotificationSent` from `../src/db.js` for seeding the dedup state.

Test cases:
1. "approaching_limit short-circuit skips dispatchNotification when already sent" -- Seed notification prefs and usage at threshold, mark notification as already sent, run capture through queue consumer. Verify dispatchNotification is NOT called.
2. "approaching_limit dispatches on first crossing even with short-circuit" -- Same setup but do NOT mark as sent. Verify notification IS dispatched.

### Boundaries
- Only modify `src/index.js` (import + queue consumer block)
- Only add tests in `test/notification-triggers.test.js`
- Do NOT modify `src/email-dispatch.js` or `src/db.js`
- Run `npx vitest run test/notification-triggers.test.js` to verify your new tests pass
- Run `npx vitest run` to verify no existing tests break

### Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/jolly-cooking-dijkstra

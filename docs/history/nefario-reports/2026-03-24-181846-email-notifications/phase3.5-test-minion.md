## Test Minion Review: R36 Email Notifications

Verdict: **ADVISE**

---

- [testing]: The capture failure cooldown / KV rate-limit logic in `dispatchNotification` has no test coverage in the plan.
  SCOPE: `src/email-dispatch.js` — `dispatchNotification` capture_failure cooldown path (5-minute KV window, suppress after 3 failures)
  CHANGE: Add tests to `test/email-dispatch.test.js`: (a) first 3 failures within window enqueue, (b) 4th failure within window is suppressed with reason 'cooldown', (c) failure after window expiry enqueues again.
  WHY: This is the most complex suppression path in the dispatch logic and the only one that touches KV rather than D1. Leaving it untested means a KV key naming bug or off-by-one in the counter would silently flood or silence email for the capture failure type. The dedup path (notification_sent) has an explicit test; the cooldown path should too.
  TASK: Task 2

- [testing]: The `handleWeeklyDigest` function has no test for the boundary condition where a tenant has active schedules but zero captures in the past 7 days.
  SCOPE: `test/notification-triggers.test.js` — weekly digest trigger
  CHANGE: Add a test case: tenant with notify_weekly_digest=1 and email_verified=1 but no schedule executions in the lookback window. Verify dispatchNotification is called (digest with empty/zero counts) or is skipped — the plan does not specify which, so the agent will need to decide. A test forces the decision explicitly.
  WHY: An empty digest with a zero-row table could render a broken template (e.g., a table with no rows), crash the template function, or produce a confusing email. This is a realistic edge case for new tenants who have configured but not yet run schedules.
  TASK: Task 3

- [testing]: The trigger tests in Task 3 mock `dispatchNotification` at the call site but there is no test verifying that the `approaching_limit` trigger does NOT fire for a paid tenant (one with billing set up).
  SCOPE: `test/notification-triggers.test.js` — approaching_limit trigger
  CHANGE: Add a test: tenant with a payment method added, capture count >= THRESHOLD — verify dispatchNotification is NOT called. The plan says "Only for free-tier tenants" in the prompt code comment but this guard is not in the test list.
  WHY: If the guard is omitted in implementation, paid tenants get spurious "approaching limit" warnings. The test list only covers firing above/below threshold, not the billing-status gate. Without a negative test, an agent implementing this in a hurry will skip the billing check.
  TASK: Task 3

- [testing]: The unsubscribe endpoint tests do not include a case for an unsubscribe token whose `eventType` is not a known notification column.
  SCOPE: `test/notifications.test.js` — POST /v1/notifications/unsubscribe
  CHANGE: Add test: POST /unsubscribe with a valid HMAC over a payload containing `c: "unknown_type"` — verify it returns 200 (no leakage) but does NOT corrupt the D1 row (the `unsubscribeNotificationType` function should reject unknown column names safely).
  WHY: The `unsubscribeNotificationType` function builds a dynamic column name from the token payload. A forged or outdated token with an unrecognized event type could produce a SQL error or — worse — silently succeed against a column that doesn't exist. The HMAC prevents forgery but not stale tokens with types that have been removed.
  TASK: Task 1

- [testing]: The `email-templates.test.js` plan does not include a test for the weekly digest template when `schedules` has more than 20 entries.
  SCOPE: `test/email-templates.test.js` — `weekly-digest.js` template
  CHANGE: Add test: pass `schedules` array with 21 entries, verify HTML output contains exactly 20 rows and includes the "View all in dashboard" overflow link.
  WHY: The plan explicitly calls for a cap at 20 schedules with a fallback link. Templates are pure functions with no external dependencies — testing this cap is zero cost and prevents a future HTML bloat regression (or a missing overflow link) from reaching production.
  TASK: Task 2

- [testing]: The OAuth email auto-population path (Task 3g) is not covered by any test in the plan.
  SCOPE: `test/notification-triggers.test.js` or a new `test/oauth-email.test.js`
  CHANGE: Add tests: (a) new user with GitHub primary+verified email → notification_preferences row created with email_source='github', email_verified=1; (b) returning user with email_source='github' and changed GitHub email → row updated; (c) returning user with email_source='manual' and different GitHub email → row NOT updated; (d) GitHub returns no primary verified email → email set to null, no crash.
  WHY: This is the primary mechanism for populating tenant emails on first login — without it, most tenants will never receive notifications. The cases are independent and easy to unit-test against a mocked GitHub API response. An absent test here means a regression in the OAuth callback could silently break email delivery for all new signups without any failing test.
  TASK: Task 3

- [testing]: No test verifies that the `List-Unsubscribe` and `List-Unsubscribe-Post` headers are present on the Resend API call in `handleEmailMessage`.
  SCOPE: `test/email-dispatch.test.js` — handleEmailMessage queue consumer
  CHANGE: In the existing "acks on 2xx" test, capture the fetch call body/headers (mock global fetch) and assert both `List-Unsubscribe` and `List-Unsubscribe-Post` headers are in `body.headers`. This is a CAN-SPAM/RFC 8058 compliance requirement — it should be a test, not just an implementation detail.
  WHY: These headers are what makes one-click unsubscribe work in Gmail and Apple Mail. They are easy to accidentally drop during a refactor of the Resend payload. A test that asserts their presence costs two lines and guards a compliance obligation.
  TASK: Task 2

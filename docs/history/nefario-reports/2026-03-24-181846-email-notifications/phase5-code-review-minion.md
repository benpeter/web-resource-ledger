# Code Review: R36 Email Notifications

Reviewer: code-review-minion
Branch: nefario/email-notifications
Lines reviewed: ~6,258 insertions across 33 files

---

## Summary

The notification pipeline itself (dispatch, queue consumer, dedup, unsubscribe tokens, templates, billing hooks) is well-structured with consistent security discipline, no hardcoded secrets, good error boundary coverage, and solid SQL injection prevention. One blocking correctness bug exists in the UI layer: the toggle key format is wrong in both directions (read and write), meaning notification toggles never reflect actual state and all toggle updates are rejected by the API with 400.

---

VERDICT: BLOCK

---

FINDINGS:

---

### BLOCK

- [BLOCK] src/ui/ui-notifications.js:158-170, 459-469 -- **UI toggle keys do not match API schema in either direction**

  The GET `/v1/account/notifications` response shape is:
  ```json
  { "email": "...", "emailVerified": true, "notifications": { "capture_failure": true, ... } }
  ```
  The UI reads `data.preferences` (line 158), which is always `undefined` since the API returns `data.notifications`. It falls back to `defaultPreferences()` which uses camelCase keys (`captureFailures`, `approachingLimit`, etc.) that never match the API's snake_case keys. Result: toggles always render from hardcoded defaults and never reflect the tenant's actual stored preferences.

  On write (line 459-469), a toggle change sends `{ captureFailures: true }` as a top-level body field. The PUT handler at `src/notifications.js:142-146` only allows top-level fields `{ email, notifications }` and returns 400 "Unknown field: 'captureFailures'" for any other key. Result: every toggle click silently fails (the UI reverts on non-2xx but the user sees only an announce message).

  FIX -- Three changes required:

  1. In `buildNotificationsContent`, replace `data.preferences` with `data.notifications`:
     ```js
     var prefs = data.notifications || defaultPreferences();
     ```

  2. Replace all camelCase keys in `defaultPreferences`, `notificationLabel`, `notificationDescription`, and the two `buildToggleSection` call arrays with their snake_case equivalents to match the API:
     ```js
     // defaultPreferences():
     { capture_failure: true, approaching_limit: true, limit_reached: true,
       payment_failure: true, invoice_generated: true, weekly_digest: true }

     // buildToggleSection 'Alerts' keys:
     ['capture_failure', 'approaching_limit', 'limit_reached', 'payment_failure']

     // buildToggleSection 'Summaries' keys:
     ['invoice_generated', 'weekly_digest']
     ```
     Update the label and description maps to use the same snake_case keys.

  3. Wrap the toggle update payload in a `notifications` sub-object (line 459-469):
     ```js
     var payload = { notifications: {} };
     payload.notifications[key] = newValue;
     ```

  The tests in `test/ui-notifications.test.js` test label/description lookups using camelCase keys but do not assert the actual PUT body format or that the API response keys are read correctly. Those tests will need updating too.

---

### ADVISE

- [ADVISE] src/billing.js:403-406 -- **`gracePeriodEnd` in payment failure email recalculates instead of using the newly written value**

  In `handleInvoicePaymentFailed`, the code at line 390-392 calls `setBillingStatus(env.DB, tenant.id, 'grace_period', gracePeriodEnd)` where `gracePeriodEnd` is computed as `Date.now() + 7 days`. The email dispatch at line 403-406 then re-computes this value independently for the `tenant.billingStatus === 'active'` branch. Because these two computations happen at slightly different times (microseconds to milliseconds apart), the `gracePeriodEnd` sent to the email template will differ slightly from what was written to the DB. In practice this is not observable at human timescales, but it is a DRY violation that could matter if the grace period duration changes.

  FIX: Capture the computed `gracePeriodEnd` from the branch that runs `setBillingStatus` and use it directly:
  ```js
  let emailGracePeriodEnd;
  if (tenant.billingStatus === 'active') {
    const gracePeriodEnd = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await setBillingStatus(env.DB, tenant.id, 'grace_period', gracePeriodEnd);
    emailGracePeriodEnd = gracePeriodEnd;
    // ... log
  } else {
    emailGracePeriodEnd = tenant.gracePeriodEnd;
  }
  ctx.waitUntil(dispatchNotification(env, tenant.id, 'payment_failure', {
    gracePeriodEnd: emailGracePeriodEnd,
  }).catch(...));
  ```

- [ADVISE] src/index.js:249-270 -- **`approaching_limit` fires on every successful capture once the threshold is crossed**

  The 80% threshold check (`newCount >= threshold`) fires on _every_ capture after the threshold is crossed, not only when it first crosses. The monthly deduplication in `dispatchNotification` (PERIOD_DEDUP_TYPES includes `approaching_limit`) correctly suppresses repeated sends, but this means `checkQuota`, `checkNotificationSent`, and the `dispatchNotification` guard path all execute on every successful capture for tenants at or above 80%. For tenants with high capture volumes this adds 3 DB reads per capture in the success path.

  This is fine for correctness (dedup works) and probably acceptable at current scale, but the comment says "dispatched when count crosses 80%" which overstates the precision. Consider documenting the actual behaviour: "dispatched at most once per month once count >= 80%". No code change required, but the comment at line 252 should be corrected.

- [ADVISE] src/unsubscribe.js:457 -- **`console.error` instead of `log()` for DB error in unsubscribe handler**

  The defensive `console.error` at line 457 is inconsistent with the rest of the codebase which uses `log(env, ...)` for structured logging to Coralogix. `console.error` output goes to the Workers runtime logs but not to Coralogix, so this error class would be invisible in production observability.

  FIX: Replace with `log(env, 4, 'email', { event: 'email.unsubscribe_db_error', tenantId, eventType, error: dbResult.error })`. Note that `env` and `ctx` are available in scope at that point.

- [ADVISE] src/oauth.js (scope change) -- **`user:email` scope added with no fallback documentation**

  The OAuth scope was extended from `read:user` to `read:user user:email`. Existing GitHub OAuth apps may not have this scope approved and users who authorized the app before this change will not have granted it. The `emailsResponse` handling is already best-effort (non-fatal), so the functional behaviour is correct. However, there is no documentation in `docs/operations/` or `CLAUDE.md` noting that the GitHub OAuth App registration must also grant the `user:email` scope. If the app registration lacks this scope, `emailsResponse.ok` will always be false and the GitHub email auto-population feature will silently never work in production without any error surfacing.

  FIX: Add a note in `docs/operations/` or the evolution log decisions.md that the GitHub OAuth App registration must include the `user:email` scope. Consider logging a warning (severity 4) when `emailsResponse.ok === false` to make this misconfiguration detectable.

---

### NIT

- [NIT] src/notifications.js:240 -- Wrong log subsystem label

  `log(env, 3, 'oauth', { event: 'oauth.notification_prefs_update', ... })` uses the subsystem string `'oauth'` for an event that fires in the notifications handler, not in the OAuth flow. This creates misleading Coralogix queries when filtering by subsystem.

  FIX: Change to `log(env, 3, 'email', { event: 'email.notification_prefs_update', ... })`.

- [NIT] src/email-dispatch.js:52-55 -- **`capture_failure` in `PERIOD_DEDUP_TYPES` comment is slightly misleading**

  The comment says "once per billing month" but the period key is always the calendar month (YYYY-MM based on `getUTCMonth()`), which aligns with the billing period only when billing resets on the 1st of each month. This is correct behaviour but the comment could say "calendar month" rather than "billing month" to avoid confusion.

- [NIT] src/email/templates/capture-failure.js:33 -- **Subject line includes unsanitised URL**

  ```js
  const subject = `Capture failed: ${url || '(unknown)'}`;
  ```
  The `url` value is user-controlled (the target URL of a capture). If a URL contains control characters or newlines it could inject SMTP headers in some mail client implementations. The Resend API likely sanitises this at their end, but applying `escapeHtml` or trimming to a safe length before putting it in the subject would be belt-and-suspenders.

  FIX: `const subject = \`Capture failed: ${(url || '(unknown)').slice(0, 200)}\`;` — or apply the same `escapeHtml` used for the body variables.

- [NIT] src/ui/ui-notifications.js:405-409 -- **`buildToggleSection('Summaries', ...)` groups invoice_generated with weekly_digest**

  Grouping "Invoice generated" under a "Summaries" heading is a minor UX mismatch — invoice notifications are transactional alerts, not summaries. A "Billing" heading would be more accurate. This is low priority (non-blocking, subjective).

---

## Test Coverage Gap

The `test/ui-notifications.test.js` test suite tests label/description string lookups, CSS class presence, and structural function names, but does not test the critical integration contract: that toggle changes send the correctly-shaped body (`{ notifications: { capture_failure: ... } }`) and that the read path maps `data.notifications` to toggle state. Because the tests operate on string inspection and pure helper functions rather than the actual UI interaction flow, the blocking key-format bug went undetected. After fixing the bug, add at least one test that exercises the full PUT payload format by inspecting the `body` argument captured from a mock `apiFetch` call.

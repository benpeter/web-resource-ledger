# Lucy Review: R36 Email Notifications

## VERDICT: BLOCK

Two functional bugs will cause the Notifications UI to silently fail for every user interaction. One template data mismatch will produce broken invoice emails. These must be fixed before merge.

---

## Findings

### [BLOCK] src/ui/ui-notifications.js:459-469 -- Toggle payload uses wrong key format and structure

The toggle change handler sends `{ captureFailures: true }` directly as the request body. The PUT /v1/account/notifications endpoint expects toggle values nested under a `notifications` key with snake_case names (e.g., `{ notifications: { capture_failure: true } }`).

Two problems compound:

1. **Missing wrapper**: The API validates top-level keys against `['email', 'notifications']` (notifications.js:142-147). Sending `{ captureFailures: true }` is an unknown top-level field and returns HTTP 400 with `"Unknown field: 'captureFailures'"`.
2. **Wrong key names**: Even if wrapped, the UI uses camelCase keys (`captureFailures`, `approachingLimit`, etc.) but the API validates against `NOTIFICATION_TYPES` which are snake_case (`capture_failure`, `approaching_limit`, etc.). The API would return 400 with `"Unknown notification type: 'captureFailures'"`.

Every toggle interaction in the UI will fail with a 400 error and revert.

FIX: In `buildToggleRow`, the `keys` array must use snake_case names matching `NOTIFICATION_TYPES`. The payload must be wrapped: `{ notifications: { [key]: newValue } }`. Update `notificationLabel()` and `notificationDescription()` to use snake_case keys. Also update `defaultPreferences()` and `buildNotificationsContent()` to use the same keys. Alternatively, add a camelCase-to-snake_case mapping in the UI.

---

### [BLOCK] src/ui/ui-notifications.js:158 -- API response field name mismatch prevents preference display

`buildNotificationsContent` reads `data.preferences` to get the current toggle states:

```js
var prefs = data.preferences || defaultPreferences();
```

The GET /v1/account/notifications response returns the toggle map under `data.notifications`, not `data.preferences` (notifications.js:87). This means `data.preferences` is always `undefined`, the fallback `defaultPreferences()` is always used, and the UI always shows all toggles as enabled regardless of actual server state.

FIX: Change `data.preferences` to `data.notifications`.

---

### [BLOCK] src/billing.js:364-368 -- invoice_generated template data keys do not match template parameters

The `invoiceGeneratedEmail` template destructures `{ amountFormatted, currency, period, portalUrl, unsubscribeUrl }`. The dispatch call in billing.js passes `{ amountDue, currency, invoiceUrl }`.

Three mismatches:
- `amountDue` instead of `amountFormatted` -- subject line will read `"Invoice generated: undefined"` and the amount field in the email body will be empty.
- `invoiceUrl` instead of `portalUrl` -- the "View Invoice" CTA button will have an empty href.
- `period` is not passed -- the period text in the email body will be empty.

FIX: Either rename the template parameters to match what billing.js sends, or fix the billing.js dispatch to pass the expected keys: `amountFormatted` (format the cents-based `amountDue` into a human-readable string like `"4.75"`), `portalUrl` (use `invoiceUrl` or generate a portal URL), and `period` (compute from the invoice period).

---

### [ADVISE] src/billing.js:403-407 -- payment_failure dispatch missing portalUrl

The `paymentFailureEmail` template destructures `{ gracePeriodEnd, portalUrl, unsubscribeUrl }`. The dispatch at billing.js:403 passes only `{ gracePeriodEnd }`. The "Update Payment Method" CTA button will have an empty href.

FIX: Pass `portalUrl` in the template data, or generate a billing portal URL for the tenant.

---

### [ADVISE] src/email-dispatch.js:364 -- Bare catch swallows Resend response parse error without logging

```js
} catch {
  // Non-fatal: response parse failure does not affect ack decision
}
```

CLAUDE.md requires every catch to "either log the error or handle a specific, named error type." While the comment explains the rationale and the codebase has precedent for this pattern in similar non-fatal cases (oauth.js:303, consent.js:144, index.js:205), this is a queue consumer processing real email deliveries. A parse failure here means the Resend API returned a 2xx with an unexpected body format -- that is operational signal worth capturing.

FIX: Add a debug-level log: `log(env, 3, 'email', { event: 'email.resend_parse_error', tenantId, notificationType })` or at minimum catch with `(err)` and include the error message.

---

### [ADVISE] src/notifications.js:26 -- Unused import of dispatchNotification

`dispatchNotification` is imported but never called in notifications.js. The weekly digest handler calls it indirectly via `sendWeeklyDigestForTenant`, which imports it from email-dispatch.js through the module's own import on line 26.

Wait -- checking again: `sendWeeklyDigestForTenant` on line 332 does call `dispatchNotification` directly, and it's a function defined in the same file. So the import IS used. Disregard this finding.

---

### [NIT] src/ui/ui-notifications.js -- Duplicated CSS in unsubscribe page templates

The unsubscribe confirmation and done pages in `unsubscribe.js` (lines 246-272 and 319-343) contain nearly identical inline CSS blocks. This is consistent with how the codebase handles standalone pages (verify-page.js does the same), so this follows existing patterns. No action needed.

---

## Convention Compliance Summary

| Check | Status |
|-------|--------|
| CLAUDE.md silent catch prohibition | PASS (all catches have comments or log; the Resend parse catch is borderline -- flagged as ADVISE) |
| Email addresses never logged | PASS (email-dispatch.js has explicit "never log msg.body.to" comments; log calls use tenantId only) |
| Helix Manifesto: YAGNI | PASS (no speculative features beyond the stated R36 scope) |
| Helix Manifesto: KISS | PASS (straightforward queue + template architecture, no unnecessary abstraction) |
| Helix Manifesto: Fail loudly | PASS (dispatch errors logged with structured categories; DLQ handler logs at severity 5) |
| Vanilla JS (no frameworks) | PASS (UI uses DOM API, email templates use string concatenation) |
| Codebase patterns (file naming, module structure) | PASS (follows existing patterns from webhooks/webhook-dispatch) |
| Evolution log | PASS (0072-email-notifications directory exists with prompt.md) |
| Migration file present | PASS (0014_notification_preferences.sql) |
| Queue config in wrangler.toml | PASS (EMAIL_QUEUE and EMAIL_DLQ configured for both prod and staging) |
| Cron trigger for weekly digest | PASS (`0 9 * * 1` in both prod and staging triggers) |
| Security: HMAC domain separation | PASS (unsubscribe tokens use "unsub." prefix to prevent cross-use with session cookies) |
| Security: Token verification timing-safe | PASS (uses crypto.subtle.verify) |
| Security: eventType validated before SQL | PASS (checked against NOTIFICATION_TYPES allowlist before any DB operation) |

---

## Blocking Issues Summary

1. **UI toggle payload structure** -- every toggle interaction returns HTTP 400
2. **UI preference display** -- reads wrong response field, always shows defaults
3. **Invoice email template data** -- three field name mismatches produce broken emails

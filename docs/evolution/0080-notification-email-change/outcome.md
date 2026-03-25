# Phase 0080: Outcome

## What was built

Email verification flow for notification email changes. Users can now change their notification email address and verify ownership via a send-verify-click flow.

### New files
- `migrations/0016_email_verification.sql` — adds `pending_email` and `verification_sent_at` columns
- `src/email-verify.js` — HMAC token module (generate/verify) + GET/POST verification endpoint handlers
- `src/email/templates/email-verification.js` — transactional email template (no unsubscribe link)

### Modified files
- `src/db.js` — `setPendingEmail`, `swapVerifiedEmail`, `clearPendingEmail` functions; `rowToNotificationPreferences` returns pending fields
- `src/notifications.js` — PUT handler uses pending-email pattern; new resend-verification handler; GET includes pending fields
- `src/index.js` — 3 new routes, rate limit wiring for verify-email
- `src/ui/ui-notifications.js` — verification status block, resend button with 60s cooldown, visibilitychange cross-tab detection
- `src/ui/ui-css.js` — 2 new CSS classes for verification status layout
- `test/notifications.test.js` — updated 6 tests for pending-email behavior
- `test/ui-notifications.test.js` — updated 1 test for new feedback copy

## Key behaviors
1. **No notification blackout**: Current verified email stays active during verification
2. **Automatic verification send**: PUT with new email triggers verification email immediately
3. **Resend with cooldown**: POST /v1/account/notifications/resend-verification, 60s per-tenant cooldown
4. **Scanner-safe verification**: GET shows confirmation page, POST executes (prevents email scanner auto-verify)
5. **Cross-tab detection**: visibilitychange listener detects verification completed in another tab
6. **Token security**: HMAC with domain separation (`emailverify.`), 24h expiry, email binding, timing-safe verification

## Backlog changes
- Removed: "Email verification sending (send-verify-click flow)" — this phase implements it
- No new backlog items added

## Issues
- Resolves #195

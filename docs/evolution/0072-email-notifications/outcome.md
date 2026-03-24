# Outcome: Email Notifications (R36)

## What Was Built

A complete transactional email notification system for WRL, delivering 6 notification types to tenants via Resend:

1. **Capture failure** — sent when a web capture fails (with error category, timestamp, and link to capture detail)
2. **Approaching free limit** — warning at 80% of free capture limit (160/200)
3. **Free limit reached** — alert when 200 free captures exhausted
4. **Invoice generated** — informational when Stripe finalizes an invoice (amount, period, portal link)
5. **Payment failure** — urgent alert when Stripe payment fails (grace period deadline, billing portal link)
6. **Weekly schedule digest** — Monday 9:00 UTC summary of scheduled capture results

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `migrations/0014_notification_preferences.sql` | 44 | D1 schema: notification_preferences + notification_sent tables |
| `src/email-dispatch.js` | 464 | Dispatch pipeline: preference check, dedup, queue enqueue, Resend delivery, DLQ handling |
| `src/unsubscribe.js` | 476 | HMAC-SHA256 signed unsubscribe tokens, GET confirmation page, POST one-click unsubscribe |
| `src/notifications.js` | 303 | GET/PUT /v1/account/notifications handlers, weekly digest logic |
| `src/email/email-tokens.js` | 53 | Brand constants extracted from design-system.css for inline email CSS |
| `src/email/email-layout.js` | 117 | Shared HTML email layout (table-based, Outlook-compatible) |
| `src/email/templates/capture-failure.js` | ~110 | Capture failure email template (HTML + plain text) |
| `src/email/templates/approaching-limit.js` | ~110 | Approaching limit email template |
| `src/email/templates/limit-reached.js` | ~110 | Limit reached email template |
| `src/email/templates/invoice-generated.js` | 106 | Invoice generated email template |
| `src/email/templates/payment-failure.js` | 97 | Payment failure email template |
| `src/email/templates/weekly-digest.js` | ~140 | Weekly digest email template (with schedule table) |
| `src/ui/ui-notifications.js` | 492 | Notifications tab for web dashboard (vanilla JS) |
| `test/notifications.test.js` | 569 | Preferences API + unsubscribe tests (40 tests) |
| `test/email-dispatch.test.js` | 470 | Dispatch pipeline tests (19 tests) |
| `test/email-templates.test.js` | 465 | Template rendering tests (81 tests) |
| `test/ui-notifications.test.js` | 269 | UI tab tests (40 tests) |
| `test/notification-triggers.test.js` | ~500 | Trigger integration tests (22 tests) |

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/db.js` | +226 lines | NOTIFICATION_TYPES, email validation, 6 DB functions for preferences/dedup |
| `src/index.js` | +~80 lines | Route registration, queue routing, notification triggers (capture failure, approaching/reached limit), weekly digest cron |
| `src/billing.js` | +~60 lines | invoice.finalized + payment_failure notification dispatch, getTenantByStripeCustomerId |
| `src/oauth.js` | +~45 lines | Expanded to `user:email` scope, email auto-population on signup/login |
| `src/log.js` | +2 lines | Email addresses added to NEVER LOG list |
| `wrangler.toml` | +37 lines | Email queue bindings (producer/consumer), staging equivalents, RESEND_API_KEY comment, weekly cron trigger |
| `wrangler.test.toml` | Regenerated | Producers only, no consumers |
| `openapi.yaml` | +290 lines | GET/PUT /v1/account/notifications, GET/POST /v1/notifications/unsubscribe |
| `scripts/provision-alerts.sh` | +82 lines | 2 new Coralogix alerts (email delivery failures, email bounces) |
| `docs/operations/alerts.md` | +46 lines | Alert documentation |
| `docs/backlog.md` | Updated | R36 marked done, deferred items to parking lot |

## Test Coverage

- 55 test files, 1430 tests pass, 2 skipped, 0 failures
- 202 new tests across 5 test files specifically for notifications

## Surprises and Deviations

1. **Cloudflare Email Workers unusable**: Cloudflare's email sending is either private beta (Email Workers) or limited to pre-verified addresses (Email Routing). Resend was the only viable transactional email option.

2. **Free limit threshold differs from issue spec**: Issue says 80/100 and 100/100, but `FREE_CAPTURE_LIMIT = 200` in the codebase. Used codebase value (160/200 threshold, 200/200 limit).

3. **UI key mismatch caught in code review**: Phase 5 found the UI used camelCase keys (`captureFailures`) while the API returned snake_case (`capture_failure`). Also `data.preferences` instead of `data.notifications`. Fixed in round 2.

4. **billing.js invoice data mismatch caught in code review**: Phase 5 found the invoice_generated dispatch passed raw `amountDue` (cents) instead of formatted `amountFormatted`, and `invoiceUrl` instead of `portalUrl` matching the template. Fixed with proper formatting and field mapping.

5. **KV cooldown dropped**: Three reviewers flagged KV-based per-tenant capture failure cooldown as over-engineering. Simplified to monthly period dedup via notification_sent table.

## Backlog Changes

### Completed
- ~~[consider] Notifications~~ (Product Features) — marked DONE

### Added to Parking Lot (Notifications section)
- [consider] Email verification sending (send-verify-click flow)
- [consider] Resend bounce webhook handler
- [consider] Digest frequency configuration (daily, biweekly)
- [consider] SMS/push notification channels
- [consider] Provision RESEND_API_KEY secrets (staging + production)

### Infrastructure Not Yet Provisioned
- `wrangler queues create wrl-emails` / `wrl-emails-dlq` (production)
- `wrangler queues create wrl-emails-staging` / `wrl-emails-dlq-staging` (staging)
- `wrangler secret put RESEND_API_KEY` (both environments)

These are blocked on Resend account creation and are tracked in the parking lot.

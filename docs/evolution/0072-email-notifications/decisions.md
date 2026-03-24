# Decisions: Email Notifications (R36)

## D1: Email Provider — Resend over Cloudflare Email Workers

**Chosen**: Resend (direct REST API, no SDK)
**Over**: Cloudflare Email Workers (private beta/not GA), Cloudflare Email Routing `send_email` binding (can only send to pre-verified account addresses)
**Why**: Resend's free tier (100 emails/day) is sufficient for initial scale. Simple REST API means one `fetch()` call — no npm dependency. Cloudflare's email offerings lack the ability to send transactional email to arbitrary recipients.

## D2: Queue-Based Dispatch over Inline Sending

**Chosen**: Cloudflare Queue (wrl-emails) with DLQ (wrl-emails-dlq)
**Over**: Inline `fetch()` to Resend inside the request handler
**Why**: Queue decouples send latency from the capture/billing request path. Enables retry with backoff on 429/5xx without blocking the caller. Follows the existing webhook dispatch pattern (wrl-webhooks queue). max_concurrency=5 prevents Resend rate limit pressure.

## D3: Column-Per-Type Notification Preferences over JSON Blob

**Chosen**: Individual D1 columns (notify_capture_failure, notify_approaching_limit, etc.)
**Over**: Single JSON column storing preferences
**Why**: Enables efficient fan-out queries (`WHERE notify_weekly_digest = 1 AND email_verified = 1`) without JSON parsing at query time. D1 has no native JSON query support. Column approach also provides CHECK constraints for data integrity.

## D4: Opt-Out Model (All ON by Default)

**Chosen**: All notification types enabled on signup, gated by email verification
**Over**: Opt-in model (all OFF, user enables individually)
**Why**: Maximum value delivery — new users get failure alerts and billing notifications immediately once they verify their email. Follows the established pattern: email must be verified before any notification sends. Each type can be individually disabled via the preferences API.

## D5: HMAC Unsubscribe Tokens Reusing SESSION_SECRET

**Chosen**: HMAC-SHA256 with `unsub.` domain prefix using existing SESSION_SECRET
**Over**: New dedicated UNSUB_SECRET, JWT tokens, database-backed revocation tokens
**Why**: Domain prefix (`unsub.`) prevents cross-use between session cookies and unsubscribe tokens. No new secret to provision and rotate. Stateless verification (no DB lookup on unsubscribe). Follows KISS principle — a new secret adds operational burden for no security benefit.

## D6: RFC 8058 One-Click Unsubscribe with Confirmation Page

**Chosen**: GET renders confirmation page, POST performs unsubscribe (with both List-Unsubscribe and List-Unsubscribe-Post headers)
**Over**: Auto-unsubscribe on GET, POST-only without confirmation
**Why**: RFC 8058 requires POST for programmatic unsubscribe (email clients). GET confirmation page prevents accidental unsubscribes from link prefetchers and email scanners. POST returns 200 for both valid and invalid tokens (no information leakage about token validity).

## D7: Period-Based Dedup over KV Cooldown

**Chosen**: notification_sent D1 table with composite PK (tenant_id, period, event_type) using YYYY-MM format
**Over**: KV-based per-tenant hourly cooldown (initially proposed for capture_failure rate limiting)
**Why**: Three reviewers (lucy, margo, ux-strategy) flagged KV cooldown as over-engineering. Monthly period dedup is simpler and sufficient — at current scale (few tenants), even 3 capture failures per month is tolerable. All dedup uses the same mechanism consistently.

## D8: GitHub OAuth Email Auto-Population

**Chosen**: Expand OAuth scope to `user:email`, fetch primary verified email, auto-populate notification_preferences
**Over**: Manual email entry only
**Why**: Reduces friction for new users — they get a verified email address from GitHub automatically. Respects user autonomy: `email_source = 'github'` entries are updated on login, `email_source = 'manual'` entries are never overwritten. If GitHub returns no primary verified email, email is set to null.

## D9: Invoice Amount Formatting at Dispatch Site

**Chosen**: Format `amount_due` (cents) to `amountFormatted` string at the billing webhook handler before passing to template
**Over**: Pass raw cents to template and format there
**Why**: Template receives ready-to-display data. Keeps templates simple (no arithmetic). Billing period computed from Stripe's `period_start` Unix timestamp. Fixed during Phase 5 code review — original implementation passed raw `amountDue` which would render as "475 EUR" instead of "4.75 EUR".

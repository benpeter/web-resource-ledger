# WRL Coralogix Log Events — Complete Reference

**128 unique events** across 15 subsystems. Severities: 3=INFO, 4=WARN, 5=ERROR, 6=VERBOSE, 7=DEBUG.

---

## Security (`security`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 5 | `security.auth_fail` | Authentication rejected (bad/missing API key or session) |
| 5 | `security.ssrf_block` | URL blocked by SSRF validation (private IP, bad scheme) |
| 5 | `security.invalid_tenant_id` | API key maps to a non-existent tenant |
| 5 | `security.kv_error` | Key-value store error during auth lookup |
| 5 | `signing.key_unavailable` | Signing key not configured (MCP endpoint) |
| 4 | `security.rate_limit` | Request rate-limited (per-IP, per-tenant, admin, artifact, verify, or signing key limiter) |
| 4 | `security.capacity_limit` | Global browser capacity full, 503 returned |
| 4 | `security.quota_exceeded` | Monthly capture or storage quota exceeded |
| 4 | `security.legacy_auth_used` | Request used deprecated auth mechanism |
| 5 | `threatcheck.block` | URL flagged malicious by Google Safe Browsing |
| 4 | `threatcheck.api_fail` | Safe Browsing API call failed (degraded) |
| 4 | `threatcheck.quarantine` | Existing capture quarantined after rescan |
| 4 | `threatcheck.rescan_fail` | Individual rescan check failed |
| 4 | `threatcheck.rescan_degraded` | Rescan API partially unavailable |
| 5 | `threatcheck.rescan_error` | Rescan batch failed entirely |
| 3 | `threatcheck.rescan_tick` | Periodic rescan cron executed |

## Capture (`capture`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `capture.accepted` | Request passed all validation, 202 returned |
| 3 | `capture.enqueued` | Message dispatched to capture queue |
| 3 | `capture.dequeued` | Queue consumer picked up a capture message |
| 3 | `capture.start` | Browser render starting (`performCapture` entry) |
| 3 | `capture.success` | Full capture completed successfully |
| 3 | `capture.partial` | Capture completed but with degraded quality (nav timeout) |
| 3 | `capture.batch` | Batch capture request accepted |
| 6 | `capture.list` | Captures list query (verbose/audit) |
| 4 | `capture.retry` | Capture being retried after failure |
| 4 | `capture.consent_error` | Cookie consent dismissal threw an error |
| 4 | `capture.header_fail` | HTTP header fetch failed (parallel fetch) |
| 4 | `capture.wacz_fail` | WACZ bundle creation failed |
| 4 | `capture.key_archive_fail` | Public key archival to R2 failed |
| 4 | `capture.tsa_fail` | RFC 3161 timestamp request failed (3s timeout) |
| 4 | `capture.qtsa_fail` | eIDAS qualified timestamp request failed (5s timeout) |
| 4 | `capture.threat_check_storage_fail` | Threat check result couldn't be stored in D1 |
| 4 | `capture.diff_headers_parse_fail` | JSON parse error when comparing capture headers |
| 5 | `capture.stage.fail` | Browser render stage failed (with errorCategory + retryable flag) |
| 5 | `capture.fail` | Catch-all unhandled error in capture pipeline |
| 5 | `capture.invalid_message` | Malformed queue message (bad structure/types) |
| 5 | `capture.enqueue_fail` | Queue dispatch failed after accepting request |
| 5 | `capture.batch_enqueue_fail` | Batch capture queue dispatch failed |
| 5 | `capture.kv_create_fail` | D1 record creation failed |
| 5 | `capture.list_fail` | Captures list query threw an error |
| 5 | `capture.dlq` | All retry attempts exhausted, dead-letter queue |

### Default Renderer (`render.default.*`)

Informational logging inside the browser rendering pipeline (`defaultRenderer`).

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `render.default.session_acquired` | Browser session acquired from pool (sessionAcquireMs, orphanContextsClosed) |
| 3 | `render.default.context_ready` | Browser context + page created (contextSetupMs) |
| 3 | `render.default.cross_domain_blocked` | Main-frame cross-domain navigation blocked (blockedUrl) |
| 3 | `render.default.nav_success` | Navigation completed within timeout (navigationMs, subresourceCount, totalBytes) |
| 3 | `render.default.nav_timeout` | Navigation timed out, evaluating DOM state (navigationMs, readyState, totalBytes) |
| 3 | `render.default.nav_no_response` | Zero bytes received, non-retryable (navigationMs) |
| 3 | `render.default.partial_start` | Entering partial capture budget (readyState, budgetMs) |
| 3 | `render.default.partial_complete` | Partial capture succeeded (screenshotMs, contentMs, durationMs) |
| 3 | `render.default.partial_fail` | Partial capture inner error (errorMessage) |
| 3 | `render.default.limit_exceeded` | Subresource or size limit hit (limit, subresourceCount, totalBytes) |
| 3 | `render.default.settle_complete` | Network settlement finished (settleMs, settleReason, pendingAtCap) |
| 3 | `render.default.render_check_fail` | Rendered page is not target content (reason) |
| 3 | `render.default.lazy_load_complete` | Lazy loading scroll completed (scrollMs) |
| 3 | `render.default.viewport_capped` | Viewport height capped for screenshot (originalHeight, cappedHeight) |
| 3 | `render.default.screenshot_before` | Pre-consent screenshot taken (screenshotMs, screenshotBytes) |
| 3 | `render.default.consent_result` | Cookie consent outcome (status, cmp, consentMs, errorName) |
| 3 | `render.default.screenshot_after` | Post-consent screenshot taken or reused (screenshotMs, tookAfterScreenshot, screenshotBytes) |
| 3 | `render.default.content_extracted` | HTML content extracted (contentMs, htmlLength) |
| 3 | `render.default.complete` | Full render pipeline finished (durationMs) |
| 4 | `render.default.cleanup_fail` | Browser context/session cleanup failed (errorMessage) |

## Signing (`signing`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 5 | `signing.key_validation_fail` | Ed25519 private key import/validation failed |

## Verify (`verify`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `verify.request` | Verification request completed (verified=true or false, 200) |
| 4 | `verify.request` | Verification request degraded (rate limited 429, quarantined 451, unsupported 422) |
| 5 | `verify.request` | Verification request failed (R2 error 503, internal error 500) |
| 3 | `signing_key.request` | Single signing key fetch succeeded |
| 4 | `signing_key.request` | Single signing key fetch rate-limited |
| 5 | `signing_key.request` | Single signing key fetch failed |
| 3 | `signing_keys.request` | All signing keys fetch succeeded |
| 4 | `signing_keys.request` | All signing keys fetch rate-limited |

## Diff (`diff`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `diff.computed` | Change summary calculated between captures |
| 4 | `diff.summary_error` | Change summary computation failed |

## Usage (`usage`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `usage.counter_incremented` | Monthly usage counters updated (captures + storage + eIDAS) |
| 4 | `usage.increment_fail` | Usage counter update failed |

## OAuth (`oauth`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `oauth.login_start` | GitHub OAuth flow initiated |
| 3 | `oauth.callback_success` | OAuth callback completed, session created |
| 3 | `oauth.session_create` | New session record written to D1 |
| 3 | `oauth.tenant_create` | New tenant auto-provisioned from OAuth |
| 3 | `oauth.tos_accept` | User accepted Terms of Service |
| 3 | `oauth.usage_view` | User viewed their usage page |
| 3 | `oauth.notification_prefs_update` | User updated email notification preferences |
| 3 | `oauth.key_create` | User created an API key via dashboard |
| 3 | `oauth.key_list` | User listed their API keys |
| 3 | `oauth.key_revoke` | User revoked an API key |
| 3 | `oauth.key_revoke_blocked` | Key revocation blocked (last key protection) |
| 3 | `oauth.logout` | User logged out |
| 4 | `oauth.key_limit_reached` | User hit max API key limit |
| 4 | `oauth.key_revoke_fail` | Key revocation DB error |
| 5 | `oauth.callback_fail` | OAuth callback failed (state mismatch, GitHub API error, etc.) |
| 5 | `oauth.key_create_fail` | API key creation failed |
| 5 | `oauth.first_key_collision` | Auto-generated first API key hash collided |
| 5 | `oauth.logout_delete_error` | Session deletion during logout failed |
| 5 | `oauth.session_user_lookup_error` | Session user lookup threw an error |

## Session (`session`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 5 | `session.db_error` | D1 error during session operations |

## Billing (`billing`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `billing.checkout_created` | Stripe checkout session created |
| 3 | `billing.checkout_completed` | Stripe checkout completed, subscription active |
| 3 | `billing.portal_created` | Stripe customer portal session created |
| 3 | `billing.invoice_finalized` | Stripe invoice finalized |
| 3 | `billing.reactivated` | Subscription reactivated after cancellation |
| 3 | `billing.webhook_unhandled` | Stripe webhook event type not handled (ignored) |
| 4 | `billing.grace_period_started` | Subscription entering grace period before deactivation |
| 4 | `billing.subscription_deleted` | Subscription cancelled/deleted |
| 4 | `billing.webhook_signature_failed` | Stripe webhook signature verification failed |
| 4 | `billing.webhook_tenant_not_found` | Stripe webhook for unknown tenant (no matching customer) |
| 5 | `billing.checkout_error` | Checkout session creation failed |
| 5 | `billing.portal_error` | Customer portal session creation failed |
| 5 | `billing.webhook_handler_error` | Stripe webhook handler threw an error |

## Email (`email`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `email.send` | Email queued to send via Resend |
| 3 | `email.dispatch` | Email dispatch initiated |
| 3 | `email.dispatch_suppressed` | Email suppressed (opt-out, dedup, or cooldown) |
| 3 | `email.verify_send` | Verification email sent to new user |
| 3 | `email.verify_success` | Email address verified successfully |
| 3 | `email.unsubscribe` | User unsubscribed from notifications |
| 3 | `email.digest_start` | Weekly digest email batch started |
| 4 | `email.send_fail` | Email send via Resend failed |
| 4 | `email.dispatch_error` | Email dispatch threw an error |
| 4 | `email.verify_fail` | Email verification failed (bad token, expired, parse error) |
| 4 | `email.verify_rate_limit` | Verification email rate-limited |
| 4 | `email.unsubscribe_parse_error` | Unsubscribe request parse failed |
| 4 | `email.digest_error` | Weekly digest processing error |
| 4 | `email.digest_limit_hit` | Digest batch size limit reached |
| 5 | `email.send_dlq` | Email send permanently failed after retries |
| 5 | `email.dispatch_error` | Critical email dispatch failure |
| 7 | `email.dispatch_skipped` | Email dispatch skipped (callsite dedup, debug-level) |

## Webhook (`webhook`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `webhook.create` | Webhook endpoint registered |
| 3 | `webhook.delete` | Webhook endpoint deleted |
| 3 | `webhook.list` | Webhook endpoints listed |
| 3 | `webhook.ping` | Webhook ping/test sent |
| 3 | `webhook.deliver` | Webhook delivered successfully |
| 3 | `webhook.deliver_fail` | Webhook delivery attempt failed (will retry) |
| 4 | `webhook.deliver_fail` | Webhook delivery failed after retries |
| 4 | `webhook.dispatch_error` | Webhook dispatch threw unexpected error |
| 5 | `webhook.deliver_ssrf_block` | Webhook URL blocked by SSRF check |
| 5 | `webhook.deliver_dlq` | Webhook delivery permanently failed |

## Schedule (`schedule`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `schedule.created` | Scheduled capture created |
| 3 | `schedule.deleted` | Scheduled capture deleted |
| 3 | `schedule.list` | Schedules listed |
| 3 | `schedule.get` | Single schedule fetched |
| 3 | `schedule.tick_start` | Cron tick started (evaluating due schedules) |
| 3 | `schedule.tick_empty` | Cron tick found no due schedules |
| 3 | `schedule.tick_complete` | Cron tick finished |
| 3 | `schedule.execute` | Scheduled capture enqueued |
| 4 | `schedule.execute_skip` | Scheduled capture skipped (e.g. previous still pending) |
| 4 | `schedule.blocked_threat` | Scheduled URL blocked by threat check |
| 5 | `schedule.execute_fail` | Scheduled capture execution failed |
| 5 | `schedule.create_fail` | Schedule creation failed |
| 5 | `schedule.delete_fail` | Schedule deletion failed |
| 5 | `schedule.list_fail` | Schedule list query failed |
| 5 | `schedule.batch_enqueue_fail` | Schedule batch enqueue failed |

## Alert (`alert`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `alert.webhook_received` | Coralogix alert webhook received |
| 3 | `alert.dispatch_sent` | Alert notification forwarded (email/Telegram) |
| 3 | `alert.dispatch_skipped` | Alert notification skipped (unsupported type, dedup, etc.) |
| 4 | `alert.dispatch_error` | Alert notification dispatch failed |
| 5 | `alert.webhook_auth_fail` | Coralogix webhook auth failed |

## Meter (`meter`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `meter.report_cycle_start` | Stripe meter reporting cycle started |
| 3 | `meter.report_success` | Stripe meter event reported successfully |
| 3 | `meter.report_cycle_complete` | Stripe meter reporting cycle finished |
| 5 | `meter.report_fail` | Stripe meter event reporting failed |

## Admin (`admin`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 3 | `admin.list_tenants` | Admin listed all tenants |
| 3 | `admin.get_tenant` | Admin viewed single tenant |
| 3 | `admin.get_overview` | Admin viewed system overview |
| 3 | `admin.key_create` | Admin created an API key |
| 3 | `admin.key_list` | Admin listed tenant keys |
| 3 | `admin.key_revoke` | Admin revoked a key |
| 3 | `admin.key_revoke_blocked` | Admin revocation blocked |
| 3 | `admin.cache_purge` | Admin purged CDN cache |
| 3 | `admin.tenant_config_updated` | Admin updated tenant configuration |
| 3 | `admin.usage_query` | Admin queried usage stats |
| 3 | `tenant.settings_change` | Tenant settings modified |
| 4 | `admin.get_tenant_fail` | Admin tenant lookup failed |
| 4 | `admin.usage_query_fail` | Admin usage query failed |
| 5 | `admin.cache_purge` | CDN cache purge (also logged at error for audit) |
| 5 | `admin.key_create_fail` | Admin key creation failed |

## Pirsch (`pirsch`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 4 | `pirsch.send_fail` | Analytics event send to Pirsch failed |
| 4 | `pirsch.first_capture_check_fail` | First-capture detection query failed |

## Unsubscribe (`unsubscribe`)

| Sev | Event | Meaning |
|-----|-------|---------|
| 5 | `unsubscribe.db_error` | Unsubscribe D1 operation failed |

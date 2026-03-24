# Domain Plan Contribution: api-design-minion

## Recommendations

### 1. Notification Preferences API Surface

#### `GET /v1/tenant/notifications`

Session-gated (same as `/v1/account/*`). Returns the tenant's current notification preferences. Follows the existing `handleGetSettings` pattern in `account.js` -- a simple D1 read returning the current state.

**Response (200):**
```json
{
  "email": "user@example.com",
  "emailVerified": false,
  "emailSource": "github",
  "notifications": {
    "capture_failure":     true,
    "approaching_limit":   true,
    "limit_reached":       true,
    "invoice_generated":   true,
    "payment_failure":     true,
    "weekly_digest":       true
  },
  "updatedAt": "2026-03-24T12:00:00.000Z"
}
```

When no preferences row exists (new tenant), return a synthesized response with all notifications defaulted to `true` (opt-out model -- see rationale below) and `email: null`. The handler should NOT create a row on first read; the row is created lazily on the first PUT.

**Key fields:**
- `email`: The notification delivery address. Nullable -- notifications are not sent until an email is configured.
- `emailVerified`: Whether the address has been verified. Notifications only fire when `true`.
- `emailSource`: `"github"` (auto-populated from OAuth) or `"manual"` (user-supplied override). Informational only.
- `notifications`: Object keyed by event type identifier. Boolean values. Exhaustive -- every known type is always present in the response (no ambiguity about missing keys).

#### `PUT /v1/tenant/notifications`

Session-gated. CSRF-gated (`X-WRL-CSRF` header required, same as other mutations). UPSERT semantics -- creates the preferences row if none exists.

**Request body:**
```json
{
  "email": "user@example.com",
  "notifications": {
    "capture_failure": false,
    "weekly_digest": false
  }
}
```

**Semantics:**
- Both `email` and `notifications` are optional (partial update). If `email` is omitted, the existing email is preserved. If `notifications` is omitted, existing notification states are preserved.
- The `notifications` object uses **merge semantics**: only the keys present in the request body are updated. Keys not mentioned remain unchanged. This avoids requiring clients to send the full set on every update.
- Changing `email` resets `emailVerified` to `false` and triggers a verification email with a signed token. This is critical -- we must not send notifications to an unverified address.
- Setting `email` to `null` explicitly removes the email and disables all notifications (they remain "enabled" in preferences but cannot fire without a verified email).

**Response (200):** Same shape as GET -- returns the full current state after the update.

**Validation:**
- `email`: RFC 5322 basic format check (same approach as webhook URL validation -- reject obviously invalid input, don't try to be a full validator). Maximum 320 chars. Must not be empty string (use `null` to clear).
- `notifications` keys: Must be from the known event type set. Unknown keys are rejected with 400 (same pattern as `handleUpdateSettings` rejecting unknown fields).
- `notifications` values: Must be boolean.
- Unknown top-level fields: Rejected with 400 (same pattern as `handleUpdateSettings`).

#### `POST /v1/notifications/unsubscribe`

**Unauthenticated endpoint.** Accepts a signed token that identifies the tenant + event type. This is the RFC 8058 List-Unsubscribe-Post target.

**Request:** `Content-Type: application/x-www-form-urlencoded` with body `List-Unsubscribe=One-Click` (per RFC 8058). The token comes from a query parameter on the URL: `POST /v1/notifications/unsubscribe?token=<signed_token>`.

**Response:** `200 OK` with a minimal HTML page confirming the unsubscription (email clients may render this), or `302 Found` redirect to `/ui?unsubscribed=capture_failure` for browser-based clicks.

**Token design:** HMAC-SHA256 signed using `SESSION_SECRET` (already available in env). Payload: `tenantId:eventType:expiresAt`. Base64url-encoded. Expiry: 90 days. This avoids needing session auth for one-click unsubscribe (which would break in email clients).

The token does NOT use a separate secret -- reusing `SESSION_SECRET` keeps secret count stable. The token prefix distinguishes it from session tokens: `unsub_<base64url>`.

#### operationId conventions

Following the existing patterns (`handleAccountListKeys`, `handleAccountCreateKey`, etc.):
- `getNotificationPreferences` -- GET /v1/tenant/notifications
- `updateNotificationPreferences` -- PUT /v1/tenant/notifications
- `unsubscribeNotification` -- POST /v1/notifications/unsubscribe

### 2. D1 Schema Design

**Recommendation: Dedicated `notification_preferences` table, NOT a JSON column on `tenants`.**

Rationale: The `tenants.config` JSON column is admin-only (set via `/v1/admin/tenants/:id/config`). Notification preferences are user-facing (session-gated, self-serve). Mixing admin config with user preferences in the same JSON blob creates authorization confusion and makes it impossible to use D1 column-level queries for email delivery targeting ("find all tenants with `capture_failure` enabled and a verified email").

#### Migration: `0014_notification_preferences.sql`

```sql
PRAGMA foreign_keys = ON;

-- Per-tenant notification delivery preferences.
-- One row per tenant. Created lazily on first PUT.
-- email_verified: 0 until confirmed via signed link. Notifications
-- are suppressed (not sent) until email_verified = 1.
-- notification columns default to 1 (opt-out model): tenants receive
-- all notifications unless they explicitly disable them.
CREATE TABLE notification_preferences (
  tenant_id               TEXT    NOT NULL PRIMARY KEY REFERENCES tenants(id),
  email                   TEXT             CHECK (email IS NULL OR (length(email) >= 3 AND length(email) <= 320)),
  email_verified          INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  email_source            TEXT    NOT NULL DEFAULT 'github' CHECK (email_source IN ('github', 'manual')),
  notify_capture_failure  INTEGER NOT NULL DEFAULT 1 CHECK (notify_capture_failure IN (0, 1)),
  notify_approaching_limit INTEGER NOT NULL DEFAULT 1 CHECK (notify_approaching_limit IN (0, 1)),
  notify_limit_reached    INTEGER NOT NULL DEFAULT 1 CHECK (notify_limit_reached IN (0, 1)),
  notify_invoice_generated INTEGER NOT NULL DEFAULT 1 CHECK (notify_invoice_generated IN (0, 1)),
  notify_payment_failure  INTEGER NOT NULL DEFAULT 1 CHECK (notify_payment_failure IN (0, 1)),
  notify_weekly_digest    INTEGER NOT NULL DEFAULT 1 CHECK (notify_weekly_digest IN (0, 1)),
  created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at              TEXT
);
```

**Why individual columns instead of a JSON `notifications` blob:**
- D1 can query `WHERE notify_capture_failure = 1 AND email_verified = 1` efficiently for fan-out dispatch queries.
- Adding a new notification type is a simple `ALTER TABLE ADD COLUMN` with a default value (additive, non-breaking).
- No JSON parsing overhead on the hot path.
- Explicit `CHECK` constraints prevent invalid states.

#### Deduplication table: `notification_sent`

To prevent duplicate threshold notifications within a billing period, a lightweight tracking table:

```sql
-- Tracks which threshold notifications have been sent per tenant per period.
-- Used by quota threshold checks to prevent duplicate sends.
-- Rows are keyed by (tenant_id, period, event_type) -- the same notification
-- type is sent at most once per billing period per tenant.
CREATE TABLE notification_sent (
  tenant_id   TEXT    NOT NULL REFERENCES tenants(id),
  period      TEXT    NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND length(period) = 7),
  event_type  TEXT    NOT NULL,
  sent_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (tenant_id, period, event_type)
);
```

This is simpler than KV-based dedup (which the webhook system uses for Stripe event IDs) because the dedup key is naturally composite and billing-period-scoped. Old rows can be cleaned up with a simple `DELETE WHERE period < ?`.

### 3. Email Address Strategy

**Recommendation: Auto-populate from GitHub on first OAuth login, store in `notification_preferences`, allow manual override.**

Current state: The OAuth flow requests `scope: 'read:user'` and fetches `https://api.github.com/user`, extracting only `id` and `login`. The `user:email` scope is NOT requested, and the GitHub email is NOT stored.

**Proposed change:**
1. Add `user:email` to the OAuth scope (change `scope: 'read:user'` to `scope: 'read:user user:email'` in `oauth.js` line 127).
2. In the OAuth callback, after fetching `/user`, also fetch `https://api.github.com/user/emails` to get the primary verified email.
3. On new user creation, insert a `notification_preferences` row with `email = <github_primary_email>`, `email_source = 'github'`, `email_verified = 1` (GitHub has already verified it).
4. On returning user login, if the `notification_preferences` row has `email_source = 'github'`, update the email if GitHub's primary email has changed (GitHub users can change their email). Do NOT overwrite if `email_source = 'manual'`.

**Why auto-populate:**
- Reduces friction to zero -- notifications work immediately after first login.
- GitHub's primary verified email is already verified by GitHub, so we can trust it without sending our own verification email.
- Users who prefer a different email can override via `PUT /v1/tenant/notifications`.

**Why NOT fetch email on every notification send (fetch from GitHub at runtime):**
- GitHub access token is discarded after OAuth callback (security invariant in `oauth.js`). We have no stored token to call GitHub's API later.
- Runtime GitHub API calls add latency and a failure dependency to notification dispatch.
- Users must be able to use a non-GitHub email address.

### 4. Unsubscribe Endpoint Design

**Recommendation: HMAC-signed token in URL (no session auth required).**

**Rationale:**
- RFC 8058 List-Unsubscribe-Post requires a POST to a URL. Email clients (Gmail, Apple Mail, Outlook) issue this POST automatically when the user clicks "Unsubscribe" -- there is no opportunity for session auth.
- Session-gated unsubscribe would require the user to log in before unsubscribing, which violates CAN-SPAM best practices and creates terrible UX.
- HMAC-signed tokens are the industry standard (Stripe, GitHub, Mailchimp all use this pattern).

**Token structure:**
```
unsub_<base64url(tenantId:eventType:expiresAt:hmac)>
```

- HMAC key: `SESSION_SECRET` (reuse existing secret -- see `webhook-signing.js` pattern for HMAC usage).
- HMAC input: `unsub:${tenantId}:${eventType}:${expiresAt}` (prefix prevents token type confusion).
- Expiry: 90 days from email send time. After expiry, clicking the link shows a "link expired" page with a redirect to `/ui` to manage preferences via the authenticated UI.
- Token verification: constant-time comparison (use `crypto.subtle.verify` or `timingSafeEqual` pattern from `auth.js`).

**Endpoint behavior:**
1. Parse and verify token signature.
2. Check expiry.
3. If valid: update `notification_preferences` to set `notify_{eventType} = 0` for the tenant.
4. Return `200 OK` with minimal HTML body: "You have been unsubscribed from {eventType} notifications." plus a link to `/ui` to manage other preferences.
5. If invalid/expired: `200 OK` with HTML body: "This unsubscribe link has expired. Please log in to manage your notification preferences." (200 not 403 -- email clients should not retry on error).

**RFC 8058 headers on every notification email:**
```
List-Unsubscribe: <https://api.webresourceledger.com/v1/notifications/unsubscribe?token=unsub_xxx>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

### 5. Opt-In Model: Opt-Out (Denylist) with Email Verification Gate

**Recommendation: Default all notification types to ON, require email verification before any email is sent.**

**Rationale:**
- **Opt-out is standard for transactional email.** These are not marketing emails -- they are operational notifications (capture failures, payment failures, billing alerts). CAN-SPAM and GDPR both distinguish transactional from marketing email. Transactional email related to the user's account activity does not require explicit opt-in under GDPR Article 6(1)(b) (performance of a contract) or 6(1)(f) (legitimate interest).
- **The email verification step IS the opt-in gate.** No email is sent until the user has a verified email address. Auto-populating from GitHub (where the email is already verified) counts. Users who override with a manual email must click a verification link first.
- **Opt-in would cause notification blindness.** If all types default to OFF, most tenants will never configure them, and critical billing alerts (payment failure, approaching limit) will go undelivered -- defeating the purpose.
- **Granular opt-out per event type** gives users control without requiring upfront configuration.

### 6. Notification Dispatch Architecture

**Recommendation: Parallel `dispatchNotifications()` function modeled on `dispatchWebhooks()`, using the same `EMAIL_QUEUE`.**

The existing `dispatchWebhooks()` pattern is well-proven:
1. Query D1 for matching notification preferences (email verified + event type enabled).
2. Build the email payload (recipient, subject, HTML body, text body, unsubscribe headers).
3. Enqueue to `EMAIL_QUEUE` (dedicated queue, NOT `WEBHOOK_QUEUE` -- different retry/DLQ characteristics).
4. Queue consumer calls Resend API with retry logic.

**Function signature:**
```js
export async function dispatchNotification(env, tenantId, eventType, templateData) {
  // 1. Check notification_preferences: email_verified=1, notify_{eventType}=1
  // 2. Check notification_sent: not already sent for this period+eventType
  // 3. Build email payload using template for eventType
  // 4. Enqueue to EMAIL_QUEUE
  // 5. Insert notification_sent row (before returning, not after send)
}
```

**Why insert `notification_sent` before enqueue (not after send):**
- At-least-once delivery means the queue consumer may deliver the email and then fail to ack. On retry, it will send again -- this is acceptable (duplicate email is annoying but not harmful).
- But the trigger point (e.g., quota check in `index.js`) may fire on every capture request. Without pre-send dedup, a tenant at 80% usage would get an email on EVERY subsequent capture. Pre-enqueue dedup via `notification_sent` prevents this.
- If the enqueue fails after the `notification_sent` insert, the notification is "lost" for that period. This is acceptable -- the user will still see their usage in the UI. A missing courtesy email is not a data integrity issue.

### 7. Integration Points for Each Notification Type

#### 7a. Capture Failure

**Trigger:** `index.js` lines 239-252 (capture failed, non-retryable) and lines 286-295 (DLQ handler, permanent failure). These are the same sites where `dispatchWebhooks(env, tenantId, 'capture.failed', captureRecord)` is called.

**Integration:** Add `dispatchNotification(env, tenantId, 'capture_failure', { captureId, url, error, failedAt })` in the same `ctx.waitUntil` blocks. This parallels the webhook dispatch -- both fire on the same terminal event.

**No dedup needed:** Capture failures are naturally unique per capture. No risk of duplicate notification for the same capture. However, consider rate-limiting: if a tenant has 50 scheduled captures that all fail, they should NOT get 50 emails. **Recommendation: batch capture failure notifications.** If more than 3 capture failures occur within a 5-minute window, suppress individual emails and send a single digest "N captures failed in the last 5 minutes" email. Implement via a KV counter (`email_cf:{tenantId}:{5min_bucket}`) checked before enqueue.

#### 7b. Approaching Free Limit (80%)

**Trigger:** `index.js` after the `incrementUsage()` call succeeds (line 210-226), when the capture completes successfully. This is where we know the new `captureCount`.

**Integration:** After `incrementUsage`, check if the tenant is on the free tier (no payment method) and if `captureCount >= 160` (80% of 200). If so, call `dispatchNotification(env, tenantId, 'approaching_limit', { used: captureCount, limit: 200, period })`.

**Dedup:** The `notification_sent` table prevents re-sending. Insert `(tenantId, period, 'approaching_limit')` before enqueue. Subsequent captures in the same period skip the notification.

**Why in `index.js` and not `quotas.js`:** The quota check in `quotas.js` is a read-only query that returns allowed/denied. It does not know the post-increment count. The increment happens in `index.js` after capture success. The threshold check must happen AFTER the increment, which is in `index.js`.

#### 7c. Free Limit Reached (100%)

**Trigger:** `quotas.js` `checkQuota()` when it returns `{ allowed: false, reason: 'payment_required' }`. This fires on the capture request that exceeds the limit.

**Integration:** In `index.js`, in the `handleCreateCapture` handler (not the queue consumer), when `checkQuota` returns `payment_required`, call `dispatchNotification(env, tenantId, 'limit_reached', { used, limit, period })` before returning the 402 response.

**Dedup:** Same pattern -- `notification_sent(tenantId, period, 'limit_reached')`.

**Why on the HTTP request path, not the queue consumer:** The quota check happens before enqueue. By the time a message reaches the queue consumer, the quota has already been checked. The 402 is returned to the caller, so the notification dispatch fires in `ctx.waitUntil` alongside the 402 response.

#### 7d. Invoice Generated

**Trigger:** `billing.js` -- currently no `invoice.finalized` or `invoice.created` handler exists. The prompt says "triggered when $5 threshold reached and invoice finalized."

**Integration:** Add a new case in `dispatchWebhookEvent()` for `invoice.created` or `invoice.finalized` (Stripe event type). When this event fires, look up the tenant by `stripeCustomerId`, then call `dispatchNotification(env, tenantId, 'invoice_generated', { amount, currency, invoiceUrl })`.

**Dedup:** Stripe event dedup already handles this (`isEventProcessed(env.KV, event.id)`). No additional dedup needed -- each Stripe invoice event is unique.

#### 7e. Payment Failure

**Trigger:** `billing.js` `handleInvoicePaymentFailed()` (line 342). Already fires when `invoice.payment_failed` arrives from Stripe.

**Integration:** Add `dispatchNotification(env, tenantId, 'payment_failure', { gracePeriodEnd, portalUrl })` after the `setBillingStatus()` call. Use `ctx.waitUntil` to avoid blocking the Stripe webhook response.

**Dedup:** Stripe event dedup handles uniqueness. If a second `invoice.payment_failed` arrives (Stripe retries the payment and it fails again), the tenant SHOULD receive another notification -- the grace period deadline has not changed, but a reminder is appropriate. So no additional dedup -- Stripe's own event dedup is sufficient.

#### 7f. Weekly Schedule Digest

**Trigger:** The existing `scheduled()` handler in `index.js` (line 306-316) runs every minute. The hourly meter reporter already piggybacks on minute 0 (`getUTCMinutes() === 0`).

**Integration:** Add a weekly check: when `getUTCDay() === 1 && getUTCHours() === 9 && getUTCMinutes() === 0` (Monday 9:00 UTC), query all tenants with active schedules and `notify_weekly_digest = 1`, build digest data (captures executed, success/failure count, next scheduled runs), and enqueue one email per tenant.

**Implementation:** New function `handleWeeklyDigest(env, ctx)` in a new `src/notifications.js` module. Called from `scheduled()` with the weekly time gate.

**Dedup:** Natural -- runs once per week, and the `notification_sent` table (with a synthetic period like `2026-W13` for ISO week number) prevents duplicate sends if the cron fires twice in the same minute (edge case but possible with Cloudflare cron triggers).

### 8. Routing and Auth Integration

The new endpoints fit cleanly into the existing routing structure:

```js
// In routes array (index.js):
['GET',    /^\/v1\/tenant\/notifications$/, handleGetNotificationPreferences],
['PUT',    /^\/v1\/tenant\/notifications$/, handleUpdateNotificationPreferences],
['POST',   /^\/v1\/notifications\/unsubscribe$/, handleUnsubscribe],
```

**Auth gating:**
- `GET /v1/tenant/notifications` and `PUT /v1/tenant/notifications`: Session-gated via the existing `/v1/tenant/` prefix check. Wait -- the current session gate checks `/v1/account/` and `/v1/billing/`. The `/v1/tenant/` prefix is NOT currently session-gated.

**Routing decision:** Use `/v1/account/notifications` instead of `/v1/tenant/notifications`. This keeps the endpoint under the existing session-gated `/v1/account/` prefix, requires no routing changes in `index.js`, and follows the established convention (all self-serve session-gated endpoints are under `/v1/account/`).

Updated routes:
```js
['GET',    /^\/v1\/account\/notifications$/, handleGetNotificationPreferences],
['PUT',    /^\/v1\/account\/notifications$/, handleUpdateNotificationPreferences],
// Unsubscribe is OUTSIDE /v1/account/ -- it must be unauthenticated
['POST',   /^\/v1\/notifications\/unsubscribe$/, handleUnsubscribe],
```

The unsubscribe endpoint at `/v1/notifications/unsubscribe` is intentionally outside the `/v1/account/` prefix so it bypasses the session auth gate. This endpoint relies solely on the signed token for authorization.

**Rate limiting:** The unsubscribe endpoint should be rate-limited via `AUTH_RATE_LIMITER` to prevent token-brute-force attacks. Add it to the rate limit group check in `getRateLimitGroup()`.

---

## Proposed Tasks

### Task 1: D1 Migration -- notification_preferences and notification_sent tables
- **Deliverable:** `migrations/0014_notification_preferences.sql`
- **Dependencies:** None
- **Effort:** Small
- **Details:** Create both tables as specified above. Include indexes for the fan-out query pattern (`WHERE email_verified = 1 AND notify_{eventType} = 1`).

### Task 2: OAuth scope change -- add `user:email` and fetch primary email
- **Deliverable:** Changes to `src/oauth.js` (scope string, email fetch in callback, preference row creation)
- **Dependencies:** Task 1 (migration must exist)
- **Effort:** Small
- **Details:** Change `scope: 'read:user'` to `scope: 'read:user user:email'`. Add `/user/emails` fetch. On new user creation, insert `notification_preferences` row. On returning user login with `email_source='github'`, update email if changed.

### Task 3: Notification preferences API handlers
- **Deliverable:** `src/notifications.js` (GET/PUT handlers), route additions in `src/index.js`
- **Dependencies:** Task 1 (migration), existing account.js patterns
- **Effort:** Medium
- **Details:** Follow the `handleGetSettings`/`handleUpdateSettings` pattern. Include field validation, unknown field rejection, CSRF check, email format validation.

### Task 4: Unsubscribe token generation and verification
- **Deliverable:** Token signing/verification functions in `src/notifications.js`, unsubscribe POST handler
- **Dependencies:** Task 1 (migration)
- **Effort:** Medium
- **Details:** HMAC-SHA256 token with `SESSION_SECRET`. Constant-time verification. HTML response for email clients. Rate limiting.

### Task 5: Email verification flow
- **Deliverable:** Verification token generation (on email change), verification endpoint, email template for verification
- **Dependencies:** Task 3 (preferences API), email sending infrastructure (iac-minion's domain)
- **Effort:** Medium
- **Details:** When `PUT /v1/account/notifications` changes the email to a non-GitHub address, send a verification email with a signed token. Clicking the token marks `email_verified = 1`. GitHub-sourced emails skip verification.

### Task 6: `dispatchNotification()` core function
- **Deliverable:** Core dispatch function with preference checking, dedup, payload building, and queue enqueue
- **Dependencies:** Task 1 (migration), email queue (iac-minion's deliverable)
- **Effort:** Medium
- **Details:** Follow `dispatchWebhooks()` pattern. Check preferences, check dedup, build payload, enqueue.

### Task 7: Integration -- capture failure notifications
- **Deliverable:** `dispatchNotification` calls in `index.js` capture failure paths, with rate-limiting logic for burst failures
- **Dependencies:** Task 6
- **Effort:** Small

### Task 8: Integration -- threshold notifications (80% and 100%)
- **Deliverable:** Threshold checks in `index.js` (post-increment for 80%) and capture request handler (for 100%)
- **Dependencies:** Task 6
- **Effort:** Medium
- **Details:** The 80% check requires reading `captureCount` after increment. The 100% check fires when `checkQuota` returns `payment_required`. Both use `notification_sent` for dedup.

### Task 9: Integration -- billing notifications (invoice generated, payment failure)
- **Deliverable:** New Stripe event handler for `invoice.finalized`, `dispatchNotification` call in `handleInvoicePaymentFailed`
- **Dependencies:** Task 6
- **Effort:** Small

### Task 10: Integration -- weekly schedule digest
- **Deliverable:** `handleWeeklyDigest()` function, cron trigger addition in `scheduled()` handler
- **Dependencies:** Task 6
- **Effort:** Medium
- **Details:** Query all tenants with active schedules and digest enabled. Build per-tenant digest data. Enqueue one email per tenant.

### Task 11: OpenAPI spec update
- **Deliverable:** New paths, schemas, and tag in `openapi.yaml`
- **Dependencies:** Tasks 3, 4 (API surface finalized)
- **Effort:** Small

---

## Risks and Concerns

### Risk 1: OAuth Scope Change Requires Re-Authorization
Changing the GitHub OAuth scope from `read:user` to `read:user user:email` does NOT affect existing sessions. However, existing users will not have their email populated until they log in again (the next OAuth callback). This means:
- **New users:** Email auto-populated on first login. Notifications work immediately.
- **Existing users:** No email until next login. Notification preferences will show `email: null` until they re-authenticate or manually set an email.
- **Mitigation:** On the UI, if `email` is null, show a prompt: "Add your email to receive notifications." No data migration needed.

### Risk 2: GitHub Primary Email May Not Exist
Some GitHub users have no public email and may have no verified email (rare but possible with GitHub Enterprise). The `/user/emails` endpoint could return an empty list or no primary email.
- **Mitigation:** If no primary verified email is returned from GitHub, set `email: null` and `email_source: 'github'` in notification preferences. The user must manually provide an email.

### Risk 3: Burst Capture Failure Email Flooding
A tenant with 50 scheduled captures pointed at a down server will generate 50 capture failures within minutes. Without rate limiting, this sends 50 emails.
- **Mitigation:** Capture failure notifications should be batched/suppressed using a KV counter with a 5-minute window. After 3 individual emails, switch to a digest "N more captures failed" email at the end of the window. This adds complexity but is essential for usability.

### Risk 4: Unsubscribe Token Enumeration
If an attacker can enumerate valid unsubscribe tokens, they can unsubscribe arbitrary tenants from notifications. HMAC signing prevents forgery, but a brute-force attack on short tokens is a concern.
- **Mitigation:** Tokens include the full tenantId + eventType + expiresAt, signed with a 256-bit HMAC key. The search space is enormous. Rate limiting on the unsubscribe endpoint provides defense in depth.

### Risk 5: Email Delivery Blocking Critical Paths
Notification dispatch must never block the capture pipeline or Stripe webhook response.
- **Mitigation:** All `dispatchNotification` calls MUST be wrapped in `ctx.waitUntil()`, same as `dispatchWebhooks`. The function itself must never throw -- use try/catch with logging, same as `dispatchWebhooks` does.

### Risk 6: `notification_sent` Table Growth
The dedup table grows by (number of tenants x number of event types) per billing period. At scale (10K tenants, 6 event types), that is 60K rows per month.
- **Mitigation:** Add a periodic cleanup in the `scheduled()` handler: delete rows where `period < currentPeriod - 2` (keep current + previous month). Run monthly.

---

## Additional Agents Needed

- **security-minion**: Must review the unsubscribe token design (HMAC signing, expiry, constant-time comparison), PII implications of storing email addresses in D1, and rate limiting of the unauthenticated unsubscribe endpoint. Already planned in the metaplan.

- **ux-strategy-minion**: Must advise on the default opt-in/opt-out question from a user experience and compliance perspective. My recommendation is opt-out (all ON by default) gated by email verification, but this has UX implications that should be validated. Also needs to weigh in on the capture failure batching threshold (3 emails before switching to digest).

- **frontend-minion**: Must design the email verification flow UX and the notification preferences UI in the web dashboard. The API design is done, but the UI that drives it needs frontend expertise.

- **test-minion**: The notification dispatch spans multiple integration points (quota checks, billing webhooks, capture pipeline, cron triggers). Test strategy for dedup correctness, threshold edge cases, and email sending mocks needs test-minion input.

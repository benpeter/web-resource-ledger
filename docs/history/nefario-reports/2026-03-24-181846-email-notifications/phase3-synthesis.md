## Delegation Plan

**Team name**: wrl-email-notifications
**Description**: Build email notification system for WRL with 6 notification types, notification preferences API, HTML+plaintext templates, Resend delivery via queue, and RFC 8058 unsubscribe handling.

---

### Task 1: D1 Schema + Notification Preferences API + Unsubscribe Endpoint
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: The D1 schema (notification_preferences + notification_sent tables) and API surface (/v1/account/notifications, /v1/notifications/unsubscribe) are hard-to-reverse architectural decisions with downstream dependents (Tasks 2, 3, and 4 all depend on these). Opt-out model, HMAC token design, and column-per-notification-type schema are consequential choices.
- **Gate rationale**: |
    Chosen: Column-per-notification-type in D1 (notify_capture_failure, notify_approaching_limit, etc.) with opt-out model (all ON by default), HMAC-SHA256 unsubscribe tokens using SESSION_SECRET with purpose prefix
    Over: (1) JSON blob for notification preferences (rejected: can't query efficiently for fan-out, no column-level constraints), (2) Opt-in model (rejected: operational/transactional emails default-off means critical billing alerts go undelivered), (3) Opaque DB-stored unsubscribe tokens (rejected: D1 amplification vector from unauthenticated endpoint)
    Why: Column-per-type enables D1 queries for dispatch fan-out, explicit CHECK constraints, and simple ALTER TABLE to add types. HMAC tokens are self-validating without DB lookup, preventing abuse of the unauthenticated unsubscribe endpoint. Opt-out is standard for transactional email and gated by email verification.
- **Prompt**: |
    ## Task: D1 Schema, Notification Preferences API, and Unsubscribe Endpoint

    You are implementing the data layer and API surface for WRL's email notification system. This is a Cloudflare Workers project using D1 (SQLite). Follow the existing patterns in the codebase exactly.

    ### Part A: D1 Migration

    Create `migrations/0014_notification_preferences.sql` with two tables:

    **notification_preferences** -- one row per tenant, created lazily on first PUT:
    - `tenant_id TEXT NOT NULL PRIMARY KEY REFERENCES tenants(id)`
    - `email TEXT` with CHECK (email IS NULL OR (length(email) >= 3 AND length(email) <= 320))
    - `email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1))`
    - `email_source TEXT NOT NULL DEFAULT 'github' CHECK (email_source IN ('github', 'manual'))`
    - Individual boolean columns for each notification type (INTEGER NOT NULL DEFAULT 1, CHECK IN (0,1)):
      - `notify_capture_failure`, `notify_approaching_limit`, `notify_limit_reached`, `notify_invoice_generated`, `notify_payment_failure`, `notify_weekly_digest`
    - `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    - `updated_at TEXT`

    **notification_sent** -- deduplication for threshold notifications:
    - `tenant_id TEXT NOT NULL REFERENCES tenants(id)`
    - `period TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND length(period) = 7)`
    - `event_type TEXT NOT NULL`
    - `sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    - PRIMARY KEY (tenant_id, period, event_type)

    Study the existing migration files in `migrations/` for the exact style (PRAGMA foreign_keys, comment style, etc.).

    ### Part B: Data Access Functions in src/db.js

    Add these functions to `src/db.js`, following the existing patterns (getCapture, createCapture, etc.):

    - `getNotificationPreferences(db, tenantId)` -- returns the row or null
    - `upsertNotificationPreferences(db, tenantId, fields)` -- UPSERT with partial update semantics (only provided fields are changed)
    - `unsubscribeNotificationType(db, tenantId, eventType)` -- sets the `notify_{eventType}` column to 0
    - `checkNotificationSent(db, tenantId, period, eventType)` -- returns true if row exists
    - `markNotificationSent(db, tenantId, period, eventType)` -- INSERT OR IGNORE
    - `deleteNotificationPreferences(db, tenantId)` -- for right-to-erasure

    Email validation at write time: reject CRLF characters (\r, \n), null bytes, and enforce max 254 chars. Use this regex for format validation:
    ```js
    const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    ```

    ### Part C: Notification Preferences API Handlers

    Create `src/notifications.js` with handlers following the `src/account.js` patterns exactly:

    **GET /v1/account/notifications** (session-gated):
    - Read from notification_preferences. If no row exists, return synthesized defaults (all true, email null).
    - Response shape: `{ email, emailVerified, emailSource, notifications: { capture_failure: true, ... }, updatedAt }`

    **PUT /v1/account/notifications** (session-gated, CSRF-gated):
    - Partial update: both `email` and `notifications` fields are optional. The `notifications` object uses merge semantics (only mentioned keys are updated).
    - Changing `email` resets `emailVerified` to false and sets `emailSource` to 'manual'.
    - Setting `email` to null clears it.
    - Validate: reject unknown top-level fields (same pattern as handleUpdateSettings). Validate notification keys against the known set. Validate boolean values.
    - Response: full current state after update.

    **Route registration in src/index.js**: Add routes under the existing session-gated `/v1/account/` prefix:
    ```js
    ['GET',    /^\/v1\/account\/notifications$/, handleGetNotificationPreferences],
    ['PUT',    /^\/v1\/account\/notifications$/, handleUpdateNotificationPreferences],
    ```

    ### Part D: Unsubscribe Token Module and Endpoint

    Create `src/unsubscribe.js` with HMAC-SHA256 token generation and verification:

    **Token design:**
    - Payload: JSON `{ t: tenantId, c: eventType, v: 1 }` (no expiry -- CAN-SPAM requires 30+ day validity, and there is no business reason to expire)
    - HMAC input: `unsub.{base64url(payload)}` -- the `unsub.` prefix prevents cross-use with session cookies
    - Token format: `{base64url(payload)}.{base64url(hmac)}`
    - Use `crypto.subtle` for HMAC-SHA256, reusing the `SESSION_SECRET` key (study `src/session.js` for the importHmacKey pattern)
    - Verification must be timing-safe (use `crypto.subtle.verify`)

    **Unsubscribe endpoints:**

    `GET /v1/notifications/unsubscribe?token=...` (unauthenticated):
    - Renders a confirmation page with a form that POSTs (does NOT auto-unsubscribe -- email security scanners make GET requests)
    - Returns 200 with HTML for both valid and invalid tokens (no information leakage)
    - Build the HTML page following the `verify-page.js` pattern (template literal, inline styles, design system values)

    `POST /v1/notifications/unsubscribe` (unauthenticated):
    - Request body: `application/x-www-form-urlencoded` with `List-Unsubscribe=One-Click` (RFC 8058)
    - Token from query parameter `?token=...`
    - Verify HMAC, then update notification_preferences to disable the specified event type
    - Returns 200 with HTML confirmation for both valid and invalid tokens
    - Idempotent -- unsubscribing twice is a no-op

    **Route registration**: Add OUTSIDE the session-gated prefix (unauthenticated):
    ```js
    ['GET',    /^\/v1\/notifications\/unsubscribe$/, handleGetUnsubscribe],
    ['POST',   /^\/v1\/notifications\/unsubscribe$/, handlePostUnsubscribe],
    ```

    Rate-limit the unsubscribe endpoint using the existing `AUTH_RATE_LIMITER` binding (10 req/min per IP). Add it to the rate limit group check in `getRateLimitGroup()` in `src/index.js`.

    **Log the unsubscribe event** using the established pattern:
    ```js
    ctx.waitUntil(log(env, 3, 'email', { event: 'email.unsubscribe', tenantId, notificationType }) ?? Promise.resolve());
    ```
    Never log the email address.

    ### Part E: Tests

    Write tests in `test/notifications.test.js` covering:
    - GET returns defaults when no preferences row exists
    - PUT creates row on first update
    - PUT partial update (email only, notifications only, both)
    - PUT validates email format (rejects CRLF, rejects overlong, rejects missing @)
    - PUT rejects unknown notification types
    - PUT rejects unknown top-level fields
    - Unsubscribe token round-trip (generate, verify)
    - Unsubscribe token rejects tampered payload
    - Unsubscribe token rejects tampered signature
    - Unsubscribe token rejects session cookie values (purpose prefix check)
    - GET /unsubscribe returns HTML page (does not modify DB)
    - POST /unsubscribe modifies DB for valid token
    - POST /unsubscribe returns 200 for invalid token (no leakage)

    Follow the test patterns in `test/account-usage.test.js` and `test/webhook-crud.test.js` (same miniflare setup, same assertion style).

    ### Constraints
    - Do NOT implement email sending, templates, or the dispatch pipeline (that is a separate task)
    - Do NOT implement email verification flow (sending verification emails) -- that depends on the email dispatch pipeline
    - Do NOT add a notification_log or delivery status table (YAGNI -- Coralogix logs cover this)
    - Do NOT store notification preferences as a JSON blob on the tenants table
    - Do NOT add `user:email` OAuth scope changes (separate task)
    - Use `import { escapeHtml } from './verify-page.js'` for HTML escaping in the unsubscribe page -- we will extract it to a shared module later if needed
    - All code in plain JavaScript (no TypeScript), following existing style
    - Every catch block must log or handle a specific error -- no silent catches

- **Deliverables**: `migrations/0014_notification_preferences.sql`, additions to `src/db.js`, `src/notifications.js`, `src/unsubscribe.js`, route additions in `src/index.js`, `test/notifications.test.js`
- **Success criteria**: All new tests pass. GET/PUT /v1/account/notifications works end-to-end with session auth. Unsubscribe token round-trip works. Rate limiting applied to unsubscribe endpoint.

---

### Task 2: Email Templates and Dispatch Pipeline
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Email Templates and Dispatch Pipeline (Resend Integration)

    You are building the email template system and the dispatch-to-delivery pipeline for WRL's notification system. This is a Cloudflare Workers project. Follow the existing patterns exactly -- study `src/webhook-dispatch.js` for the queue dispatch pattern and `src/verify-page.js` for HTML template patterns.

    ### Part A: Email Design Tokens

    Create `src/email/email-tokens.js` -- a module exporting brand constants as plain strings for inline CSS in emails. Email clients strip `<style>` blocks and do not support CSS custom properties. All styles must be inlined.

    Extract the hex values from `src/design-system.css` (read it to get the exact values). Export an object:
    ```js
    export const EMAIL = {
      colorText: '#1e2a36',      // verify from design-system.css
      colorTextMuted: '#6e6a66',
      colorBg: '#f7f6f5',
      colorSurface: '#ffffff',
      colorBorder: '#dddbd8',
      colorPrimary: '#2a3444',
      colorPrimaryText: '#f8f8fa',
      colorAccent: '#3d7c9a',
      colorError: '#c62828',
      colorErrorBg: '#ffebee',
      colorWarning: '#e6a817',
      colorWarningBg: '#fff8e1',
      colorSuccess: '#2e7d32',
      colorSuccessBg: '#e8f5e9',
      fontSans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      fontMono: "Menlo, Consolas, 'Courier New', monospace",
      maxWidth: '600px',
      borderRadius: '4px',
    };
    ```

    ### Part B: Shared Email Layout

    Create `src/email/email-layout.js` -- a function that wraps body HTML in a complete email document. This handles ALL the email client quirks in one place:

    - DOCTYPE, `<html lang="en">` with Outlook XML namespaces
    - `<meta name="x-apple-disable-message-reformatting">` for Apple Mail
    - `<meta name="color-scheme" content="light">` (light mode only -- dark mode in email is fragile)
    - MSO conditional comments for Outlook font stacks
    - Outer table for background, inner table for 600px container
    - Header: "Web Resource Ledger" text (no image/logo)
    - Content card: white background with border, body content injected here
    - Footer: "Web Resource Ledger - Gerhard Benjamin Peter - Marburg, Germany", unsubscribe link, website link
    - Hidden preheader div for inbox preview text

    Function signature: `emailLayout({ bodyHtml, unsubscribeUrl, preheaderText })`

    Use `<table role="presentation">` for ALL layout (no div-based layout). All styles inline. No CSS custom properties, no calc(), no rem units. Use px throughout.

    Import `escapeHtml` from `../verify-page.js` for escaping the unsubscribe URL and preheader text.

    ### Part C: Six Email Templates

    Create one module per notification type in `src/email/templates/`. Each exports a function that takes a data object and returns `{ html, text, subject }`.

    **Template modules:**

    1. `src/email/templates/capture-failure.js`
       - Data: `{ url, errorCategory, failedAt, captureDetailUrl, unsubscribeUrl }`
       - Subject: `Capture failed: {url}`
       - Alert style with error color accent
       - CTA button: "View Capture Details" linking to captureDetailUrl

    2. `src/email/templates/approaching-limit.js`
       - Data: `{ used, limit, period, addPaymentUrl, unsubscribeUrl }`
       - Subject: `Approaching free capture limit ({used}/{limit})`
       - Warning style with warning color accent
       - CTA button: "Add Payment Method"

    3. `src/email/templates/limit-reached.js`
       - Data: `{ used, limit, period, addPaymentUrl, unsubscribeUrl }`
       - Subject: `Free capture limit reached`
       - Error style, more urgent than approaching-limit
       - CTA button: "Add Payment Method"

    4. `src/email/templates/invoice-generated.js`
       - Data: `{ amountFormatted, currency, period, portalUrl, unsubscribeUrl }`
       - Subject: `Invoice generated: {amountFormatted}`
       - Info style
       - CTA button: "View Invoice"

    5. `src/email/templates/payment-failure.js`
       - Data: `{ gracePeriodEnd, portalUrl, unsubscribeUrl }`
       - Subject: `Payment failed -- action required`
       - Error style, urgent
       - CTA button: "Update Payment Method"

    6. `src/email/templates/weekly-digest.js`
       - Data: `{ periodStart, periodEnd, schedules: [{ url, total, succeeded, failed }], dashboardUrl, unsubscribeUrl }`
       - Subject: `Weekly capture digest: {periodStart} - {periodEnd}`
       - Info style with a table showing schedule results
       - Cap at 20 schedules, include "View all in dashboard" link if more
       - CTA button: "Open Dashboard"

    **Template rules:**
    - HTML and plain text are built independently from the same data -- do NOT strip HTML to make plain text
    - Plain text: key-value pairs, blank lines between sections, URLs written out, unsubscribe link at bottom
    - All user-provided data (URLs, error categories) must be HTML-escaped in the HTML version
    - CTA buttons built as table-based buttons (not styled `<a>` tags) for Outlook compatibility
    - Every template includes a preheader appropriate to the notification
    - No images -- text and colors only
    - Keep total HTML under 80KB (Gmail clips at 102KB)

    ### Part D: Email Dispatch Module

    Create `src/email-dispatch.js` following the `src/webhook-dispatch.js` pattern exactly. Three exported functions:

    **`dispatchNotification(env, tenantId, eventType, templateData)`**:
    1. Query notification_preferences: check email_verified=1 AND notify_{eventType}=1
    2. If email not configured/verified or type opted out: log `email.dispatch_suppressed` with suppressionReason and return
    3. For threshold notifications (approaching_limit, limit_reached): check notification_sent table for dedup. If already sent for this period, log suppressed and return
    4. For capture_failure: check KV cooldown (`email_cf:{tenantId}`, 5-minute window). If >3 failures in window, suppress individual email (a digest will be sent at window end). Log suppressed with reason 'cooldown'
    5. Build email payload: render the template, generate unsubscribe token (import from `src/unsubscribe.js`)
    6. Enqueue to EMAIL_QUEUE: `{ tenantId, notificationType, to, subject, html, text, unsubscribeUrl }`
    7. For threshold notifications: insert notification_sent row BEFORE returning (pre-enqueue dedup)
    8. Log `email.dispatch` with tenantId, notificationType, and correlation context (captureId, stripeEventId, period as applicable)

    **`handleEmailMessage(msg, env, ctx)`** (queue consumer):
    1. POST to `https://api.resend.com/emails` with direct fetch (NO Resend SDK):
       ```js
       const res = await fetch('https://api.resend.com/emails', {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${env.RESEND_API_KEY}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({
           from: 'WRL <notifications@webresourceledger.com>',
           to: [msg.body.to],
           subject: msg.body.subject,
           html: msg.body.html,
           text: msg.body.text,
           headers: {
             'List-Unsubscribe': `<${msg.body.unsubscribeUrl}>`,
             'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
           },
         }),
       });
       ```
    2. On 2xx: ack, log `email.send` with emailId (from Resend response), durationMs
    3. On 422/400 (permanent failure -- invalid address, bad params): ack, log `email.send_fail` with httpStatus, errorCategory. Do NOT retry.
    4. On 401/403 (API key issue): ack, log `email.send_fail` at severity 5. Do NOT retry (config error).
    5. On 429: msg.retry() with backoff, log `email.send_fail` with retryDelaySeconds
    6. On 5xx: msg.retry() with backoff, log `email.send_fail`
    7. On network error (fetch throws): msg.retry(), log `email.send_fail`

    Error classification: follow the `classifyDeliveryError` pattern from webhook-dispatch.js. Categorize into safe buckets (http_4xx, http_5xx, timeout, etc.) -- never log raw Resend error strings.

    **`handleEmailDlqMessage(msg, env, ctx)`** (DLQ consumer):
    - Log `email.send_dlq` at severity 5 with tenantId, notificationType, totalAttempts
    - Ack

    Retry delay schedule (matching webhooks): [60, 300, 900] seconds for attempts 1-3.

    All `dispatchNotification` calls at trigger points MUST be wrapped in `ctx.waitUntil()` and MUST NOT throw (try/catch with logging, same as dispatchWebhooks).

    ### Part E: Queue Configuration in wrangler.toml

    Add to `wrangler.toml` (production):
    ```toml
    # Email delivery queue -- one message per notification.
    # max_concurrency = 5 respects Resend's 5 req/s rate limit.
    [[queues.producers]]
    binding = "EMAIL_QUEUE"
    queue = "wrl-emails"

    [[queues.consumers]]
    queue = "wrl-emails"
    max_batch_size = 1
    max_batch_timeout = 5
    max_retries = 3
    dead_letter_queue = "wrl-emails-dlq"
    max_concurrency = 5

    [[queues.producers]]
    binding = "EMAIL_DLQ"
    queue = "wrl-emails-dlq"

    [[queues.consumers]]
    queue = "wrl-emails-dlq"
    max_batch_size = 1
    max_batch_timeout = 30
    max_retries = 0
    ```

    Add staging equivalents (wrl-emails-staging, wrl-emails-staging-dlq) with max_concurrency = 2.

    Add secret comment:
    ```toml
    # Email sending (set via wrangler secret put):
    #   RESEND_API_KEY -- Resend API key for transactional email delivery
    ```

    ### Part F: Wire Queue Consumer in index.js

    Add email queue routing to the `queue()` handler in `src/index.js`:
    ```js
    if (q.includes('emails')) {
      if (q.endsWith('-dlq')) {
        await handleEmailDlqMessage(msg, env, ctx);
      } else {
        await handleEmailMessage(msg, env, ctx);
      }
    } else if (q.includes('webhooks')) {
      // ...existing...
    }
    ```

    Add the import for handleEmailMessage, handleEmailDlqMessage from email-dispatch.js.

    ### Part G: Tests

    Write `test/email-dispatch.test.js` following the patterns in `test/webhook-dispatch.test.js`:
    - dispatchNotification skips when email not verified
    - dispatchNotification skips when notification type opted out
    - dispatchNotification skips when already sent for period (dedup)
    - dispatchNotification enqueues when all checks pass
    - handleEmailMessage acks on 2xx
    - handleEmailMessage acks without retry on 422 (permanent failure)
    - handleEmailMessage retries on 429
    - handleEmailMessage retries on 5xx
    - handleEmailDlqMessage logs and acks

    Write `test/email-templates.test.js`:
    - Each template returns { html, text, subject }
    - HTML contains required elements (h1, CTA link, unsubscribe link)
    - HTML escapes user-provided data (test with `<script>` in URL)
    - Plain text includes all key data points
    - Plain text includes unsubscribe URL

    ### Constraints
    - Do NOT add the Resend npm package -- use direct fetch()
    - Do NOT implement email verification sending (that requires the dispatch pipeline to already be deployed and working)
    - Do NOT create a notification_log table for delivery status tracking (YAGNI -- logs-only)
    - Do NOT implement Resend bounce webhooks (out of scope for R36)
    - NEVER log email addresses -- log tenantId only
    - Every catch block must log or handle a specific error -- no silent catches
    - All code in plain JavaScript, following existing style

- **Deliverables**: `src/email/email-tokens.js`, `src/email/email-layout.js`, `src/email/templates/*.js` (6 files), `src/email-dispatch.js`, queue additions in `wrangler.toml`, queue routing in `src/index.js`, `test/email-dispatch.test.js`, `test/email-templates.test.js`
- **Success criteria**: All tests pass. Templates render valid HTML with escaped user input. Dispatch pipeline correctly checks preferences, dedup, and cooldown before enqueuing. Queue consumer handles all Resend response codes correctly.

---

### Task 3: Integration -- Wire Notification Triggers into Capture and Billing Paths
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Wire Notification Triggers into Capture and Billing Paths

    You are adding `dispatchNotification()` calls at the six trigger points in the existing codebase. The dispatch function and templates already exist (from prior tasks). Your job is purely integration -- adding calls at the right places.

    Study the existing `dispatchWebhooks()` calls in `src/index.js` and `src/billing.js` to understand the pattern. Every notification dispatch must be wrapped in `ctx.waitUntil()` and must not throw.

    ### 3a. Capture Failure Notifications

    **Trigger points** (study `src/index.js` -- the capture failure and DLQ paths):
    - When a capture reaches terminal failure in the queue consumer (same place where `dispatchWebhooks(env, tenantId, 'capture.failed', ...)` is called)
    - When a capture exhausts retries and enters DLQ (same place)

    Add alongside the existing webhook dispatch:
    ```js
    ctx.waitUntil(dispatchNotification(env, tenantId, 'capture_failure', {
      url: captureRecord.url,
      errorCategory: captureRecord.error,
      failedAt: new Date().toISOString(),
      captureDetailUrl: `https://api.webresourceledger.com/v1/captures/${captureRecord.id}`,
    }).catch(() => {}));
    ```

    The capture failure rate-limiting (KV cooldown, max 3 then digest) is handled inside `dispatchNotification` -- you do not need to implement it here.

    ### 3b. Approaching Free Limit (80%)

    **Trigger point**: `src/index.js` after `incrementUsage()` returns the new capture count, when the capture has succeeded.

    After a successful capture increment, check:
    ```js
    const FREE_LIMIT = 200;
    const THRESHOLD = Math.floor(FREE_LIMIT * 0.8); // 160
    if (captureCount >= THRESHOLD && captureCount < FREE_LIMIT) {
      // Only for free-tier tenants (no billing set up)
      ctx.waitUntil(dispatchNotification(env, tenantId, 'approaching_limit', {
        used: captureCount,
        limit: FREE_LIMIT,
        period: computePeriod(),
        addPaymentUrl: 'https://api.webresourceledger.com/ui#billing',
      }).catch(() => {}));
    }
    ```

    The `notification_sent` dedup inside dispatchNotification ensures this fires at most once per period.

    ### 3c. Free Limit Reached (100%)

    **Trigger point**: `src/index.js` when `checkQuota()` returns `{ allowed: false, reason: 'payment_required' }`, before returning the 402 response.

    ```js
    ctx.waitUntil(dispatchNotification(env, tenantId, 'limit_reached', {
      used: quotaResult.used,
      limit: quotaResult.limit,
      period: computePeriod(),
      addPaymentUrl: 'https://api.webresourceledger.com/ui#billing',
    }).catch(() => {}));
    ```

    ### 3d. Invoice Generated

    **Trigger point**: `src/billing.js` -- you need to add handling for the `invoice.finalized` Stripe event.

    Study the existing Stripe webhook handler pattern (`handleStripeWebhook` and the event dispatch). Add a new case:
    ```js
    case 'invoice.finalized': {
      const customerId = event.data.object.customer;
      const tenantId = await getTenantByStripeCustomerId(db, customerId);
      if (tenantId) {
        const invoice = event.data.object;
        ctx.waitUntil(dispatchNotification(env, tenantId, 'invoice_generated', {
          amountFormatted: (invoice.amount_due / 100).toFixed(2),
          currency: invoice.currency.toUpperCase(),
          period: computePeriod(),
          portalUrl: 'https://api.webresourceledger.com/ui#billing',
        }).catch(() => {}));
      }
      break;
    }
    ```

    Check if `getTenantByStripeCustomerId` exists in db.js. If not, add it (simple SELECT from tenants WHERE stripe_customer_id = ?).

    ### 3e. Payment Failure

    **Trigger point**: `src/billing.js` in `handleInvoicePaymentFailed()` (look for the existing handler).

    Add after the `setBillingStatus()` call:
    ```js
    ctx.waitUntil(dispatchNotification(env, tenantId, 'payment_failure', {
      gracePeriodEnd: gracePeriodEnd.toISOString(),
      portalUrl: 'https://api.webresourceledger.com/ui#billing',
    }).catch(() => {}));
    ```

    ### 3f. Weekly Schedule Digest

    **Trigger point**: `src/index.js` in the `scheduled()` handler (study the existing cron routing).

    Add a weekly trigger: Monday 9:00 UTC.
    ```js
    // In the scheduled() handler, alongside existing cron checks:
    const d = new Date(controller.scheduledTime);
    if (d.getUTCDay() === 1 && d.getUTCHours() === 9 && d.getUTCMinutes() === 0) {
      ctx.waitUntil(handleWeeklyDigest(env, ctx));
    }
    ```

    Create `handleWeeklyDigest(env, ctx)` in `src/notifications.js` (or add to the existing file):
    1. Query all tenants with active schedules AND notify_weekly_digest = 1 AND email_verified = 1
    2. For each tenant: query schedule execution results for the past 7 days (look at the schedules/captures tables for the right join)
    3. Build digest data: `{ periodStart, periodEnd, schedules: [{ url, total, succeeded, failed }] }`
    4. Call dispatchNotification for each tenant
    5. Use notification_sent dedup with ISO week period (e.g., '2026-W13')

    ### 3g. OAuth Scope Change for Email Auto-Population

    **In `src/oauth.js`**: Change `scope: 'read:user'` to `scope: 'read:user user:email'`.

    In the OAuth callback handler, after fetching `/user`, also fetch `https://api.github.com/user/emails` with the access token:
    ```js
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'WRL' },
    });
    const emails = await emailsRes.json();
    const primaryEmail = emails.find(e => e.primary && e.verified);
    ```

    On new user creation: if primaryEmail exists, insert a notification_preferences row with `email = primaryEmail.email`, `email_source = 'github'`, `email_verified = 1`.

    On returning user login: if the notification_preferences row has `email_source = 'github'` and primaryEmail differs, update the email (keep email_verified = 1 since GitHub verified it). Do NOT overwrite if `email_source = 'manual'`.

    If GitHub returns no primary verified email (rare), set email to null.

    ### Tests

    Add tests to `test/notifications.test.js` (extend the file from Task 1) or create `test/notification-triggers.test.js`:
    - Capture failure dispatches notification (mock dispatchNotification, verify it was called with correct args)
    - Approaching limit dispatches at 80% threshold
    - Approaching limit does NOT dispatch below threshold
    - Limit reached dispatches on 402
    - Invoice generated dispatches on invoice.finalized Stripe event
    - Payment failure dispatches on invoice.payment_failed
    - Weekly digest queries correct tenants and dispatches

    ### Constraints
    - Do NOT modify the email templates or dispatch logic -- only add trigger calls
    - Do NOT modify the unsubscribe endpoint
    - Do NOT add Resend bounce webhook handling
    - All dispatchNotification calls MUST be wrapped in ctx.waitUntil() and MUST have a .catch(() => {}) to prevent unhandled rejections from crashing the handler
    - Follow existing code style exactly
    - NEVER log email addresses

- **Deliverables**: Integration changes in `src/index.js`, `src/billing.js`, `src/oauth.js`, new `handleWeeklyDigest` function, `test/notification-triggers.test.js`
- **Success criteria**: All six notification types have correct trigger points. dispatchNotification is called with correct data. All triggers are wrapped in ctx.waitUntil with .catch. OAuth scope includes user:email. Tests verify trigger conditions.

---

### Task 4: Notification Preferences UI Tab
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Notification Preferences UI Tab

    Add a "Notifications" tab to the WRL web dashboard for managing email notification preferences. Study the existing UI architecture before starting.

    ### Existing UI Architecture

    The WRL dashboard is a single-page app built with vanilla JS -- NO frameworks. Study these files:
    - `src/ui/ui-shell.js` -- the main shell that renders tabs
    - `src/ui/ui-billing.js` -- the Billing tab (most recent tab addition, best pattern to follow)
    - `src/ui/ui-settings.js` -- the Settings tab (shows toggle patterns)
    - `src/design-system.css` -- CSS custom properties for styling (use these in the UI, NOT the email token values)
    - `src/design-system.js` -- JS-side design system

    ### Implementation

    Create `src/ui/ui-notifications.js` following the exact patterns from the existing tabs:

    **Tab content:**
    1. **Email address section**: Shows current email (from GET /v1/account/notifications response). If no email: show input field with "Add your email to receive notifications" prompt. If email exists but not verified: show it with a "Not verified" badge. If verified: show with a "Verified" badge.
    2. **Notification toggles**: One toggle per notification type with description. Each toggle calls PUT /v1/account/notifications with the changed value. The toggle labels and descriptions:
       - Capture failures: "Get notified when a web capture fails"
       - Approaching limit: "Warning when nearing your free capture limit"
       - Limit reached: "Alert when your free capture limit is reached"
       - Invoice generated: "Notification when a new invoice is created"
       - Payment failure: "Alert when a payment attempt fails"
       - Weekly digest: "Weekly summary of your scheduled captures"
    3. **Email change**: An "Edit" button next to the email that reveals an input. On save, calls PUT with the new email. Shows feedback: "Verification email sent" (even though we don't implement email verification sending yet -- the UI can show the message; the backend resets emailVerified on change).

    **API calls**: Use `fetch()` to `/v1/account/notifications` with credentials: 'include' and the X-WRL-CSRF header (study how ui-settings.js does CSRF-protected mutations).

    **Register the tab** in `src/ui/ui-shell.js` following the pattern used for Billing and Settings tabs.

    ### Tests

    Add `test/ui-notifications.test.js` following the pattern in `test/ui-billing.test.js` or `test/ui-settings-usage.test.js`:
    - Tab renders with default preferences (all toggles on)
    - Tab shows "add email" prompt when email is null
    - Tab shows "not verified" badge when emailVerified is false
    - Toggle calls PUT with correct payload

    ### Constraints
    - Vanilla JS only -- NO React, NO framework, NO build step
    - Use CSS custom properties from design-system.css (NOT the email token values)
    - Follow the exact tab registration pattern from ui-shell.js
    - The UI file should export a function matching the pattern of the other tab modules
    - Do NOT implement email verification UI flow beyond showing the badge

- **Deliverables**: `src/ui/ui-notifications.js`, tab registration in `src/ui/ui-shell.js`, `test/ui-notifications.test.js`
- **Success criteria**: Notifications tab renders in the dashboard. Email address display and edit works. Toggles update preferences via API. Tests pass.

---

### Task 5: Observability -- Alerts, Log PII Guard, and Documentation
- **Agent**: observability-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Observability -- Alerts, Log PII Guard, and Operational Documentation

    You are adding observability infrastructure for the new email notification system. The logging statements themselves are already placed by the implementation tasks. Your job is the supporting infrastructure.

    ### Part A: Log PII Guard Update

    Update `src/log.js` header comment to add `email` to the NEVER LOG list. The existing comment block (lines ~21-27) lists fields that must never appear in logs. Add `email addresses` to this list.

    Study the existing NEVER LOG list and add `email addresses` in the same style.

    ### Part B: Coralogix Alerts

    Add two new alert definitions to `scripts/provision-alerts.sh` (study the existing alert definitions for the exact format):

    **Alert 1: [WRL] Email Delivery Failures**
    - Query: `event:"email.send_fail"` in app: wrl, subsystem: email
    - Threshold: > 5 events in 30 minutes
    - Priority: P2 (Medium)
    - Retriggering: 60-minute suppression

    **Alert 2: [WRL] Email Bounces**
    - Query: `event:"email.bounce" AND bounceType:"hard"` in app: wrl, subsystem: email
    - Threshold: > 3 events in 24 hours
    - Priority: P3 (Low)
    - Retriggering: 24-hour suppression

    ### Part C: Alert Documentation

    Update `docs/operations/alerts.md` (if it exists; create it following the existing docs patterns if not) with the two new alerts. Follow the existing alert documentation format.

    ### Constraints
    - Do NOT create runbooks (YAGNI at current scale -- we have <10 tenants)
    - Do NOT add an audit-log-schema documentation file (YAGNI)
    - Do NOT modify the actual logging calls in email-dispatch.js (those are already placed by Task 2)
    - Keep it minimal and lean

- **Deliverables**: Updated `src/log.js` header comment, alert definitions in `scripts/provision-alerts.sh`, alert docs
- **Success criteria**: Email addresses are explicitly listed in the NEVER LOG guard. Alert definitions follow the existing format and would fire on the specified conditions.

---

### Cross-Cutting Coverage

- **Testing**: Covered by tests in Tasks 1-4 (unit + integration). Phase 6 post-execution handles full test suite execution.
- **Security**: Covered within Task 1 (HMAC tokens, email validation, rate limiting on unsubscribe, PII guard). Task 2 covers never-log-email in dispatch. Phase 3.5 architecture review includes security-minion for full audit.
- **Usability -- Strategy**: Phase 3.5 review by ux-strategy-minion covers the opt-out model, notification type naming, unsubscribe UX, and cognitive load of the preferences UI.
- **Usability -- Design**: Task 4 (UI tab). Phase 3.5 review includes ux-design-minion for the email template visual design and the preferences UI.
- **Documentation**: Phase 8 post-execution handles documentation updates. Task 5 covers operational docs.
- **Observability**: Task 5 covers alerts and PII guard. Logging statements placed in Task 2 (dispatch pipeline). Phase 3.5 review by observability-minion not needed separately -- the plan already incorporates their recommendations.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - **ux-design-minion**: Plan includes Task 2 (email templates) and Task 4 (notification preferences UI) -- both produce user-facing interfaces.
    Review focus: Email template visual hierarchy, CTA button design, alert vs info color usage, notification preferences toggle layout.
- **Not selected**:
  - **accessibility-minion**: Email templates use semantic HTML, role="presentation" on layout tables, and sufficient contrast. The UI tab follows existing dashboard patterns that have already been reviewed. Low marginal value for this scope.
  - **sitespeed-minion**: No web-facing pages affected (email templates are rendered server-side, UI tab is a lightweight addition to existing SPA). No performance budget concern.
  - **observability-minion**: Their full recommendations are already incorporated into the plan (7 log events, 2 alerts, logs-only delivery tracking, correlation strategy). No additional review needed.
  - **user-docs-minion**: No external user documentation exists for WRL yet. The notification preferences UI is self-explanatory. Documentation for the API endpoints is handled by Phase 8 post-execution.

### Decisions

- **D1 schema: columns vs JSON blob for notification preferences**
  Chosen: Individual boolean columns per notification type (api-design-minion's recommendation)
  Over: JSON array (security-minion's `categories TEXT` approach) or JSON blob on tenants table
  Why: Columns enable efficient D1 queries for fan-out (`WHERE notify_capture_failure = 1 AND email_verified = 1`), provide explicit CHECK constraints, and support simple ALTER TABLE for adding new types. api-design-minion's analysis of the query patterns was more thorough.

- **Unsubscribe token expiry: 90 days vs no expiry**
  Chosen: No expiry (security-minion's recommendation)
  Over: 90-day expiry (api-design-minion's recommendation)
  Why: CAN-SPAM requires unsubscribe links to work for 30+ days. There is no business reason to expire them. An old email's unsubscribe link should always work. Removing expiry simplifies the token and avoids the edge case of "expired but user wants to unsubscribe."

- **Email delivery tracking: D1 table vs logs-only**
  Chosen: Logs-only via Coralogix (observability-minion's recommendation)
  Over: D1 notification_log table
  Why: YAGNI. No tenant-facing API reads delivery status. The webhook system already proves logs-only delivery tracking works. Adding D1 writes for ephemeral operational data doubles write load for a feature with no reader.

- **Resend bounce webhook handling: in-scope vs out-of-scope**
  Chosen: Out of scope for R36
  Over: Implementing inbound Resend webhook endpoint for bounce notifications
  Why: Adds a new unauthenticated inbound surface that needs signature verification, event dedup, and a new queue or handler. At current scale (<10 tenants), bounce volume is negligible. The `email.send_fail` event on 422 responses covers the most common permanent failure case. Track bounce handling as a future enhancement.

### Risks and Mitigations

1. **Resend free tier daily limit (100/day) is too tight for production.** At scale, weekly digests + operational emails could exceed this. **Mitigation**: Budget $20/month for Resend Pro from production launch. Use free tier only for development/staging. **Owner**: Manual provisioning step.

2. **Domain verification (SPF/DKIM/DMARC) is a blocking prerequisite.** Sending domain `webresourceledger.com` must be verified in Resend before any email can be sent. This is a manual DNS step outside the scope of code delivery. **Mitigation**: Document as a deployment prerequisite. Domain verification must happen before the feature goes live.

3. **OAuth scope change requires re-login.** Existing users will not have their email auto-populated until their next OAuth login. **Mitigation**: The UI shows "Add your email" prompt when email is null, providing a manual fallback.

4. **Capture failure email flooding.** A tenant with many scheduled captures targeting a down server could trigger dozens of failure notifications. **Mitigation**: Per-tenant per-type KV cooldown (5-minute window, max 3 individual emails then digest) built into `dispatchNotification`.

5. **No account deletion endpoint exists.** Email addresses are PII with GDPR right-to-erasure obligations, but no user-facing delete flow exists. **Mitigation**: `deleteNotificationPreferences()` function is implemented for programmatic use. Account deletion endpoint tracked as separate backlog item. This is a pre-existing gap.

6. **SESSION_SECRET rotation invalidates all unsubscribe tokens.** If the secret is rotated, old email unsubscribe links stop working (the endpoint returns success but no DB update occurs). **Mitigation**: Acceptable risk -- secret rotation is rare, users can re-unsubscribe via dashboard. If needed later, multi-key verification (check previous secret too) can be added.

### Execution Order

```
Batch 1 (parallel):
  Task 1: D1 Schema + Preferences API + Unsubscribe Endpoint  [GATE]

Batch 2 (parallel, after Task 1 gate approval):
  Task 2: Email Templates + Dispatch Pipeline
  Task 4: Notification Preferences UI Tab

Batch 3 (after Task 2):
  Task 3: Integration -- Wire Notification Triggers
  Task 5: Observability -- Alerts + PII Guard

Post-execution:
  Phase 5: Code Review (code-review-minion, lucy, margo)
  Phase 6: Test Execution
  Phase 8: Documentation
```

### Verification Steps

1. All existing tests pass (no regressions)
2. All new tests pass (notifications API, unsubscribe tokens, email templates, dispatch pipeline, triggers, UI)
3. Manual verification: create a session, GET /v1/account/notifications returns defaults, PUT updates preferences correctly
4. Manual verification: generate an unsubscribe token, visit the GET endpoint (confirms it renders a page), POST the token (confirms it updates preferences)
5. Manual verification: the Notifications tab renders in the dashboard and toggles work
6. Queue configuration: `wrangler queues list` shows the new email queues after deployment
7. Domain verification: Resend dashboard confirms webresourceledger.com is verified (manual, pre-deployment)
